const { Host, StatusHistory, Downtime } = require('../models/host');
const monitorService = require('../services/monitorService');
const logger = require('../utils/logger');

// Get all hosts
exports.getAllHosts = async (req, res) => {
  try {
    const hosts = await Host.find().sort({ name: 1 });
    res.json(hosts);
  } catch (err) {
    logger.error(`Error fetching hosts: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch hosts' });
  }
};

// Get a single host by ID
exports.getHostById = async (req, res) => {
  try {
    const host = await Host.findById(req.params.id);
    if (!host) {
      return res.status(404).json({ error: 'Host not found' });
    }
    res.json(host);
  } catch (err) {
    logger.error(`Error fetching host ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch host' });
  }
};

// Create a new host
exports.createHost = async (req, res) => {
  try {
    const newHost = new Host(req.body);
    const savedHost = await newHost.save();
    
    // Start monitoring if enabled
    if (savedHost.monitoringEnabled) {
      monitorService.startHostMonitoring(savedHost);
    }
    
    res.status(201).json(savedHost);
  } catch (err) {
    logger.error(`Error creating host: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
};

// Update a host
exports.updateHost = async (req, res) => {
  try {
    const hostId = req.params.id;
    const hostData = req.body;
    
    // Find the host first to check if monitoring settings changed
    const currentHost = await Host.findById(hostId);
    if (!currentHost) {
      return res.status(404).json({ error: 'Host not found' });
    }
    
    // Update the host
    const updatedHost = await Host.findByIdAndUpdate(hostId, hostData, { new: true });
    
    // Handle monitoring changes
    const monitoringChanged = 
      currentHost.monitoringEnabled !== updatedHost.monitoringEnabled ||
      currentHost.checkInterval !== updatedHost.checkInterval ||
      currentHost.monitoringMethod !== updatedHost.monitoringMethod;
      
    if (monitoringChanged) {
      if (updatedHost.monitoringEnabled) {
        monitorService.startHostMonitoring(updatedHost);
      } else {
        monitorService.stopHostMonitoring(hostId);
      }
    }
    
    res.json(updatedHost);
  } catch (err) {
    logger.error(`Error updating host ${req.params.id}: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
};

// Delete a host
exports.deleteHost = async (req, res) => {
  try {
    const hostId = req.params.id;
    
    // Stop monitoring
    monitorService.stopHostMonitoring(hostId);
    
    // Delete the host and related data
    await Host.findByIdAndDelete(hostId);
    await StatusHistory.deleteMany({ hostId });
    await Downtime.deleteMany({ hostId });
    
    res.json({ message: 'Host deleted successfully' });
  } catch (err) {
    logger.error(`Error deleting host ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: 'Failed to delete host' });
  }
};

// Get host status
exports.getHostStatus = async (req, res) => {
  try {
    const hostId = req.params.id;
    const status = await monitorService.getHostStatus(hostId);
    
    if (!status) {
      return res.status(404).json({ error: 'Host not found' });
    }
    
    res.json(status);
  } catch (err) {
    logger.error(`Error getting host status ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: 'Failed to get host status' });
  }
};

// Get hosts by group
exports.getHostsByGroup = async (req, res) => {
  try {
    const group = req.params.group;
    const hosts = await Host.find({ group }).sort({ name: 1 });
    res.json(hosts);
  } catch (err) {
    logger.error(`Error fetching hosts by group ${req.params.group}: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch hosts' });
  }
};

// Get all available groups
exports.getAllGroups = async (req, res) => {
  try {
    const groups = await Host.distinct('group');
    res.json(groups);
  } catch (err) {
    logger.error(`Error fetching groups: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
};

// Force check host status
exports.checkHostStatus = async (req, res) => {
  try {
    const hostId = req.params.id;
    
    // Check if host exists
    const host = await Host.findById(hostId);
    if (!host) {
      return res.status(404).json({ error: 'Host not found' });
    }
    
    // Trigger status check
    monitorService.checkHostStatus(hostId);
    
    res.json({ message: 'Status check initiated' });
  } catch (err) {
    logger.error(`Error checking host status ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: 'Failed to initiate status check' });
  }
};

// Get host downtime statistics
exports.getHostDowntime = async (req, res) => {
  try {
    const hostId = req.params.id;
    const { start, end } = req.query;
    
    // Parse dates if provided
    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;
    
    const stats = await monitorService.getDowntimeStats(hostId, startDate, endDate);
    if (!stats) {
      return res.status(500).json({ error: 'Failed to get downtime statistics' });
    }
    
    res.json(stats);
  } catch (err) {
    logger.error(`Error getting downtime stats ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: 'Failed to get downtime statistics' });
  }
};