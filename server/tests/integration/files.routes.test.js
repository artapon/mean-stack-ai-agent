'use strict';

jest.mock('../../src/modules/agent/services/agent.service', () => ({}));
jest.mock('../../src/modules/files/services/files.service');

const request      = require('supertest');
const express      = require('express');
const filesService = require('../../src/modules/files/services/files.service');
const { setupMiddleware, setupErrorHandling } = require('../../src/middleware');
const filesRoutes  = require('../../src/modules/files/files.routes');

// ── Test app ──────────────────────────────────────────────────────────────────

let app;

beforeAll(() => {
  app = express();
  setupMiddleware(app);
  app.use('/api/files', filesRoutes);
  setupErrorHandling(app);
});

// ── GET /api/files/list ───────────────────────────────────────────────────────

describe('GET /api/files/list', () => {
  it('200 — returns list of files', async () => {
    filesService.listFiles.mockResolvedValue({
      path: '.',
      items: [
        { name: 'src', type: 'directory', path: 'src' },
        { name: 'index.js', type: 'file', path: 'index.js' },
      ],
    });

    const res = await request(app).get('/api/files/list?path=.');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(2);
  });

  it('calls filesService.listFiles with path query param', async () => {
    filesService.listFiles.mockResolvedValue({ path: 'src', items: [] });

    await request(app).get('/api/files/list?path=src');

    expect(filesService.listFiles).toHaveBeenCalledWith('src');
  });

  it('uses "." as default path when no query param', async () => {
    filesService.listFiles.mockResolvedValue({ path: '.', items: [] });

    await request(app).get('/api/files/list');

    expect(filesService.listFiles).toHaveBeenCalledWith('.');
  });

  it('400 — when service returns an error object', async () => {
    filesService.listFiles.mockResolvedValue({ error: 'Directory not found' });

    const res = await request(app).get('/api/files/list?path=nonexistent');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('500 — when service throws', async () => {
    filesService.listFiles.mockRejectedValue(new Error('FS error'));

    const res = await request(app).get('/api/files/list');

    expect(res.status).toBe(500);
  });
});

// ── GET /api/files/read ───────────────────────────────────────────────────────

describe('GET /api/files/read', () => {
  it('200 — returns file content', async () => {
    filesService.readFile.mockResolvedValue({
      path: 'src/index.js',
      content: "console.log('hello');",
      size: 22,
    });

    const res = await request(app).get('/api/files/read?path=src/index.js');

    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe("console.log('hello');");
  });

  it('400 — when path query param is missing', async () => {
    const res = await request(app).get('/api/files/read');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(filesService.readFile).not.toHaveBeenCalled();
  });

  it('404 — when service returns an error (file not found)', async () => {
    filesService.readFile.mockResolvedValue({ error: 'File not found' });

    const res = await request(app).get('/api/files/read?path=ghost.js');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('500 — when service throws', async () => {
    filesService.readFile.mockRejectedValue(new Error('permission denied'));

    const res = await request(app).get('/api/files/read?path=secret.txt');

    expect(res.status).toBe(500);
  });
});

// ── POST /api/files/write ─────────────────────────────────────────────────────

describe('POST /api/files/write', () => {
  it('200 — writes file and returns success', async () => {
    filesService.writeFile.mockResolvedValue({
      path: 'out/result.txt',
      bytes: 13,
      success: true,
    });

    const res = await request(app)
      .post('/api/files/write')
      .send({ path: 'out/result.txt', content: 'Hello, World!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('calls filesService.writeFile with correct arguments', async () => {
    filesService.writeFile.mockResolvedValue({ success: true });

    await request(app)
      .post('/api/files/write')
      .send({ path: 'hello.txt', content: 'world' });

    expect(filesService.writeFile).toHaveBeenCalledWith('hello.txt', 'world');
  });

  it('400 — when path is missing from body', async () => {
    const res = await request(app)
      .post('/api/files/write')
      .send({ content: 'some content' });

    expect(res.status).toBe(400);
  });

  it('400 — when content is missing from body', async () => {
    const res = await request(app)
      .post('/api/files/write')
      .send({ path: 'out.txt' });

    expect(res.status).toBe(400);
  });

  it('400 — when service returns an error object', async () => {
    filesService.writeFile.mockResolvedValue({ error: 'Permission denied' });

    const res = await request(app)
      .post('/api/files/write')
      .send({ path: 'root.txt', content: 'data' });

    expect(res.status).toBe(400);
  });

  it('500 — when service throws', async () => {
    filesService.writeFile.mockRejectedValue(new Error('disk full'));

    const res = await request(app)
      .post('/api/files/write')
      .send({ path: 'out.txt', content: 'data' });

    expect(res.status).toBe(500);
  });
});
