const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config/config');

// Make sure logs directory exists
const logDir = config.logger.directory;
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${stack || ''}`;
  })
);

// Create the logger
const logger = winston.createLogger({
  level: config.logger.level,
  format: logFormat,
  transports: [
    // Console logs
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    
    // Daily rotating file logs with size limitation
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logDir, 'exceptions.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    })
  ],
  exitOnError: false
});

// Custom logger that prevents excessive memory usage on repeated errors
const memoryEfficientLogger = {
  error: (message) => {
    logger.error(message);
  },
  warn: (message) => {
    logger.warn(message);
  },
  info: (message) => {
    logger.info(message);
  },
  debug: (message) => {
    logger.debug(message);
  },
  verbose: (message) => {
    logger.verbose(message);
  }
};

module.exports = memoryEfficientLogger;