const cors = require('cors');
const express = require('express');
const config = require('../config');

/**
 * Global Middleware Setup
 */
function setupMiddleware(app) {
  // CORS
  app.use(cors({ origin: config.clientUrl }));
  
  // Body parsing
  app.use(express.json({ limit: config.bodyLimit }));
  
  // Request logging
  app.use((req, res, next) => {
    console.log(`[Server] ${req.method} ${req.url}`);
    next();
  });
}

/**
 * Error Handling Middleware
 */
function setupErrorHandling(app) {
  // 404 handler
  app.use((req, res) => {
    console.warn(`[Server] 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ error: `Not Found: ${req.method} ${req.url}` });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('[Server] Error:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: err.message 
    });
  });
}

/**
 * Process Error Handlers
 */
function setupProcessHandlers() {
  process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
  });
}

module.exports = {
  setupMiddleware,
  setupErrorHandling,
  setupProcessHandlers
};
