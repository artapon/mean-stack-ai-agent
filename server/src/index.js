// RESTART MARKER: 2026-03-07 23:51
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');

console.log('[Server] Loaded LM_STUDIO_MODEL:', process.env.LM_STUDIO_MODEL);

const agentRoutes = require('./routes/agent');
const filesRoutes = require('./routes/files');

const app = express();

process.on('uncaughtException', (err) => {
  console.error(' [FATAL] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error(' [FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

// ── Workspace ────────────────────────────────────────────────────────────────
// Anchor relative paths to the project root (the directory above 'server')
const serverSrcDir = __dirname; // .../server/src
const serverDir = path.dirname(serverSrcDir); // .../server
const projectRoot = path.dirname(serverDir); // .../project-root

const workspaceDir = path.isAbsolute(process.env.WORKSPACE_DIR || '')
  ? process.env.WORKSPACE_DIR
  : path.resolve(projectRoot, process.env.WORKSPACE_DIR || 'workspace');

fs.ensureDirSync(workspaceDir);
app.locals.workspaceDir = workspaceDir;
app.locals.projectRoot = projectRoot;

console.log('━'.repeat(50));
console.log(`[Server] Project Root : ${projectRoot}`);
console.log(`[Server] Workspace    : ${workspaceDir}`);
console.log(`[Server] Reports Dir  : ${path.resolve(projectRoot, process.env.AGENT_REPORTS_DIR || 'agent_reports')}`);
console.log(`[Server] CWD          : ${process.cwd()}`);
console.log('━'.repeat(50));
console.log('[Server] Initializing routes...');
app.use('/api/agent', agentRoutes);
console.log('[Server] Agent routes initialized.');
app.use('/api/files', filesRoutes);
console.log('[Server] Files routes initialized.');

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    endpoint: `${process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234'}/api/v1/chat`,
    model: process.env.LM_STUDIO_MODEL || 'openai/gpt-oss-20b',
    workspace: workspaceDir,
    projectRoot: projectRoot,
    env: {
      WORKSPACE_DIR: process.env.WORKSPACE_DIR,
      isAbsolute: path.isAbsolute(process.env.WORKSPACE_DIR || '')
    },
    maxAgentLoops: Number(process.env.MAX_AGENT_LOOPS) || 5
  });
});

app.get('/api/debug/root', async (_req, res) => {
  try {
    const files = await fs.readdir(projectRoot);
    res.json({ projectRoot, files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dynamic model list ────────────────────────────────────────────────────────
app.get('/api/models', (_req, res) => {
  try {
    const modelsPath = path.join(__dirname, 'agent', 'models.json');
    const data = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Could not load models.json: ' + e.message });
  }
});

// ── 404 Catch-all ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  console.warn(`[Server] 404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({ error: `Not Found: ${req.method} ${req.url}` });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`\n🤖  DevAgent server  →  http://localhost:${PORT}`);
  console.log(`📁  Workspace        →  ${workspaceDir}`);
  console.log(`🧠  LM Studio        →  ${process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234'}/api/v1/chat\n`);
});

