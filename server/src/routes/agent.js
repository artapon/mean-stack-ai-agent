const express = require('express');
const router = express.Router();
const { runAgent } = require('../agent/core');

// TRACKER: Allow manual stop of the running agent
let activeAgentRun = null;

// POST /api/agent/run — streams agent steps via Server-Sent Events
router.post('/run', async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '"messages" must be a non-empty array.' });
  }

  console.log(`\n[DevAgent] 🟢 NEW REQUEST /api/agent/run (${messages.length} messages)`);

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = function (payload) {
    if (!res.writableEnded) {
      res.write('data: ' + JSON.stringify(payload) + '\n\n');
      if (typeof res.flush === 'function') res.flush(); // Bypasses compression buffers
    }
  };

  const abort = new AbortController();
  activeAgentRun = abort; // Register current run globally

  req.on('close', function () {
    if (!res.writableEnded) {
      console.warn('[DevAgent] ⚠️ Connection dropped (Jitter/Reload). Agent will CONTINUE on server.');
    } else {
      console.log('[DevAgent] 🏁 Connection closed after completed task.');
    }
  });

  try {
    await runAgent({
      messages,
      workspaceDir: req.app.locals.workspaceDir,
      signal: abort.signal,
      onStep: send
    });
    console.log('[DevAgent] ✅ runAgent successfully finished.');
    send({ type: 'done' });
  } catch (err) {
    console.error('[DevAgent] ❌ Agent error:', err.message);
    send({ type: 'error', message: err.message });
  } finally {
    if (activeAgentRun === abort) activeAgentRun = null;
    if (!res.writableEnded) {
      res.end();
    }
  }
});

// POST /api/agent/stop — Explicitly kill the current running agent
router.post('/stop', (req, res) => {
  if (activeAgentRun) {
    console.warn('[DevAgent] 🛑 MANUAL STOP REQUEST RECEIVED. Aborting agent...');
    activeAgentRun.abort();
    activeAgentRun = null;
    return res.json({ success: true, message: 'Agent stopped.' });
  }
  res.json({ success: false, message: 'No agent is currently running.' });
});

module.exports = router;
