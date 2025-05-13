require('dotenv').config();
const express = require('express');
const { engine } = require('express-handlebars');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const morgan = require('morgan');
const path = require('path');
const cron = require('node-cron');

const logger = require('./utils/logger');
const config = require('./config/config');
const indexRoutes = require('./routes/index');
const apiRoutes = require('./routes/api');
const monitorService = require('./services/monitorService');

const app = express();

// Security middleware with CSP configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "cdnjs.cloudflare.com"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
}));
app.use(compression());

// Logging middleware
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// View engine setup
const handlebarsHelpers = require('./utils/handlebarsHelpers');
app.engine('handlebars', engine({
  helpers: handlebarsHelpers
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));
// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', indexRoutes);
app.use('/api', apiRoutes);

// Connect to MongoDB
mongoose.connect(config.mongodb.uri, config.mongodb.options)
  .then(() => {
    logger.info('Connected to MongoDB');
    
    // Start monitoring service after DB connection
    monitorService.initializeMonitoring();
    
    // Schedule cleanup job to run at midnight every day
    cron.schedule('0 0 * * *', () => {
      logger.info('Running scheduled data cleanup');
      monitorService.cleanupOldData();
    });
  })
  .catch(err => {
    logger.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);
  });

// Error handling middleware
app.use((req, res, next) => {
  res.status(404).render('404', { 
    title: 'Page Not Found',
    active: 'error' 
  });
});

app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  logger.error(`Error ${statusCode}: ${err.message}`);
  
  // Log stack trace in development
  if (config.env === 'development') {
    logger.error(err.stack);
  }
  
  res.status(statusCode).render('error', { 
    title: 'Server Error',
    message: config.env === 'development' ? err.message : 'Server error occurred',
    error: config.env === 'development' ? err : null,
    active: 'error'
  });
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  mongoose.connection.close();
  process.exit(0);
});

module.exports = app;