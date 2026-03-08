const express = require('express');
const router = express.Router();
const BaseController = require('../../core/base.controller');
const AgentController = require('./controllers/agent.controller');

// ── Agent Routes ─────────────────────────────────────────────────────────────

// GET /api/agent/stacks - Get available agent stacks
router.get('/stacks', BaseController.asyncHandler(AgentController.getStacks.bind(AgentController)));

// GET /api/models - Get available models (mounted at root level too)
router.get('/models', BaseController.asyncHandler(AgentController.getModels.bind(AgentController)));

// POST /api/agent/run - Run agent with streaming
router.post('/run', BaseController.asyncHandler(AgentController.run.bind(AgentController)));

// GET /api/agent/session/:sessionId - Get session history
router.get('/session/:sessionId', BaseController.asyncHandler(AgentController.getSession.bind(AgentController)));

// POST /api/agent/clear - Clear session memory
router.post('/clear', BaseController.asyncHandler(AgentController.clearSession.bind(AgentController)));

// POST /api/agent/stop - Stop the running agent
router.post('/stop', AgentController.stop.bind(AgentController));

// GET /api/agent/export-analysis - Export analysis to HTML
router.get('/export-analysis', BaseController.asyncHandler(AgentController.exportAnalysis.bind(AgentController)));

module.exports = router;
