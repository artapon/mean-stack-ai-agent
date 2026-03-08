'use strict';

const path = require('path');

// ── Path resolution ───────────────────────────────────────────────────────────
// __dirname = server/src/config
// Resolve upward once and cache — avoids repeated path traversal on every access.

const _configDir  = __dirname;                      // server/src/config
const _srcDir     = path.dirname(_configDir);       // server/src
const _serverDir  = path.dirname(_srcDir);          // server
const _projectRoot = path.dirname(_serverDir);      // project root

// ── Config object ─────────────────────────────────────────────────────────────

const config = {
  // ── Server ──────────────────────────────────────────────────────────────────
  port:      Number(process.env.PORT) || 3000,
  bodyLimit: process.env.BODY_LIMIT || '10mb',
  clientUrl: process.env.CLIENT_URL  || 'http://localhost:5173',

  // ── Resolved paths (pre-computed, not getters) ───────────────────────────────
  projectRoot: _projectRoot,
  serverDir:   _serverDir,
  agentDir:    path.join(_srcDir, 'agent'),

  // ── Workspace ────────────────────────────────────────────────────────────────
  get workspaceDir() {
    const ws = process.env.WORKSPACE_DIR || 'workspace';
    return path.isAbsolute(ws) ? ws : path.join(_projectRoot, ws);
  },

  // ── Reports ──────────────────────────────────────────────────────────────────
  get reportsDir()  { return process.env.AGENT_REPORTS_DIR || 'agent_reports'; },
  get reportsPath() { return path.join(_projectRoot, this.reportsDir); },

  // ── LM Studio ────────────────────────────────────────────────────────────────
  lmStudio: {
    get baseUrl() {
      return (process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234').replace(/\/$/, '') + '/v1';
    },
    get model() { return process.env.LM_STUDIO_MODEL || 'openai/gpt-oss-20b'; }
  },

  // ── Agent ────────────────────────────────────────────────────────────────────
  agent: {
    maxSteps:       Number(process.env.AGENT_MAX_STEPS)  || 50,
    maxLoops:       Number(process.env.AGENT_MAX_LOOPS)  || 3,
    maxReviewLoops: Number(process.env.MAX_AGENT_LOOPS)  || 3
  }
};

/**
 * Validate critical config at startup.
 * Logs warnings for missing but optional settings; does NOT exit.
 */
function validateConfig() {
  const { createLogger } = require('../utils/logger');
  const log = createLogger('Config');

  if (!process.env.LM_STUDIO_MODEL) {
    log.warn('LM_STUDIO_MODEL not set — using default model');
  }
  if (!process.env.WORKSPACE_DIR) {
    log.warn('WORKSPACE_DIR not set — using default "./workspace"');
  }

  log.info('Configuration loaded', {
    port:      config.port,
    workspace: config.workspaceDir,
    lmBase:    config.lmStudio.baseUrl,
    model:     config.lmStudio.model
  });
}

module.exports = config;
module.exports.validateConfig = validateConfig;
