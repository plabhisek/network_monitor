const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Definition for individual status records
const StatusSchema = new Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  status: {
    type: String,
    enum: ['up', 'down', 'unreachable', 'unknown'],
    required: true
  },
  responseTime: {
    type: Number,
    min: 0
  },
  error: String
}, { _id: false });

// Schema for host configuration
const HostSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  ipAddress: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  group: {
    type: String,
    default: 'default',
    trim: true,
    index: true
  },
  monitoringEnabled: {
    type: Boolean,
    default: true
  },
  monitoringMethod: {
    type: String,
    enum: ['ping', 'snmp', 'tcp'],
    default: 'ping'
  },
  port: {
    type: Number,
    min: 1,
    max: 65535,
    default: 161 // Default SNMP port
  },
  snmpCommunity: {
    type: String,
    default: 'public'
  },
  snmpVersion: {
    type: String,
    enum: ['1', '2c', '3'],
    default: '2c'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  checkInterval: {
    type: Number,
    default: 60000, // Default: 1 minute
    min: 5000 // Minimum: 5 seconds
  },
  status: {
    type: String,
    enum: ['up', 'down', 'unreachable', 'unknown'],
    default: 'unknown'
  },
  lastCheck: {
    type: Date
  },
  uptime: {
    type: Number,
    default: 0
  },
  downtime: {
    type: Number,
    default: 0
  },
  lastStatusChange: {
    type: Date
  }
});

// Compound index for more efficient queries
HostSchema.index({ group: 1, status: 1 });

// Define a separate collection for historical status data
// This approach helps keep the main host document smaller and more efficient
const StatusHistorySchema = new Schema({
  hostId: {
    type: Schema.Types.ObjectId,
    ref: 'Host',
    required: true,
    index: true
  },
  statuses: [StatusSchema],
  day: {
    type: Date,
    required: true,
    index: true
  }
});

// Compound index for more efficient status history queries
StatusHistorySchema.index({ hostId: 1, day: 1 });

// Model for downtime events
const DowntimeSchema = new Schema({
  hostId: {
    type: Schema.Types.ObjectId,
    ref: 'Host',
    required: true,
    index: true
  },
  startTime: {
    type: Date,
    required: true,
    index: true
  },
  endTime: {
    type: Date,
    index: true
  },
  duration: {
    type: Number // Duration in milliseconds
  },
  resolved: {
    type: Boolean,
    default: false
  },
  notes: String
});

// Pre-save middleware to update timestamps
HostSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Host = mongoose.model('Host', HostSchema);
const StatusHistory = mongoose.model('StatusHistory', StatusHistorySchema);
const Downtime = mongoose.model('Downtime', DowntimeSchema);

module.exports = {
  Host,
  StatusHistory,
  Downtime
};