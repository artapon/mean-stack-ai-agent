// RESTART MARKER: 2026-03-07 23:51
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const fs = require('fs-extra');
const config = require('./config');
const { setupMiddleware, setupErrorHandling, setupProcessHandlers } = require('./middleware');

// Module routes
const agentRoutes = require('./modules/agent/agent.routes');
const filesRoutes = require('./modules/files/files.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');

console.log('[Server] Loaded LM_STUDIO_MODEL:', process.env.LM_STUDIO_MODEL);

const app = express();

// Process error handlers
setupProcessHandlers();

// Middleware
setupMiddleware(app);

// Ensure workspace exists
fs.ensureDirSync(config.workspaceDir);
app.locals.workspaceDir = config.workspaceDir;
app.locals.projectRoot = config.projectRoot;

console.log('━'.repeat(50));
console.log(`[Server] Project Root : ${config.projectRoot}`);
console.log(`[Server] Workspace    : ${config.workspaceDir}`);
console.log(`[Server] Reports Dir  : ${config.reportsPath}`);
console.log(`[Server] CWD          : ${process.cwd()}`);
console.log('━'.repeat(50));
console.log('[Server] Initializing routes...');

// ── Routes ───────────────────────────────────────────────────────────────────

// Agent module routes
app.use('/api/agent', agentRoutes);
console.log('[Server] Agent routes initialized.');

// Files module routes
app.use('/api/files', filesRoutes);
console.log('[Server] Files routes initialized.');

// Dashboard routes (both page and API)
app.use('/', dashboardRoutes);
console.log('[Server] Dashboard routes initialized.');

// Health check (also provided in AgentController but kept here for convenience)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    endpoint: config.lmStudio.baseUrl + '/chat',
    model: config.lmStudio.model,
    workspace: config.workspaceDir,
    projectRoot: config.projectRoot,
    env: {
      WORKSPACE_DIR: process.env.WORKSPACE_DIR,
      isAbsolute: path.isAbsolute(process.env.WORKSPACE_DIR || '')
    },
    maxAgentLoops: config.agent.maxReviewLoops
  });
});

// Debug route
app.get('/api/debug/root', async (_req, res) => {
  try {
    const files = await fs.readdir(config.projectRoot);
    res.json({ projectRoot: config.projectRoot, files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Error handling
setupErrorHandling(app);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`\n🤖  DevAgent server  →  http://localhost:${PORT}`);
  console.log(`📁  Workspace        →  ${config.workspaceDir}`);
  console.log(`🧠  LM Studio        →  ${config.lmStudio.baseUrl}/chat\n`);
});

module.exports = app;
