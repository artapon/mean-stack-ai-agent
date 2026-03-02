const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');

console.log('[Server] Loaded LM_STUDIO_MODEL:', process.env.LM_STUDIO_MODEL);

const agentRoutes = require('./routes/agent');
const filesRoutes = require('./routes/files');

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

// ── Workspace ────────────────────────────────────────────────────────────────
const workspaceDir = path.resolve(process.env.WORKSPACE_DIR || './projects');
fs.ensureDirSync(workspaceDir);
app.locals.workspaceDir = workspaceDir;

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/agent', agentRoutes);
app.use('/api/files', filesRoutes);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    endpoint: `${process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234'}/api/v1/chat`,
    model: process.env.LM_STUDIO_MODEL || 'openai/gpt-oss-20b',
    workspace: workspaceDir,
    maxAgentLoops: Number(process.env.MAX_AGENT_LOOPS) || 5
  });
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

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`\n🤖  DevAgent server  →  http://localhost:${PORT}`);
  console.log(`📁  Workspace        →  ${workspaceDir}`);
  console.log(`🧠  LM Studio        →  ${process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234'}/api/v1/chat\n`);
});
