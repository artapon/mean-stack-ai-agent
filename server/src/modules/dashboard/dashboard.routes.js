const express = require('express');
const router = express.Router();
const BaseController = require('../../core/base.controller');
const DashboardController = require('./controllers/dashboard.controller');

// ── Dashboard Page ────────────────────────────────────────────────────────────

// GET /dashboard - Dashboard HTML page
router.get('/dashboard', BaseController.asyncHandler(DashboardController.getPage.bind(DashboardController)));

// ── Dashboard API ─────────────────────────────────────────────────────────────

// GET /api/dashboard - Full dashboard data
router.get('/api/dashboard', BaseController.asyncHandler(DashboardController.getDashboard.bind(DashboardController)));

// GET /api/dashboard/stream - SSE real-time stream
router.get('/api/dashboard/stream', BaseController.asyncHandler(DashboardController.stream.bind(DashboardController)));

// GET /api/dashboard/stats - Stats only
router.get('/api/dashboard/stats', BaseController.asyncHandler(DashboardController.getStats.bind(DashboardController)));

// ── Tasks ─────────────────────────────────────────────────────────────────────

// GET /api/dashboard/tasks - All tasks
router.get('/api/dashboard/tasks', BaseController.asyncHandler(DashboardController.getAllTasks.bind(DashboardController)));

// GET /api/dashboard/tasks/active - Active tasks
router.get('/api/dashboard/tasks/active', BaseController.asyncHandler(DashboardController.getActiveTasks.bind(DashboardController)));

// GET /api/dashboard/tasks/:id - Single task
router.get('/api/dashboard/tasks/:id', BaseController.asyncHandler(DashboardController.getTask.bind(DashboardController)));

// ── Workflows ─────────────────────────────────────────────────────────────────

// GET /api/dashboard/workflows - All workflows
router.get('/api/dashboard/workflows', BaseController.asyncHandler(DashboardController.getAllWorkflows.bind(DashboardController)));

// GET /api/dashboard/workflows/active - Active workflows
router.get('/api/dashboard/workflows/active', BaseController.asyncHandler(DashboardController.getActiveWorkflows.bind(DashboardController)));

// ── Logs ──────────────────────────────────────────────────────────────────────

// GET /api/dashboard/logs - Recent logs
router.get('/api/dashboard/logs', BaseController.asyncHandler(DashboardController.getLogs.bind(DashboardController)));

// ── Actions ───────────────────────────────────────────────────────────────────

// POST /api/dashboard/clear - Clear all data
router.post('/api/dashboard/clear', BaseController.asyncHandler(DashboardController.clear.bind(DashboardController)));

module.exports = router;
