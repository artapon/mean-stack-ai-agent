'use strict';

jest.mock('../../src/modules/agent/services/agent.service', () => ({}));

const request          = require('supertest');
const express          = require('express');
const dashboardService = require('../../src/modules/dashboard/services/dashboard.service');
const { setupMiddleware, setupErrorHandling } = require('../../src/middleware');
const dashboardRoutes  = require('../../src/modules/dashboard/dashboard.routes');

// ── Test app ──────────────────────────────────────────────────────────────────
// Dashboard service is fully in-memory — no mocking needed.

let app;

beforeAll(() => {
  app = express();
  setupMiddleware(app);
  app.use('/', dashboardRoutes);
  setupErrorHandling(app);
});

beforeEach(() => {
  dashboardService.clearAll();
});

// ── Seed helpers ──────────────────────────────────────────────────────────────

function seedTask(id = 'test-task', status = 'running') {
  dashboardService.registerTask(id, { model: 'mistral', stack: 'default', prompt: 'hello' });
  if (status === 'running')   dashboardService.startTask(id);
  if (status === 'completed') { dashboardService.startTask(id); dashboardService.completeTask(id); }
  if (status === 'failed')    { dashboardService.startTask(id); dashboardService.failTask(id, new Error('boom')); }
  return id;
}

// ── GET /api/dashboard ────────────────────────────────────────────────────────

describe('GET /api/dashboard', () => {
  it('200 — returns full dashboard snapshot', async () => {
    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const d = res.body.data;
    expect(d).toHaveProperty('stats');
    expect(d).toHaveProperty('activeTasks');
    expect(d).toHaveProperty('recentTasks');
    expect(d).toHaveProperty('recentLogs');
  });

  it('reflects seeded running tasks', async () => {
    seedTask('t1');

    const res = await request(app).get('/api/dashboard');
    const { activeTasks } = res.body.data;

    expect(activeTasks.some(t => t.id === 't1')).toBe(true);
    expect(activeTasks.find(t => t.id === 't1').status).toBe('running');
  });
});

// ── GET /api/dashboard/stats ──────────────────────────────────────────────────

describe('GET /api/dashboard/stats', () => {
  it('200 — returns stats object with required fields', async () => {
    const res = await request(app).get('/api/dashboard/stats');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const s = res.body.data;
    expect(typeof s.totalTasks).toBe('number');
    expect(typeof s.completedTasks).toBe('number');
    expect(typeof s.failedTasks).toBe('number');
    expect(typeof s.activeTasks).toBe('number');
    expect(typeof s.uptime).toBe('number');
  });

  it('totalTasks increments after registering tasks', async () => {
    seedTask('s1'); seedTask('s2');

    const res = await request(app).get('/api/dashboard/stats');

    expect(res.body.data.totalTasks).toBeGreaterThanOrEqual(2);
  });
});

// ── GET /api/dashboard/tasks ──────────────────────────────────────────────────

describe('GET /api/dashboard/tasks', () => {
  it('200 — returns all tasks', async () => {
    seedTask('all1', 'running');
    seedTask('all2', 'completed');

    const res = await request(app).get('/api/dashboard/tasks');

    expect(res.status).toBe(200);
    const ids = res.body.data.map(t => t.id);
    expect(ids).toContain('all1');
    expect(ids).toContain('all2');
  });
});

// ── GET /api/dashboard/tasks/active ──────────────────────────────────────────

describe('GET /api/dashboard/tasks/active', () => {
  it('200 — returns only running tasks', async () => {
    seedTask('run1', 'running');
    seedTask('done1', 'completed');

    const res = await request(app).get('/api/dashboard/tasks/active');

    expect(res.status).toBe(200);
    const tasks = res.body.data;
    expect(tasks.every(t => t.status === 'running')).toBe(true);
    expect(tasks.some(t => t.id === 'run1')).toBe(true);
    expect(tasks.some(t => t.id === 'done1')).toBe(false);
  });
});

// ── GET /api/dashboard/tasks/:id ─────────────────────────────────────────────

describe('GET /api/dashboard/tasks/:id', () => {
  it('200 — returns the correct task', async () => {
    seedTask('specific-task');

    const res = await request(app).get('/api/dashboard/tasks/specific-task');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('specific-task');
    expect(res.body.data.status).toBe('running');
  });

  it('404 — when task does not exist', async () => {
    const res = await request(app).get('/api/dashboard/tasks/ghost-task');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /api/dashboard/logs ───────────────────────────────────────────────────

describe('GET /api/dashboard/logs', () => {
  it('200 — returns log array', async () => {
    dashboardService.addLog('info',  'test log alpha');
    dashboardService.addLog('error', 'test log beta');

    const res = await request(app).get('/api/dashboard/logs');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const messages = res.body.data.map(l => l.message);
    expect(messages).toContain('test log alpha');
    expect(messages).toContain('test log beta');
  });

  it('filters by level query param', async () => {
    dashboardService.addLog('info',  'info entry');
    dashboardService.addLog('error', 'error entry');

    const res = await request(app).get('/api/dashboard/logs?level=error');

    expect(res.status).toBe(200);
    expect(res.body.data.every(l => l.level === 'error')).toBe(true);
  });
});

// ── POST /api/dashboard/clear ─────────────────────────────────────────────────

describe('POST /api/dashboard/clear', () => {
  it('200 — clears all data and returns success message', async () => {
    seedTask('clear-me');
    dashboardService.addLog('info', 'noise');

    const res = await request(app).post('/api/dashboard/clear');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('resets stats to zero after clearing', async () => {
    seedTask('c1'); seedTask('c2');
    await request(app).post('/api/dashboard/clear');

    const statsRes = await request(app).get('/api/dashboard/stats');
    expect(statsRes.body.data.totalTasks).toBe(0);
  });
});
