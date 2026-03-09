'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const fs      = require('fs-extra');

const config = require('./config');
const { validateConfig } = require('./config');
const { logger }         = require('./utils/logger');
const { setupMiddleware, setupErrorHandling, setupProcessHandlers } = require('./middleware');

const agentRoutes     = require('./modules/agent/agent.routes');
const filesRoutes     = require('./modules/files/files.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const settingsRoutes  = require('./modules/settings/settings.routes');
const memoryRoutes    = require('./modules/memory/memory.routes');

// ── Bootstrap ─────────────────────────────────────────────────────────────────

setupProcessHandlers();
validateConfig();

const app = express();

// Ensure workspace directory exists before accepting requests
fs.ensureDirSync(config.workspaceDir);
app.locals.workspaceDir = config.workspaceDir;
app.locals.projectRoot  = config.projectRoot;

setupMiddleware(app);

// ── Routes ─────────────────────────────────────────────────────────────────────

app.use('/api/agent',    agentRoutes);
app.use('/api/files',    filesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/memory',   memoryRoutes);
app.use('/',             dashboardRoutes);

setupErrorHandling(app);

// ── Start server ───────────────────────────────────────────────────────────────

const server = app.listen(config.port, () => {
  logger.info(`DevAgent server started on http://localhost:${config.port}`);
  logger.info(`Workspace  → ${config.workspaceDir}`);
  logger.info(`LM Studio  → ${config.lmStudio.baseUrl}`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  // Force-exit if connections don't drain within 10 s
  setTimeout(() => {
    logger.warn('Forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = app;
