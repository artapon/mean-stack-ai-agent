const BaseController  = require('../../../core/base.controller');
const AgentService    = require('../services/agent.service');
const settingsService = require('../../settings/services/settings.service');
const config = require('../../../config');
const path = require('path');
const fs = require('fs');

/**
 * AgentController - Handles agent-related HTTP requests
 */
class AgentController extends BaseController {
  constructor() {
    super({ moduleName: 'Agent' });
  }

  /**
   * GET /api/agent/stacks - Get available agent stacks
   */
  async getStacks(req, res) {
    try {
      const data = await AgentService.getStacks();
      return this.ok(res, data);
    } catch (err) {
      return this.serverError(res, 'Could not load stacks', err);
    }
  }

  /**
   * GET /api/models - Get available models
   */
  async getModels(req, res) {
    try {
      const data = await AgentService.getModels();
      return this.ok(res, data);
    } catch (err) {
      return this.serverError(res, 'Could not load models', err);
    }
  }

  /**
   * POST /api/agent/run - Run agent with streaming
   */
  async run(req, res) {
    const { messages, fastMode, autoRequestReview, sessionId, isHandoff, stack, orchestrator, mode } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return this.badRequest(res, '"messages" must be a non-empty array.');
    }

    this.log('info', `New agent run request`, { 
      messageCount: messages.length, 
      fastMode, 
      stack, 
      sessionId: sessionId || 'none' 
    });

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (payload) => {
      if (!res.writableEnded) {
        res.write('data: ' + JSON.stringify(payload) + '\n\n');
        if (typeof res.flush === 'function') res.flush();
      }
    };

    // Keepalive: send SSE comment every 20s to prevent proxy/browser timeout
    // during long LLM inference periods where no data is sent
    const keepalive = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keepalive\n\n');
        if (typeof res.flush === 'function') res.flush();
      } else {
        clearInterval(keepalive);
      }
    }, 20000);

    // Handle connection close
    req.on('close', () => {
      clearInterval(keepalive);
      if (!res.writableEnded) {
        this.log('warn', 'Connection dropped, agent will continue on server');
      }
    });

    try {
      const workspaceDir = await this._getWorkspaceDir();
      const result = await AgentService.runAgent(
        {
          messages,
          fastMode,
          autoRequestReview,
          sessionId,
          isHandoff: !!isHandoff,
          stack,
          orchestrator,
          mode,
          workspaceDir,
          projectRoot: config.projectRoot
        },
        send
      );

      this.log('info', 'Agent run completed');
      send({ type: 'done', wasReviewRequested: !!result?.result?.wasReviewRequested });
    } catch (err) {
      this.log('error', 'Agent error', { error: err.message });
      send({ type: 'error', message: err.message });
    } finally {
      clearInterval(keepalive);
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  /**
   * GET /api/agent/session/:sessionId - Get session history
   */
  async getSession(req, res) {
    const { sessionId } = req.params;
    try {
      const session = await AgentService.loadSession(sessionId);
      return this.ok(res, session);
    } catch (err) {
      return this.serverError(res, 'Failed to load session', err);
    }
  }

  /**
   * POST /api/agent/clear - Clear session memory
   */
  async clearSession(req, res) {
    const { sessionId } = req.body;
    if (!sessionId) {
      return this.badRequest(res, 'sessionId is required.');
    }
    try {
      const result = await AgentService.clearSession(sessionId);
      return this.ok(res, result);
    } catch (err) {
      return this.serverError(res, 'Failed to clear session', err);
    }
  }

  /**
   * POST /api/agent/stop - Stop the running agent
   */
  stop(req, res) {
    const result = AgentService.stopAgent();
    if (result.success) {
      return this.ok(res, result);
    }
    return this.error(res, result.message, 400);
  }

  /**
   * GET /api/agent/export-analysis - Export analysis to HTML
   */
  exportAnalysis(req, res) {
    try {
      const reportsPath = path.resolve(config.projectRoot, config.reportsDir);
      const mdPath = path.join(reportsPath, 'system_analysis_walkthrough.md');
      const htmlPath = path.join(reportsPath, 'system_analysis_walkthrough.html');

      if (!fs.existsSync(mdPath)) {
        return this.notFound(res, 'Analysis report not found');
      }

      const mdContent = fs.readFileSync(mdPath, 'utf8');
      const htmlContent = AgentService.exportAnalysisToHtml(mdContent);
      fs.writeFileSync(htmlPath, htmlContent);

      res.download(htmlPath, 'system_analysis_walkthrough.html');
    } catch (err) {
      return this.serverError(res, 'Export failed', err);
    }
  }

  /** Resolve the effective workspace from settings (falls back to env/config default). */
  async _getWorkspaceDir() {
    const settings = await settingsService.load();
    if (settings.workspacePath && settings.workspacePath.trim()) {
      const ws = settings.workspacePath.trim();
      return path.isAbsolute(ws) ? ws : path.join(config.projectRoot, ws);
    }
    return config.workspaceDir;
  }

  /**
   * GET /api/agent/health - Health check
   */
  async healthCheck(req, res) {
    const workspace = await this._getWorkspaceDir();
    return this.ok(res, {
      status: 'ok',
      endpoint: config.lmStudio.baseUrl + '/chat',
      model: config.lmStudio.model,
      workspace,
      projectRoot: config.projectRoot,
      maxAgentLoops: config.agent.maxReviewLoops
    });
  }

  /**
   * GET /api/debug/root - Debug root directory
   */
  async debugRoot(req, res) {
    try {
      const files = await fs.promises.readdir(config.projectRoot);
      return this.ok(res, { projectRoot: config.projectRoot, files });
    } catch (e) {
      return this.serverError(res, 'Failed to read root', e);
    }
  }
}

module.exports = new AgentController();
