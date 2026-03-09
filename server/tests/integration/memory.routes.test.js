'use strict';

jest.mock('../../src/modules/agent/services/agent.service', () => ({}));
jest.mock('../../src/modules/memory/services/memory.service');

const request       = require('supertest');
const express       = require('express');
const memoryService = require('../../src/modules/memory/services/memory.service');
const { setupMiddleware, setupErrorHandling } = require('../../src/middleware');
const memoryRoutes  = require('../../src/modules/memory/memory.routes');

// ── Test app ──────────────────────────────────────────────────────────────────

let app;

beforeAll(() => {
  app = express();
  setupMiddleware(app);
  app.use('/api/memory', memoryRoutes);
  setupErrorHandling(app);
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_SESSION_META = {
  id:        'abc123',
  file:      'abc123.json',
  size:      2048,
  updatedAt: new Date('2024-06-01').toISOString(),
  version:   2,
  mode:      'developer',
  msgCount:  5,
  preview:   'Build a REST API',
};

const MOCK_SESSION_DETAIL = {
  version: 2,
  mode: 'developer',
  messages: [
    { type: 'human', content: 'Build a REST API' },
    { type: 'ai',    content: 'Creating project structure...' },
  ],
};

// ── GET /api/memory ───────────────────────────────────────────────────────────

describe('GET /api/memory', () => {
  it('200 — returns sessions array', async () => {
    memoryService.listSessions.mockResolvedValue([MOCK_SESSION_META]);

    const res = await request(app).get('/api/memory');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sessions).toHaveLength(1);
    expect(res.body.data.sessions[0].id).toBe('abc123');
  });

  it('200 — returns empty array when no sessions exist', async () => {
    memoryService.listSessions.mockResolvedValue([]);

    const res = await request(app).get('/api/memory');

    expect(res.status).toBe(200);
    expect(res.body.data.sessions).toEqual([]);
  });

  it('500 — when service throws', async () => {
    memoryService.listSessions.mockRejectedValue(new Error('readdir failed'));

    const res = await request(app).get('/api/memory');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /api/memory/:id ───────────────────────────────────────────────────────

describe('GET /api/memory/:id', () => {
  it('200 — returns session detail', async () => {
    memoryService.getSession.mockResolvedValue(MOCK_SESSION_DETAIL);

    const res = await request(app).get('/api/memory/abc123');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.messages).toHaveLength(2);
  });

  it('calls getSession with the correct id', async () => {
    memoryService.getSession.mockResolvedValue(MOCK_SESSION_DETAIL);

    await request(app).get('/api/memory/my-session-id');

    expect(memoryService.getSession).toHaveBeenCalledWith('my-session-id');
  });

  it('404 — when session does not exist', async () => {
    memoryService.getSession.mockResolvedValue(null);

    const res = await request(app).get('/api/memory/ghost');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('500 — when service throws', async () => {
    memoryService.getSession.mockRejectedValue(new Error('readJson failed'));

    const res = await request(app).get('/api/memory/bad-session');

    expect(res.status).toBe(500);
  });
});

// ── DELETE /api/memory/:id ────────────────────────────────────────────────────

describe('DELETE /api/memory/:id', () => {
  it('200 — deletes session and returns { deleted: true }', async () => {
    memoryService.deleteSession.mockResolvedValue(true);

    const res = await request(app).delete('/api/memory/abc123');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deleted).toBe(true);
  });

  it('calls deleteSession with the correct id', async () => {
    memoryService.deleteSession.mockResolvedValue(true);

    await request(app).delete('/api/memory/target-id');

    expect(memoryService.deleteSession).toHaveBeenCalledWith('target-id');
  });

  it('404 — when session does not exist', async () => {
    memoryService.deleteSession.mockResolvedValue(false);

    const res = await request(app).delete('/api/memory/ghost');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('500 — when service throws', async () => {
    memoryService.deleteSession.mockRejectedValue(new Error('remove failed'));

    const res = await request(app).delete('/api/memory/bad');

    expect(res.status).toBe(500);
  });
});
