const monitorService = require('../services/monitorService');
const { Host, StatusHistory, Downtime } = require('../models/host');
const logger = require('../utils/logger');

// Initialize monitoring
exports.initializeMonitoring = async (req, res) => {
  try {
    await monitorService.initializeMonitoring();
    res.json({ message: 'Monitoring initialized successfully' });
  } catch (err) {
    logger.error(`Error initializing monitoring: ${err.message}`);
    res.status(500).json({ error: 'Failed to initialize monitoring' });
  }
};

// Stop all monitoring
exports.stopAllMonitoring = async (req, res) => {
  try {
    monitorService.stopAllMonitoring();
    res.json({ message: 'All monitoring stopped successfully' });
  } catch (err) {
    logger.error(`Error stopping monitoring: ${err.message}`);
    res.status(500).json({ error: 'Failed to stop monitoring' });
  }
};

// Get system status (summary of all hosts)
exports.getSystemStatus = async (req, res) => {
  try {
    // Get all hosts and active downtimes
    const [hosts, downtimes] = await Promise.all([
      Host.find().select('name ipAddress status group lastCheck'),
      Downtime.find({ resolved: false }).populate('hostId', 'name ipAddress')
    ]);
    
    // Calculate statistics
    const stats = {
      total: hosts.length,
      up: hosts.filter(h => h.status === 'up').length,
      down: hosts.filter(h => h.status === 'down').length,
      unreachable: hosts.filter(h => h.status === 'unreachable').length,
      unknown: hosts.filter(h => h.status === 'unknown').length,
      activeDowntimes: downtimes.length
    };
    
    // Group hosts by status
    const byStatus = {
      up: hosts.filter(h => h.status === 'up'),
      down: hosts.filter(h => h.status === 'down'),
      unreachable: hosts.filter(h => h.status === 'unreachable'),
      unknown: hosts.filter(h => h.status === 'unknown')
    };
    
    // Group hosts by group
    const byGroup = {};
    hosts.forEach(host => {
      if (!byGroup[host.group]) {
        byGroup[host.group] = {
          total: 0,
          up: 0,
          down: 0,
          unreachable: 0,
          unknown: 0
        };
      }
      
      byGroup[host.group].total++;
      byGroup[host.group][host.status]++;
    });
    
    // Log statistics for debugging
    logger.debug('System Status:', {
      total: stats.total,
      up: stats.up,
      down: stats.down,
      unreachable: stats.unreachable,
      unknown: stats.unknown,
      activeDowntimes: stats.activeDowntimes
    });
    
    res.json({
      stats,
      byStatus,
      byGroup
    });
  } catch (err) {
    logger.error(`Error getting system status: ${err.message}`);
    res.status(500).json({ error: 'Failed to get system status' });
  }
};

// Get status history for a host
exports.getStatusHistory = async (req, res) => {
  try {
    const hostId = req.params.id;
    const { from, to, limit } = req.query;
    
    // Parse query parameters
    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24 hours
    const toDate = to ? new Date(to) : new Date();
    const recordLimit = limit ? parseInt(limit, 10) : 100; // Default: 100 records
    
    // Find days that fall within the range
    const days = [];
    const currDate = new Date(fromDate);
    while (currDate <= toDate) {
      days.push(new Date(currDate));
      currDate.setDate(currDate.getDate() + 1);
    }
    
    // Get status history for each day
    const dayQueries = days.map(day => {
      const dayStart = new Date(day);
      const dayEnd = new Date(day);
      dayEnd.setDate(dayEnd.getDate() + 1);
      
      return StatusHistory.findOne({
        hostId,
        day: {
          $gte: dayStart,
          $lt: dayEnd
        }
      }).select('statuses');
    });
    
    const results = await Promise.all(dayQueries);
    
    // Flatten the statuses arrays and filter by date range
    let allStatuses = [];
    results.forEach(result => {
      if (result && result.statuses) {
        allStatuses = allStatuses.concat(
          result.statuses.filter(s => 
            s.timestamp >= fromDate && s.timestamp <= toDate
          )
        );
      }
    });
    
    // Sort by timestamp and apply limit
    allStatuses.sort((a, b) => b.timestamp - a.timestamp);
    if (allStatuses.length > recordLimit) {
      allStatuses = allStatuses.slice(0, recordLimit);
    }
    
    res.json(allStatuses);
  } catch (err) {
    logger.error(`Error getting status history ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: 'Failed to get status history' });
  }
};

// Get downtime events
exports.getDowntimeEvents = async (req, res) => {
  try {
    // Get active downtimes (unresolved)
    const activeDowntimes = await Downtime.find({ resolved: false })
      .sort({ startTime: -1 })
      .populate('hostId', 'name ipAddress')
      .lean();

    // Get recent resolved downtimes (last 5)
    const recentDowntimes = await Downtime.find({ resolved: true })
      .sort({ startTime: -1 })
      .limit(5)
      .populate('hostId', 'name ipAddress')
      .lean();

    // Combine both arrays, with active downtimes first
    const allDowntimes = [...activeDowntimes, ...recentDowntimes];

    // Log the downtimes for debugging
    logger.debug('Active downtimes:', activeDowntimes.length);
    logger.debug('Recent resolved downtimes:', recentDowntimes.length);
    logger.debug('Total downtimes:', allDowntimes.length);

    res.json(allDowntimes);
  } catch (err) {
    logger.error(`Error getting downtime events: ${err.message}`);
    res.status(500).json({ error: 'Failed to get downtime events' });
  }
};

// Run data cleanup
exports.runCleanup = async (req, res) => {
  try {
    const result = await monitorService.cleanupOldData();
    res.json({
      message: 'Cleanup completed successfully',
      result
    });
  } catch (err) {
    logger.error(`Error running cleanup: ${err.message}`);
    res.status(500).json({ error: 'Failed to run cleanup' });
  }
};