const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { runAgent } = require('../agent/core');
const { loadSession, saveSession, clearSession } = require('../utils/session');

/**
 * Exports a markdown report to stylized HTML.
 * @param {string} mdPath 
 * @param {string} htmlPath 
 */
function exportToHtml(mdPath, htmlPath) {
  if (!fs.existsSync(mdPath)) throw new Error(`Report not found: ${mdPath}`);
  const mdContent = fs.readFileSync(mdPath, 'utf8');

  const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forensic Analysis Report</title>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --accent: #38bdf8;
            --text-primary: #f1f5f9;
            --text-secondary: #94a3b8;
            --border: #334155;
            --success: #10b981;
            --warning: #f59e0b;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background-color: var(--bg-primary);
            color: var(--text-primary);
            font-family: 'Inter', sans-serif;
            line-height: 1.6;
            padding: 2rem;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .header-actions {
            width: 100%;
            max-width: 900px;
            display: flex;
            justify-content: flex-end;
            margin-bottom: 1rem;
        }
        .download-btn {
            background: var(--accent);
            color: var(--bg-primary);
            border: none;
            padding: 0.6rem 1.2rem;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
        }
        .download-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(56, 189, 248, 0.3);
        }
        .container {
            max-width: 900px;
            width: 100%;
            background: var(--bg-secondary);
            border-radius: 16px;
            padding: 3rem;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            border: 1px solid var(--border);
            position: relative;
            overflow: hidden;
        }
        .container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, var(--accent), var(--success));
        }
        h1, h2, h3 { color: var(--text-primary); margin-top: 2.5rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 12px; }
        h1 { font-size: 2.5rem; margin-top: 0; }
        h2 { font-size: 1.8rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; }
        h3 { font-size: 1.4rem; color: var(--accent); }
        p { margin-bottom: 1.2rem; color: var(--text-secondary); }
        hr { border: 0; height: 1px; background: var(--border); margin: 3rem 0; }
        code { font-family: 'JetBrains Mono', monospace; background: #0f172a; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.9em; color: var(--accent); }
        pre { background: #000; padding: 1.5rem; border-radius: 12px; overflow-x: auto; border: 1px solid var(--border); margin: 1.5rem 0; }
        pre code { background: transparent; color: #d1d5db; padding: 0; }
        table { width: 100%; border-collapse: collapse; margin: 2rem 0; background: rgba(15, 23, 42, 0.5); border-radius: 8px; overflow: hidden; }
        th { background: var(--bg-primary); text-align: left; padding: 1rem; color: var(--accent); font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
        td { padding: 1rem; border-top: 1px solid var(--border); font-size: 0.9rem; }
        blockquote { background: rgba(56, 189, 248, 0.1); border-left: 4px solid var(--accent); padding: 1.5rem; margin: 1.5rem 0; border-radius: 0 8px 8px 0; font-style: italic; }
        .alert { background: rgba(245, 158, 11, 0.1); border: 1px solid var(--warning); padding: 1rem; border-radius: 8px; margin: 1rem 0; color: var(--warning); font-size: 0.9rem; }
        @media print {
            .header-actions { display: none; }
            body { background: white; color: black; padding: 0; }
            .container { box-shadow: none; border: none; width: 100%; max-width: none; background: white; color: black; }
            .container::before { display: none; }
            h1, h2, h3, p, td, th { color: black !important; }
            pre, code { background: #f8f9fa !important; color: black !important; border-color: #dee2e6 !important; }
            table, tr, td, th { border-color: #dee2e6 !important; }
        }
    </style>
</head>
<body>
    <div class="header-actions">
        <button class="download-btn" onclick="window.print()">Export to PDF (Print)</button>
    </div>
    <div class="container">
        <div id="content"></div>
    </div>
    <script>
        const md = ${JSON.stringify(mdContent)};
        const renderer = new marked.Renderer();
        const baseBlockquote = renderer.blockquote.bind(renderer);
        renderer.blockquote = (quote) => {
            if (quote.includes('[!IMPORTANT]')) {
                return '<div class="alert">' + quote.replace('[!IMPORTANT]', '<strong>⚠️ IMPORTANT:</strong>') + '</div>';
            }
            return baseBlockquote(quote);
        };
        marked.setOptions({ renderer, gfm: true, breaks: true });
        document.getElementById('content').innerHTML = marked.parse(md);
    </script>
</body>
</html>`;
  fs.writeFileSync(htmlPath, htmlTemplate);
}

// GET /api/agent/export-analysis — Export analysis report to HTML
router.get('/export-analysis', (req, res) => {
  try {
    const workspaceDir = req.app.locals.workspaceDir;
    const mdPath = path.resolve(workspaceDir, 'walkthrough_system_analysis_report.md');
    const htmlPath = path.resolve(workspaceDir, 'walkthrough_system_analysis_report.html');

    exportToHtml(mdPath, htmlPath);

    // Send the file as an attachment
    res.download(htmlPath, 'walkthrough_system_analysis_report.html');
  } catch (err) {
    res.status(500).json({ error: 'Export failed: ' + err.message });
  }
});

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
      autoRequestReview: !!autoRequestReview,
      sessionId: sessionId || null
    });

    // 4. Update session — prefer LangChain memory (v2) over raw history (v1)
    if (sessionId) {
      if (result.memory && result.memory.version === 2) {
        // Save LangChain serialized memory directly
        await saveSession(sessionId, result.memory);
        console.log(`[DevAgent] Session ${sessionId} saved (LangChain memory v2).`);
      } else if (result.history) {
        // Fallback: save raw history without system prompt
        const historyToSave = result.history.filter(m => m.role !== 'system');
        await saveSession(sessionId, historyToSave);
        console.log(`[DevAgent] Session ${sessionId} saved (legacy v1).`);
      }
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
