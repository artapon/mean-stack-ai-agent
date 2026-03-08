const BaseService = require('../../../core/base.service');
const { runAgent, runAgentGraph } = require('../../../agent/core');
const { loadSession, saveSession, clearSession } = require('../../../utils/session');
const config = require('../../../config');
const fs = require('fs');
const path = require('path');
const dashboardService = require('../../../dashboard/services/dashboard.service');

/**
 * AgentService - Handles agent execution and session management
 */
class AgentService extends BaseService {
  constructor() {
    super({ serviceName: 'AgentService' });
    this.activeAgentRun = null;
  }

  /**
   * Get available agent stacks
   */
  async getStacks() {
    const stacksPath = path.join(__dirname, '../../agent/stacks.json');
    const data = JSON.parse(fs.readFileSync(stacksPath, 'utf-8'));
    return data;
  }

  /**
   * Get available models
   */
  async getModels() {
    const modelsPath = path.join(__dirname, '../../agent/models.json');
    const data = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'));
    return data;
  }

  /**
   * Run agent with streaming
   */
  async runAgent(params, onStep) {
    const { 
      messages, 
      fastMode, 
      autoRequestReview, 
      sessionId, 
      stack, 
      orchestrator = 'classic',
      workspaceDir,
      projectRoot 
    } = params;

    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Register task with dashboard
    dashboardService.registerTask(taskId, {
      model: config.lmStudio.model,
      stack: stack || 'default',
      prompt: messages[messages.length - 1]?.content?.substring(0, 100) || '',
      sessionId,
      orchestrator,
      fastMode,
      autoRequestReview
    });

    this.log('info', 'Starting agent run', { 
      taskId,
      messageCount: messages.length, 
      fastMode, 
      stack, 
      orchestrator 
    });

    // Create abort controller
    const abort = new AbortController();
    this.activeAgentRun = abort;

    // Mark task as started
    dashboardService.startTask(taskId);

    try {
      const agentFunc = orchestrator === 'langgraph' ? runAgentGraph : runAgent;
      
      // Wrap onStep to track in dashboard
      const wrappedOnStep = (stepData) => {
        dashboardService.addTaskStep(taskId, {
          action: stepData.action || stepData.tool,
          status: stepData.status || 'executing',
          details: stepData
        });
        
        // Also log to dashboard
        dashboardService.addAgentLog({
          level: 'info',
          message: `Step ${stepData.step || '?'}: ${stepData.action || stepData.tool || 'unknown'}`,
          step: stepData.step,
          action: stepData.action || stepData.tool,
          metadata: { taskId, service: 'agent' }
        });
        
        if (onStep) onStep(stepData);
      };
      
      const result = await agentFunc({
        messages,
        stack,
        workspaceDir,
        projectRoot,
        signal: abort.signal,
        onStep: wrappedOnStep,
        fastMode: !!fastMode,
        autoRequestReview: !!autoRequestReview,
        sessionId: sessionId || null
      });

      // Save session if provided
      if (sessionId) {
        await this.saveSession(sessionId, result);
      }

      // Mark task as completed
      dashboardService.completeTask(taskId, {
        iterations: result.iterations,
        completed: result.completed,
        stack: result.stack
      });

      this.log('info', 'Agent run completed successfully', { taskId });
      return { success: true, result, taskId };
    } catch (err) {
      this.log('error', 'Agent run failed', { taskId, error: err.message });
      
      // Mark task as failed
      dashboardService.failTask(taskId, err);
      
      throw err;
    } finally {
      this.activeAgentRun = null;
    }
  }

  /**
   * Save session from agent result
   */
  async saveSession(sessionId, result) {
    if (result.memory && result.memory.version === 2) {
      await saveSession(sessionId, result.memory);
      this.log('info', `Session ${sessionId} saved (LangChain memory v2).`);
    } else if (result.history) {
      const historyToSave = result.history.filter(m => m.role !== 'system');
      await saveSession(sessionId, historyToSave);
      this.log('info', `Session ${sessionId} saved (legacy v1).`);
    }
  }

  /**
   * Load session by ID
   */
  async loadSession(sessionId) {
    return await loadSession(sessionId);
  }

  /**
   * Clear session
   */
  async clearSession(sessionId) {
    await clearSession(sessionId);
    return { success: true };
  }

  /**
   * Stop active agent
   */
  stopAgent() {
    if (this.activeAgentRun) {
      this.log('warn', 'Manual stop requested, aborting agent...');
      this.activeAgentRun.abort();
      this.activeAgentRun = null;
      return { success: true, message: 'Agent stopped.' };
    }
    return { success: false, message: 'No agent is currently running.' };
  }

  /**
   * Export analysis report to HTML
   */
  exportAnalysisToHtml(mdContent) {
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
    return htmlTemplate;
  }
}

module.exports = new AgentService();
