const path = require('path');

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  pingInterval: parseInt(process.env.PING_INTERVAL, 10) || 60000, // 1 minute default
  retentionDays: parseInt(process.env.RETENTION_DAYS, 10) || 30, // 30 days default
  
  // MongoDB configuration
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ip-tracker',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },
  
  // SNMP configuration
  snmp: {
    port: 161,
    retries: 1,
    timeout: 5000,
    transport: 'udp4',
    version: 2 // SNMP version (1, 2c, or 3)
  },
  
  // Logger configuration
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    directory: path.join(__dirname, '../logs')
  },
  
  // Cache configuration (for performance optimization)
  cache: {
    maxItems: 1000,
    ttl: 300000 // 5 minutes
  }
};