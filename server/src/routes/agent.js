const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { runAgent } = require('../agent/core');
const { loadSession, saveSession, clearSession } = require('../utils/session');

// TRACKER: Allow manual stop of the running agent
let activeAgentRun = null;

// GET /api/agent/stacks — Get available agent stacks metadata
router.get('/stacks', (req, res) => {
  try {
    const stacksPath = path.join(__dirname, '../agent/stacks.json');
    const data = JSON.parse(fs.readFileSync(stacksPath, 'utf-8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Could not load stacks.json: ' + e.message });
  }
});

// POST /api/agent/run — streams agent steps via Server-Sent Events
router.post('/run', async (req, res) => {
  const { messages, fastMode, autoRequestReview, sessionId, stack } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '"messages" must be a non-empty array.' });
  }

  console.log(`\n[DevAgent] 🟢 NEW REQUEST /api/agent/run (${messages.length} messages, fast: ${fastMode}, stack: ${stack || 'default'}, session: ${sessionId || 'none'})`);

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = function (payload) {
    if (!res.writableEnded) {
      res.write('data: ' + JSON.stringify(payload) + '\n\n');
      if (typeof res.flush === 'function') res.flush();
    }
  };

  const abort = new AbortController();
  activeAgentRun = abort;

  req.on('close', function () {
    if (!res.writableEnded) {
      console.warn('[DevAgent] ⚠️ Connection dropped. Agent will CONTINUE on server.');
    } else {
      console.log('[DevAgent] 🏁 Connection closed after completed task.');
    }
  });

  try {
    // 3. Run the agent (In this version, we assume 'messages' sent from client already contains 
    //    the full history if desired, or just the new turn if they want a fresh start.)
    const result = await runAgent({
      messages,
      stack,
      workspaceDir: req.app.locals.workspaceDir,
      signal: abort.signal,
      onStep: send,
      fastMode: !!fastMode,
      autoRequestReview: !!autoRequestReview
    });

    // 4. Update session
    if (sessionId && result.history) {
      // Store history without system prompt
      const historyToSave = result.history.filter(m => m.role !== 'system');
      await saveSession(sessionId, historyToSave);
      console.log(`[DevAgent] Session ${sessionId} saved.`);
    }

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

// GET /api/agent/session/:sessionId — Get session history
router.get('/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const session = await loadSession(sessionId);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load session: ' + err.message });
  }
});

// POST /api/agent/clear — Clear session memory
router.post('/clear', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required.' });
  }
  try {
    await clearSession(sessionId);
    res.json({ success: true, message: `Session ${sessionId} cleared.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear session: ' + err.message });
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
