'use strict';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('fs-extra', () => ({
  appendFile: jest.fn().mockResolvedValue(),
}));
jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('{}'),
  appendFile:   jest.fn(),
  existsSync:   jest.fn().mockReturnValue(true),
}));
jest.mock('../../../src/config', () => ({
  lmStudio:   { model: 'test-model', baseUrl: 'http://localhost:1234' },
  projectRoot: '/workspace',
  workspaceDir: '/workspace',
  reportsDir:  'agent_reports',
  agent:       { maxReviewLoops: 3 },
}));
jest.mock('../../../src/modules/agent/services/agent.service', () => ({
  runAgent:    jest.fn(),
  stopAgent:   jest.fn(),
  loadSession: jest.fn(),
  clearSession: jest.fn(),
  exportAnalysisToHtml: jest.fn().mockReturnValue('<html></html>'),
}));
jest.mock('../../../src/modules/settings/services/settings.service', () => ({
  load: jest.fn().mockResolvedValue({ workspacePath: '' }),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const agentService = require('../../../src/modules/agent/services/agent.service');
const controller   = require('../../../src/modules/agent/controllers/agent.controller');

// ── SSE helpers ───────────────────────────────────────────────────────────────

function makeSseRes() {
  const res = {
    writableEnded: false,
    _chunks: [],
    _headers: {},
    _statusCode: null,
  };
  res.setHeader   = jest.fn((k, v) => { res._headers[k] = v; });
  res.flushHeaders = jest.fn();
  res.write       = jest.fn((chunk) => res._chunks.push(chunk));
  res.flush       = jest.fn();
  res.end         = jest.fn(() => { res.writableEnded = true; });
  res.on          = jest.fn((event, cb) => { res._closeCb = cb; });
  res.status      = jest.fn(() => res);
  res.json        = jest.fn();

  // Helper: parse all SSE events from writes
  res.parsedEvents = () => res._chunks
    .map(c => {
      const match = String(c).match(/^data: (.+)\n/);
      return match ? JSON.parse(match[1]) : null;
    })
    .filter(Boolean);

  return res;
}

function makeReq(body = {}) {
  return { body, on: jest.fn(), params: {}, query: {} };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentController.run()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Request body extraction ───────────────────────────────────────────────

  describe('request body extraction', () => {
    it('passes isHandoff=true from req.body to AgentService.runAgent', async () => {
      agentService.runAgent.mockResolvedValue({
        success: true,
        result: { wasReviewRequested: false },
        taskId: 't1',
      });

      const req = makeReq({
        messages:  [{ role: 'user', content: 'review the code' }],
        isHandoff: true,
        sessionId: 'session-abc',
        orchestrator: 'classic',
      });
      const res = makeSseRes();

      await controller.run(req, res);

      const call = agentService.runAgent.mock.calls[0][0];
      expect(call.isHandoff).toBe(true);
      expect(call.sessionId).toBe('session-abc');
    });

    it('passes isHandoff=false when not provided in req.body', async () => {
      agentService.runAgent.mockResolvedValue({
        success: true,
        result: { wasReviewRequested: false },
        taskId: 't2',
      });

      const req = makeReq({
        messages: [{ role: 'user', content: 'build an API' }],
        // isHandoff not provided
      });
      const res = makeSseRes();

      await controller.run(req, res);

      const call = agentService.runAgent.mock.calls[0][0];
      expect(call.isHandoff).toBe(false);
    });

    it('passes autoRequestReview from req.body to AgentService.runAgent', async () => {
      agentService.runAgent.mockResolvedValue({
        success: true,
        result: { wasReviewRequested: false },
        taskId: 't3',
      });

      const req = makeReq({
        messages:          [{ role: 'user', content: 'build an app' }],
        autoRequestReview: true,
      });
      const res = makeSseRes();

      await controller.run(req, res);

      const call = agentService.runAgent.mock.calls[0][0];
      expect(call.autoRequestReview).toBe(true);
    });
  });

  // ── done event: wasReviewRequested ────────────────────────────────────────

  describe('done event includes wasReviewRequested', () => {
    it('sends wasReviewRequested=true in done event when agent called request_review', async () => {
      agentService.runAgent.mockResolvedValue({
        success: true,
        result: { wasReviewRequested: true },
        taskId: 't4',
      });

      const req = makeReq({
        messages:          [{ role: 'user', content: 'build REST API' }],
        autoRequestReview: true,
      });
      const res = makeSseRes();

      await controller.run(req, res);

      const doneEvent = res.parsedEvents().find(e => e.type === 'done');
      expect(doneEvent).toBeDefined();
      expect(doneEvent.wasReviewRequested).toBe(true);
    });

    it('sends wasReviewRequested=false in done event when agent did NOT call request_review', async () => {
      agentService.runAgent.mockResolvedValue({
        success: true,
        result: { wasReviewRequested: false },
        taskId: 't5',
      });

      const req = makeReq({
        messages: [{ role: 'user', content: 'build REST API' }],
      });
      const res = makeSseRes();

      await controller.run(req, res);

      const doneEvent = res.parsedEvents().find(e => e.type === 'done');
      expect(doneEvent).toBeDefined();
      expect(doneEvent.wasReviewRequested).toBe(false);
    });

    it('sends wasReviewRequested=false when result is missing (agent threw)', async () => {
      agentService.runAgent.mockRejectedValue(new Error('LLM error'));

      const req = makeReq({
        messages: [{ role: 'user', content: 'build REST API' }],
      });
      const res = makeSseRes();

      await controller.run(req, res);

      const errorEvent = res.parsedEvents().find(e => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent.message).toBe('LLM error');
      // done event is not sent on error
      const doneEvent = res.parsedEvents().find(e => e.type === 'done');
      expect(doneEvent).toBeUndefined();
    });
  });

  // ── SSE stream setup ──────────────────────────────────────────────────────

  describe('SSE stream setup', () => {
    it('sets correct SSE headers', async () => {
      agentService.runAgent.mockResolvedValue({
        success: true,
        result: { wasReviewRequested: false },
        taskId: 't6',
      });

      const req = makeReq({ messages: [{ role: 'user', content: 'test' }] });
      const res = makeSseRes();

      await controller.run(req, res);

      expect(res._headers['Content-Type']).toBe('text/event-stream');
      expect(res._headers['Cache-Control']).toBe('no-cache');
      expect(res._headers['Connection']).toBe('keep-alive');
    });

    it('rejects empty messages array', async () => {
      const req = makeReq({ messages: [] });
      const res = makeSseRes();

      await controller.run(req, res);

      // Should have responded with a 400-like error (badRequest)
      expect(agentService.runAgent).not.toHaveBeenCalled();
    });

    it('rejects missing messages', async () => {
      const req = makeReq({});
      const res = makeSseRes();

      await controller.run(req, res);

      expect(agentService.runAgent).not.toHaveBeenCalled();
    });
  });

  // ── Full Dev→Review handoff cycle (integration-style) ────────────────────

  describe('Dev→Review handoff cycle', () => {
    it('developer run: done event signals wasReviewRequested=true for handoff trigger', async () => {
      agentService.runAgent.mockResolvedValue({
        success: true,
        result: {
          wasReviewRequested: true,
          response: 'ACTION: request_review\nPARAMETERS: {}',
          history: [
            { role: 'user',      content: '[MODE: GENERATE] Build a REST API' },
            { role: 'assistant', content: 'ACTION: request_review\nPARAMETERS: {}' },
            { role: 'user',      content: 'Tool result (request_review): Review request logged.' },
          ],
        },
        taskId: 'dev-task-1',
      });

      const req = makeReq({
        messages:          [{ role: 'user', content: '[MODE: GENERATE] Build a REST API' }],
        autoRequestReview: true,
        sessionId:         'shared-session',
        orchestrator:      'classic',
      });
      const res = makeSseRes();

      await controller.run(req, res);

      const doneEvent = res.parsedEvents().find(e => e.type === 'done');
      expect(doneEvent.wasReviewRequested).toBe(true);
    });

    it('review run: isHandoff=true causes session merge for full developer context', async () => {
      agentService.runAgent.mockResolvedValue({
        success: true,
        result: {
          wasReviewRequested: false,
          response: '[CODE: NOT OK] Found issues.',
          history: [],
        },
        taskId: 'review-task-1',
      });

      const req = makeReq({
        messages: [{ role: 'user', content: '[MODE: REVIEW] Please review the code.' }],
        autoRequestReview: true,
        sessionId: 'shared-session',
        isHandoff: true,
        orchestrator: 'classic',
      });
      const res = makeSseRes();

      await controller.run(req, res);

      // Controller must pass isHandoff=true to AgentService
      const call = agentService.runAgent.mock.calls[0][0];
      expect(call.isHandoff).toBe(true);
      expect(call.sessionId).toBe('shared-session');
    });

    it('done event wasReviewRequested=false for review agent (review never calls request_review)', async () => {
      agentService.runAgent.mockResolvedValue({
        success: true,
        result: { wasReviewRequested: false, response: '[CODE: NOT OK] Fix the bugs.' },
        taskId: 'review-task-2',
      });

      const req = makeReq({
        messages:  [{ role: 'user', content: '[MODE: REVIEW] Review the code.' }],
        isHandoff: true,
        sessionId: 'shared-session',
      });
      const res = makeSseRes();

      await controller.run(req, res);

      const doneEvent = res.parsedEvents().find(e => e.type === 'done');
      expect(doneEvent.wasReviewRequested).toBe(false);
    });

    it('second developer run (fix cycle): isHandoff=true provides review context', async () => {
      agentService.runAgent.mockResolvedValue({
        success: true,
        result: { wasReviewRequested: true, response: 'Fixed and re-requesting review.' },
        taskId: 'dev-task-2',
      });

      const req = makeReq({
        messages: [{
          role: 'user',
          content: '[MODE: GENERATE] [FOLLOW REVIEW] [CODE: NOT OK] Fix issues and call request_review.',
        }],
        autoRequestReview: true,
        sessionId:  'shared-session',
        isHandoff:  true,
        orchestrator: 'classic',
      });
      const res = makeSseRes();

      await controller.run(req, res);

      const call = agentService.runAgent.mock.calls[0][0];
      expect(call.isHandoff).toBe(true);
      expect(call.autoRequestReview).toBe(true);

      const doneEvent = res.parsedEvents().find(e => e.type === 'done');
      expect(doneEvent.wasReviewRequested).toBe(true); // ready for next review handoff
    });
  });
});
