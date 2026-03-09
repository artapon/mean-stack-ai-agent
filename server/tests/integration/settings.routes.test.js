'use strict';

// ── Mock heavy deps before any module is loaded ───────────────────────────────
jest.mock('../../src/modules/agent/services/agent.service', () => ({}));
jest.mock('../../src/modules/settings/services/settings.service');

const request        = require('supertest');
const express        = require('express');
const settingsService = require('../../src/modules/settings/services/settings.service');
const { setupMiddleware, setupErrorHandling } = require('../../src/middleware');
const settingsRoutes = require('../../src/modules/settings/settings.routes');

// ── Test app ──────────────────────────────────────────────────────────────────

let app;

beforeAll(() => {
  app = express();
  setupMiddleware(app);
  app.use('/api/settings', settingsRoutes);
  setupErrorHandling(app);
});

// ── Shared fixture ────────────────────────────────────────────────────────────

const MOCK_SETTINGS = {
  agentType:         'default',
  orchestrator:      'classic',
  followReview:      false,
  followAnalysis:    false,
  autoRequestReview: false,
  fastMode:          true,
  unlimitedSteps:    false,
  workspacePath:     '',
};

beforeEach(() => {
  settingsService.load.mockResolvedValue({ ...MOCK_SETTINGS });
  settingsService.save.mockResolvedValue({ ...MOCK_SETTINGS });
  settingsService.reset.mockResolvedValue({ ...MOCK_SETTINGS });
});

// ── GET /api/settings ─────────────────────────────────────────────────────────

describe('GET /api/settings', () => {
  it('200 — returns settings wrapped in success envelope', async () => {
    const res = await request(app).get('/api/settings');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject(MOCK_SETTINGS);
  });

  it('calls settingsService.load()', async () => {
    await request(app).get('/api/settings');

    expect(settingsService.load).toHaveBeenCalledTimes(1);
  });

  it('500 — propagates service errors', async () => {
    settingsService.load.mockRejectedValue(new Error('disk read error'));

    const res = await request(app).get('/api/settings');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ── POST /api/settings ────────────────────────────────────────────────────────

describe('POST /api/settings', () => {
  it('200 — saves and returns updated settings', async () => {
    settingsService.save.mockResolvedValue({ ...MOCK_SETTINGS, fastMode: false });

    const res = await request(app)
      .post('/api/settings')
      .send({ fastMode: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fastMode).toBe(false);
  });

  it('calls settingsService.save() with request body', async () => {
    await request(app)
      .post('/api/settings')
      .send({ agentType: 'html_css', orchestrator: 'langgraph' });

    expect(settingsService.save).toHaveBeenCalledWith(
      expect.objectContaining({ agentType: 'html_css', orchestrator: 'langgraph' })
    );
  });

  it('500 — propagates save errors', async () => {
    settingsService.save.mockRejectedValue(new Error('write fail'));

    const res = await request(app)
      .post('/api/settings')
      .send({ fastMode: false });

    expect(res.status).toBe(500);
  });
});

// ── POST /api/settings/reset ──────────────────────────────────────────────────

describe('POST /api/settings/reset', () => {
  it('200 — resets to defaults', async () => {
    const res = await request(app).post('/api/settings/reset');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(settingsService.reset).toHaveBeenCalledTimes(1);
  });

  it('500 — propagates reset errors', async () => {
    settingsService.reset.mockRejectedValue(new Error('reset fail'));

    const res = await request(app).post('/api/settings/reset');

    expect(res.status).toBe(500);
  });
});
