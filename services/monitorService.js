const ping = require('ping');
const snmp = require('net-snmp');
const net = require('net');
const { LRUCache } = require('lru-cache');
const { Host, StatusHistory, Downtime } = require('../models/host');
const logger = require('../utils/logger');
const config = require('../config/config');

// Initialize cache for performance optimization
const statusCache = new LRUCache({
  max: config.cache.maxItems,
  ttl: config.cache.ttl
});

// Active monitoring hosts and their timers
const activeMonitors = new Map();

// Initialize monitoring for all enabled hosts
async function initializeMonitoring() {
  try {
    // Clear existing monitors
    stopAllMonitoring();
    
    // Get all enabled hosts
    const hosts = await Host.find({ monitoringEnabled: true });
    logger.info(`Initializing monitoring for ${hosts.length} hosts`);
    
    // Start monitoring each host
    for (const host of hosts) {
      await startHostMonitoring(host);
    }
  } catch (err) {
    logger.error(`Error initializing monitoring: ${err.message}`);
    throw err; // Propagate error for proper handling
  }
}

// Start monitoring an individual host
async function startHostMonitoring(host) {
  try {
    // If already monitoring this host, stop it first
    if (activeMonitors.has(host._id.toString())) {
      await stopHostMonitoring(host._id);
    }
    
    // Validate host configuration
    if (!host.ipAddress || !host.checkInterval) {
      throw new Error(`Invalid host configuration for ${host.name}`);
    }
    
    // Create interval for host based on its check interval
    const interval = setInterval(async () => {
      try {
        await checkHostStatus(host._id);
      } catch (err) {
        logger.error(`Error in monitoring interval for host ${host._id}: ${err.message}`);
      }
    }, host.checkInterval);
    
    // Store the interval reference
    activeMonitors.set(host._id.toString(), interval);
    
    // Perform an immediate check
    await checkHostStatus(host._id);
    
    logger.debug(`Started monitoring host: ${host.name} (${host.ipAddress})`);
  } catch (err) {
    logger.error(`Error starting monitoring for host ${host._id}: ${err.message}`);
    throw err;
  }
}

// Stop monitoring a host
async function stopHostMonitoring(hostId) {
  const id = hostId.toString();
  if (activeMonitors.has(id)) {
    clearInterval(activeMonitors.get(id));
    activeMonitors.delete(id);
    logger.debug(`Stopped monitoring host: ${id}`);
    return true;
  }
  return false;
}

// Stop all monitoring activities
async function stopAllMonitoring() {
  const stopPromises = Array.from(activeMonitors.entries()).map(([id, interval]) => {
    clearInterval(interval);
    return stopHostMonitoring(id);
  });
  
  await Promise.all(stopPromises);
  activeMonitors.clear();
  logger.info('Stopped all monitoring activities');
}

// Check host status using appropriate method
async function checkHostStatus(hostId) {
  try {
    // Get fresh host data from database
    const host = await Host.findById(hostId);
    if (!host || !host.monitoringEnabled) {
      await stopHostMonitoring(hostId);
      return;
    }
    
    let result;
    switch (host.monitoringMethod) {
      case 'ping':
        result = await checkWithPing(host);
        break;
      case 'snmp':
        result = await checkWithSNMP(host);
        break;
      case 'tcp':
        result = await checkWithTCP(host);
        break;
      default:
        result = await checkWithPing(host);
    }
    
    // Update host with current status
    await updateHostStatus(host, result);
    
    // Update cache
    statusCache.set(hostId.toString(), result);
    
  } catch (err) {
    logger.error(`Error checking host ${hostId}: ${err.message}`);
    throw err;
  }
}

// Check host status using ICMP ping
async function checkWithPing(host) {
  try {
    const pingResult = await ping.promise.probe(host.ipAddress, {
      timeout: 10,
      extra: ['-n', '1', '-w', '5000'] // Windows-specific options: -n for count, -w for timeout in ms
    });
    
    // Log the raw ping result for debugging
    logger.debug(`Ping result for ${host.ipAddress}:`, pingResult);
    
    // Check if we got a valid response
    if (pingResult.alive) {
      return {
        status: 'up',
        responseTime: parseFloat(pingResult.time) || null,
        error: null
      };
    } else {
      // If not alive, check if we got any response at all
      if (pingResult.output && pingResult.output.includes('TTL=')) {
        // We got a response but it might have been too slow
        return {
          status: 'down',
          responseTime: null,
          error: 'Host responding but too slow'
        };
      } else {
        return {
          status: 'down',
          responseTime: null,
          error: 'No response from host'
        };
      }
    }
  } catch (err) {
    logger.error(`Ping error for host ${host.ipAddress}: ${err.message}`);
    return {
      status: 'unreachable',
      responseTime: null,
      error: err.message
    };
  }
}

// Check host status using SNMP
async function checkWithSNMP(host) {
  return new Promise((resolve) => {
    let session = null;
    const timeoutId = setTimeout(() => {
      if (session) {
        try {
          session.close();
        } catch (e) {
          // Session might already be closed
        }
      }
      resolve({
        status: 'down',
        responseTime: null,
        error: 'SNMP timeout'
      });
    }, config.snmp.timeout + 1000);

    try {
      const options = {
        port: host.port || 161,
        retries: config.snmp.retries || 1,
        timeout: config.snmp.timeout || 5000,
        transport: config.snmp.transport || 'udp4',
        version: host.snmpVersion === '1' ? snmp.Version1 : 
                 host.snmpVersion === '3' ? snmp.Version3 : 
                 snmp.Version2c
      };
      
      session = snmp.createSession(host.ipAddress, host.snmpCommunity, options);
      const oids = ['1.3.6.1.2.1.1.1.0']; // System description OID
      
      const startTime = Date.now();
      session.get(oids, (error, varbinds) => {
        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;
        
        try {
          session.close();
        } catch (e) {
          // Session might already be closed
        }
        
        if (error) {
          resolve({
            status: 'down',
            responseTime: null,
            error: error.toString()
          });
        } else {
          // Check for SNMP errors
          for (const vb of varbinds) {
            if (snmp.isVarbindError(vb)) {
              resolve({
                status: 'down',
                responseTime: null,
                error: snmp.varbindError(vb)
              });
              return;
            }
          }
          
          resolve({
            status: 'up',
            responseTime: responseTime,
            error: null
          });
        }
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (session) {
        try {
          session.close();
        } catch (e) {
          // Session might already be closed
        }
      }
      resolve({
        status: 'unreachable',
        responseTime: null,
        error: err.message
      });
    }
  });
}

// Check host status using TCP connection
async function checkWithTCP(host) {
  return new Promise((resolve) => {
    let socket = null;
    let resolved = false;
    const startTime = Date.now();
    
    const timeout = setTimeout(() => {
      if (!resolved && socket) {
        socket.destroy();
        resolved = true;
        resolve({
          status: 'down',
          responseTime: null,
          error: 'Connection timeout'
        });
      }
    }, 5000);
    
    try {
      socket = new net.Socket();
      
      socket.on('connect', () => {
        clearTimeout(timeout);
        if (!resolved) {
          socket.destroy();
          resolved = true;
          resolve({
            status: 'up',
            responseTime: Date.now() - startTime,
            error: null
          });
        }
      });
      
      socket.on('error', (err) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          resolve({
            status: 'down',
            responseTime: null,
            error: err.message
          });
        }
      });
      
      socket.connect(host.port || 80, host.ipAddress);
    } catch (err) {
      clearTimeout(timeout);
      if (socket) {
        socket.destroy();
      }
      if (!resolved) {
        resolved = true;
        resolve({
          status: 'unreachable',
          responseTime: null,
          error: err.message
        });
      }
    }
  });
}

// Update host status and record history
async function updateHostStatus(host, result) {
  const now = new Date();
  const prevStatus = host.status;
  const currentStatus = result.status;
  
  // Prepare status record
  const statusRecord = {
    timestamp: now,
    status: currentStatus,
    responseTime: result.responseTime,
    error: result.error
  };
  
  // Calculate day boundary for status history grouping
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  
  try {
    // Update status history
    await StatusHistory.updateOne(
      { hostId: host._id, day },
      { $push: { statuses: statusRecord } },
      { upsert: true }
    );
    
    // Handle status changes (up -> down or down -> up)
    if (prevStatus !== currentStatus) {
      // If previous status was 'up' and current is 'down', record downtime start
      if (prevStatus === 'up' && currentStatus === 'down') {
        // Check if there's already an unresolved downtime
        const existingDowntime = await Downtime.findOne({
          hostId: host._id,
          resolved: false
        });
        
        if (!existingDowntime) {
          await Downtime.create({
            hostId: host._id,
            startTime: now,
            resolved: false
          });
        }
        // Always update lastStatusChange when host goes down
        host.lastStatusChange = now;
      }
      
      // If previous status was 'down' and current is 'up', resolve downtime
      if (prevStatus === 'down' && currentStatus === 'up') {
        const downtimeRecord = await Downtime.findOne({ 
          hostId: host._id,
          resolved: false
        }).sort({ startTime: -1 });
        
        if (downtimeRecord) {
          const duration = now - downtimeRecord.startTime;
          downtimeRecord.endTime = now;
          downtimeRecord.duration = duration;
          downtimeRecord.resolved = true;
          await downtimeRecord.save();
          
          // Update total downtime for the host
          host.downtime += duration;
        }
        // Update lastStatusChange when host comes back up
        host.lastStatusChange = now;
      }

      // If status changes to or from unknown/unreachable, update lastStatusChange
      if (currentStatus === 'unknown' || currentStatus === 'unreachable' || 
          prevStatus === 'unknown' || prevStatus === 'unreachable') {
        host.lastStatusChange = now;
      }
    }
    
    // Update host record
    host.status = currentStatus;
    host.lastCheck = now;
    
    // Update uptime counter if host is up
    if (currentStatus === 'up' && host.lastStatusChange) {
      const upSince = prevStatus !== 'up' ? now : host.lastStatusChange;
      const uptimeToAdd = prevStatus === 'up' ? (now - host.lastCheck) : 0;
      host.uptime += uptimeToAdd;
    }
    
    await host.save();
    
    return host;
  } catch (err) {
    logger.error(`Error updating host status: ${err.message}`);
    throw err;
  }
}

// Get host status (with cache optimization)
async function getHostStatus(hostId) {
  // Try to get from cache first
  const cachedStatus = statusCache.get(hostId.toString());
  if (cachedStatus) {
    return cachedStatus;
  }
  
  // If not in cache, get from database
  try {
    const host = await Host.findById(hostId).select('status lastCheck');
    if (!host) return null;
    
    return {
      status: host.status,
      lastCheck: host.lastCheck
    };
  } catch (err) {
    logger.error(`Error getting host status: ${err.message}`);
    return null;
  }
}

// Get downtime statistics for a host
async function getDowntimeStats(hostId, startDate, endDate) {
  try {
    const query = { hostId };
    
    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) query.startTime.$gte = startDate;
      if (endDate) query.startTime.$lte = endDate;
    }
    
    const downtimes = await Downtime.find(query).sort({ startTime: 1 });
    
    let totalDowntime = 0;
    let count = 0;
    let longestDuration = 0;
    let longestDowntime = null;
    
    downtimes.forEach(downtime => {
      // Calculate duration for unresolved downtimes
      const duration = downtime.resolved ? 
        downtime.duration : 
        Date.now() - downtime.startTime;
        
      totalDowntime += duration;
      count++;
      
      if (duration > longestDuration) {
        longestDuration = duration;
        longestDowntime = downtime;
      }
    });
    
    return {
      count,
      totalDowntime,
      averageDowntime: count > 0 ? totalDowntime / count : 0,
      longestDowntime
    };
  } catch (err) {
    logger.error(`Error getting downtime stats: ${err.message}`);
    return null;
  }
}

// Clean up old monitoring data to prevent database bloat
async function cleanupOldData() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);
    
    // Delete old status history
    const statusResult = await StatusHistory.deleteMany({
      day: { $lt: cutoffDate }
    });
    
    // Clean up old resolved downtimes (keep unresolved ones)
    const downtimeResult = await Downtime.deleteMany({
      resolved: true,
      endTime: { $lt: cutoffDate }
    });
    
    logger.info(`Cleaned up old data: ${statusResult.deletedCount} status histories, ${downtimeResult.deletedCount} downtimes`);
    
    return {
      statusCount: statusResult.deletedCount,
      downtimeCount: downtimeResult.deletedCount
    };
  } catch (err) {
    logger.error(`Error cleaning up old data: ${err.message}`);
    return null;
  }
}

module.exports = {
  initializeMonitoring,
  startHostMonitoring,
  stopHostMonitoring,
  stopAllMonitoring,
  checkHostStatus,
  getHostStatus,
  getDowntimeStats,
  cleanupOldData
};