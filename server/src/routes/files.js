const express = require('express');
const router = express.Router();
const { execFile } = require('child_process');
const nodePath = require('path');
const { readFile, writeFile, listFiles } = require('../tools/filesystem');

// ── List files ─────────────────────────────────────────────────────────────
router.get('/list', async (req, res) => {
  try {
    const result = await listFiles({ path: req.query.path || '.' }, req.app.locals.workspaceDir, true);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Read file ──────────────────────────────────────────────────────────────
router.get('/read', async (req, res) => {
  try {
    if (!req.query.path) return res.status(400).json({ error: '"path" query param required.' });
    const result = await readFile({ path: req.query.path }, req.app.locals.workspaceDir, true);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Write file ─────────────────────────────────────────────────────────────
router.post('/write', async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: '"path" and "content" are required.' });
    }
    const result = await writeFile({ path: filePath, content }, req.app.locals.workspaceDir, true);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
