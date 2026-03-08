'use strict';

const cors    = require('cors');
const express = require('express');
const config  = require('../config');
const { createLogger } = require('../utils/logger');

const log = createLogger('Middleware');

// ── Middleware Setup ──────────────────────────────────────────────────────────

function setupMiddleware(app) {
  // CORS — allow configured client origin
  app.use(cors({ origin: config.clientUrl }));

  // Body parsing
  app.use(express.json({ limit: config.bodyLimit }));

  // Request / response logging with duration
  app.use((req, res, next) => {
    // Skip SSE streams — they stay open for minutes and would log on every close
    if (req.headers.accept === 'text/event-stream') return next();

    const start = Date.now();
    res.on('finish', () => {
      const ms  = Date.now() - start;
      const lvl = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                : 'debug';
      log[lvl](`${req.method} ${req.url} → ${res.statusCode} (${ms}ms)`);
    });
    next();
  });
}

// ── Error Handling ────────────────────────────────────────────────────────────

function setupErrorHandling(app) {
  // 404 — no route matched
  app.use((req, res) => {
    log.warn(`404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ success: false, error: `Not Found: ${req.method} ${req.url}` });
  });

  // 500 — unhandled error forwarded via next(err)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    log.error(`Unhandled error on ${req.method} ${req.url}`, { error: err.message });
    const body = { success: false, error: 'Internal Server Error' };
    // Only expose details outside production to avoid leaking internals
    if (process.env.NODE_ENV !== 'production') body.details = err.message;
    res.status(500).json(body);
  });
}

// ── Process Error Handlers ────────────────────────────────────────────────────

function setupProcessHandlers() {
  process.on('uncaughtException', (err) => {
    log.error('Uncaught Exception — process may be unstable', { error: err.message, stack: err.stack });
  });

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    log.error('Unhandled Promise Rejection', { reason: message });
  });
}

module.exports = { setupMiddleware, setupErrorHandling, setupProcessHandlers };
