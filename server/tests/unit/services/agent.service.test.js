'use strict';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('fs-extra', () => ({
  appendFile: jest.fn().mockResolvedValue(),
}));
jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('{}'),
  appendFile: jest.fn(),
}));

jest.mock('../../../src/agent/core', () => ({
  runAgent:      jest.fn(),
  runAgentGraph: jest.fn(),
}));

jest.mock('../../../src/utils/session', () => ({
  loadSession: jest.fn(),
  saveSession: jest.fn(),
  clearSession: jest.fn(),
}));

jest.mock('../../../src/config', () => ({
  lmStudio: { model: 'test-model' },
  projectRoot: '/workspace',
}));

jest.mock('../../../src/modules/dashboard/services/dashboard.service', () => ({
  registerTask:  jest.fn(),
  startTask:     jest.fn(),
  completeTask:  jest.fn(),
  failTask:      jest.fn(),
  addTaskStep:   jest.fn(),
  addAgentLog:   jest.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

const { runAgent, runAgentGraph } = require('../../../src/agent/core');
const { loadSession }              = require('../../../src/utils/session');
const dashboardService             = require('../../../src/modules/dashboard/services/dashboard.service');

// AgentService is a singleton — isolate module for each test
let agentService;
beforeEach(() => {
  jest.resetModules();

  // Re-apply the mocks after resetModules so the fresh require gets them
  jest.mock('../../../src/agent/core', () => ({
    runAgent:      jest.fn(),
    runAgentGraph: jest.fn(),
  }));
  jest.mock('../../../src/utils/session', () => ({
    loadSession: jest.fn(),
    saveSession: jest.fn(),
    clearSession: jest.fn(),
  }));
  jest.mock('../../../src/config', () => ({
    lmStudio: { model: 'test-model' },
    projectRoot: '/workspace',
  }));
  jest.mock('../../../src/modules/dashboard/services/dashboard.service', () => ({
    registerTask: jest.fn(),
    startTask:    jest.fn(),
    completeTask: jest.fn(),
    failTask:     jest.fn(),
    addTaskStep:  jest.fn(),
    addAgentLog:  jest.fn(),
  }));
  jest.mock('fs-extra', () => ({
    appendFile: jest.fn().mockResolvedValue(),
  }));
  jest.mock('fs', () => ({
    readFileSync: jest.fn().mockReturnValue('{}'),
    appendFile: jest.fn(),
  }));

  agentService = require('../../../src/modules/agent/services/agent.service');
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CLIENT_MESSAGES = [
  { role: 'user', content: '[MODE: GENERATE] Build a REST API' },
];

const SESSION_HISTORY = [
  { role: 'user',      content: '[MODE: GENERATE] Build a REST API' },
  { role: 'assistant', content: 'ACTION: scaffold_project\nPARAMETERS: {"name":"api"}' },
  { role: 'user',      content: 'Tool result (scaffold_project): success' },
  { role: 'assistant', content: 'ACTION: write_file\nPARAMETERS: {"path":"api/index.js","content":"..."}' },
  { role: 'user',      content: 'Tool result (write_file): success' },
];

const HANDOFF_MESSAGE = { role: 'user', content: '[MODE: REVIEW] Developer has finished. Please review the code.' };

function makeAgentResult(overrides = {}) {
  return {
    success: true,
    response: 'Done.',
    history: [],
    wasReviewRequested: false,
    ...overrides,
  };
}

function makeParams(overrides = {}) {
  return {
    messages:          CLIENT_MESSAGES,
    fastMode:          false,
    autoRequestReview: false,
    sessionId:         null,
    isHandoff:         false,
    orchestrator:      'classic',
    workspaceDir:      '/workspace',
    projectRoot:       '/workspace',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentService', () => {

  // ── Non-handoff: uses client messages as-is ──────────────────────────────
  describe('runAgent() without handoff', () => {
    it('passes client messages directly to the agent function', async () => {
      const { runAgent: mockRun } = require('../../../src/agent/core');
      mockRun.mockResolvedValue(makeAgentResult());

      await agentService.runAgent(makeParams(), jest.fn());

      expect(mockRun).toHaveBeenCalledTimes(1);
      const callArgs = mockRun.mock.calls[0][0];
      expect(callArgs.messages).toBe(CLIENT_MESSAGES);
    });

    it('returns success with result and taskId', async () => {
      const { runAgent: mockRun } = require('../../../src/agent/core');
      const agentResult = makeAgentResult({ response: 'Task done.' });
      mockRun.mockResolvedValue(agentResult);

      const out = await agentService.runAgent(makeParams(), jest.fn());

      expect(out.success).toBe(true);
      expect(out.result).toBe(agentResult);
      expect(out.taskId).toMatch(/^task-/);
    });

    it('uses runAgent (classic) when orchestrator is "classic"', async () => {
      const { runAgent: mockRun, runAgentGraph: mockGraph } = require('../../../src/agent/core');
      mockRun.mockResolvedValue(makeAgentResult());

      await agentService.runAgent(makeParams({ orchestrator: 'classic' }), jest.fn());

      expect(mockRun).toHaveBeenCalledTimes(1);
      expect(mockGraph).not.toHaveBeenCalled();
    });

    it('uses runAgentGraph when orchestrator is "langgraph"', async () => {
      const { runAgent: mockRun, runAgentGraph: mockGraph } = require('../../../src/agent/core');
      mockGraph.mockResolvedValue(makeAgentResult());

      await agentService.runAgent(makeParams({ orchestrator: 'langgraph' }), jest.fn());

      expect(mockGraph).toHaveBeenCalledTimes(1);
      expect(mockRun).not.toHaveBeenCalled();
    });
  });

  // ── Handoff: loads session and prepends history ───────────────────────────
  describe('runAgent() with isHandoff=true', () => {
    it('loads session and prepends history when isHandoff=true and session exists', async () => {
      const { runAgent: mockRun } = require('../../../src/agent/core');
      const { loadSession: mockLoad } = require('../../../src/utils/session');

      mockLoad.mockResolvedValue({ history: SESSION_HISTORY });
      mockRun.mockResolvedValue(makeAgentResult());

      const handoffMessages = [HANDOFF_MESSAGE];
      await agentService.runAgent(makeParams({
        messages:  handoffMessages,
        sessionId: 'session-abc',
        isHandoff: true,
      }), jest.fn());

      const callArgs = mockRun.mock.calls[0][0];
      // Context = session history + last client message
      expect(callArgs.messages).toHaveLength(SESSION_HISTORY.length + 1);
      expect(callArgs.messages[0]).toEqual(SESSION_HISTORY[0]);
      expect(callArgs.messages[callArgs.messages.length - 1]).toBe(HANDOFF_MESSAGE);
    });

    it('only appends the last client message, not the full client array', async () => {
      const { runAgent: mockRun } = require('../../../src/agent/core');
      const { loadSession: mockLoad } = require('../../../src/utils/session');

      mockLoad.mockResolvedValue({ history: SESSION_HISTORY });
      mockRun.mockResolvedValue(makeAgentResult());

      // Client sends 3 messages — only the last one should be appended
      const multipleClientMessages = [
        { role: 'user', content: 'Old message 1' },
        { role: 'assistant', content: 'Old response 1' },
        HANDOFF_MESSAGE,
      ];
      await agentService.runAgent(makeParams({
        messages:  multipleClientMessages,
        sessionId: 'session-abc',
        isHandoff: true,
      }), jest.fn());

      const callArgs = mockRun.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(SESSION_HISTORY.length + 1);
      expect(callArgs.messages[callArgs.messages.length - 1]).toBe(HANDOFF_MESSAGE);
    });

    it('falls back to client messages when session is empty', async () => {
      const { runAgent: mockRun } = require('../../../src/agent/core');
      const { loadSession: mockLoad } = require('../../../src/utils/session');

      mockLoad.mockResolvedValue({ history: [] }); // empty session
      mockRun.mockResolvedValue(makeAgentResult());

      await agentService.runAgent(makeParams({
        messages:  CLIENT_MESSAGES,
        sessionId: 'session-empty',
        isHandoff: true,
      }), jest.fn());

      const callArgs = mockRun.mock.calls[0][0];
      expect(callArgs.messages).toBe(CLIENT_MESSAGES);
    });

    it('falls back to client messages when loadSession throws', async () => {
      const { runAgent: mockRun } = require('../../../src/agent/core');
      const { loadSession: mockLoad } = require('../../../src/utils/session');

      mockLoad.mockRejectedValue(new Error('disk error'));
      mockRun.mockResolvedValue(makeAgentResult());

      await agentService.runAgent(makeParams({
        messages:  CLIENT_MESSAGES,
        sessionId: 'session-bad',
        isHandoff: true,
      }), jest.fn());

      const callArgs = mockRun.mock.calls[0][0];
      expect(callArgs.messages).toBe(CLIENT_MESSAGES);
    });

    it('does not load session when isHandoff=false even if sessionId is set', async () => {
      const { runAgent: mockRun } = require('../../../src/agent/core');
      const { loadSession: mockLoad } = require('../../../src/utils/session');

      mockRun.mockResolvedValue(makeAgentResult());

      await agentService.runAgent(makeParams({
        messages:  CLIENT_MESSAGES,
        sessionId: 'session-abc',
        isHandoff: false,
      }), jest.fn());

      expect(mockLoad).not.toHaveBeenCalled();
      const callArgs = mockRun.mock.calls[0][0];
      expect(callArgs.messages).toBe(CLIENT_MESSAGES);
    });
  });

  // ── wasReviewRequested propagation ────────────────────────────────────────
  describe('wasReviewRequested propagation', () => {
    it('propagates wasReviewRequested=true from agent result', async () => {
      const { runAgent: mockRun } = require('../../../src/agent/core');
      mockRun.mockResolvedValue(makeAgentResult({ wasReviewRequested: true }));

      const out = await agentService.runAgent(makeParams(), jest.fn());

      expect(out.result.wasReviewRequested).toBe(true);
    });

    it('propagates wasReviewRequested=false when agent did not call request_review', async () => {
      const { runAgent: mockRun } = require('../../../src/agent/core');
      mockRun.mockResolvedValue(makeAgentResult({ wasReviewRequested: false }));

      const out = await agentService.runAgent(makeParams(), jest.fn());

      expect(out.result.wasReviewRequested).toBe(false);
    });

    it('propagates wasReviewRequested=true from LangGraph result', async () => {
      const { runAgentGraph: mockGraph } = require('../../../src/agent/core');
      mockGraph.mockResolvedValue(makeAgentResult({ wasReviewRequested: true, isLangGraph: true }));

      const out = await agentService.runAgent(
        makeParams({ orchestrator: 'langgraph' }),
        jest.fn()
      );

      expect(out.result.wasReviewRequested).toBe(true);
    });
  });

  // ── review_requested SSE event ────────────────────────────────────────────
  describe('review_requested SSE event forwarding', () => {
    it('forwards review_requested event through wrappedOnStep to onStep callback', async () => {
      const { runAgent: mockRun } = require('../../../src/agent/core');

      // Simulate the agent emitting review_requested via onStep
      mockRun.mockImplementation(async ({ onStep }) => {
        onStep({ type: 'review_requested' });
        return makeAgentResult({ wasReviewRequested: true });
      });

      const capturedEvents = [];
      await agentService.runAgent(makeParams(), (ev) => capturedEvents.push(ev));

      expect(capturedEvents).toContainEqual({ type: 'review_requested' });
    });

    it('filters out chunk events but passes review_requested through', async () => {
      const { runAgent: mockRun } = require('../../../src/agent/core');

      mockRun.mockImplementation(async ({ onStep }) => {
        onStep({ type: 'chunk', content: 'hello' }); // should be filtered
        onStep({ type: 'review_requested' });          // should pass through
        return makeAgentResult({ wasReviewRequested: true });
      });

      const capturedEvents = [];
      await agentService.runAgent(makeParams(), (ev) => capturedEvents.push(ev));

      expect(capturedEvents).not.toContainEqual(expect.objectContaining({ type: 'chunk' }));
      expect(capturedEvents).toContainEqual({ type: 'review_requested' });
    });
  });

  // ── autoRequestReview flag ────────────────────────────────────────────────
  describe('autoRequestReview flag', () => {
    it('passes autoRequestReview=true to agent function', async () => {
      const { runAgent: mockRun } = require('../../../src/agent/core');
      mockRun.mockResolvedValue(makeAgentResult());

      await agentService.runAgent(makeParams({ autoRequestReview: true }), jest.fn());

      const callArgs = mockRun.mock.calls[0][0];
      expect(callArgs.autoRequestReview).toBe(true);
    });

    it('coerces autoRequestReview to boolean false', async () => {
      const { runAgent: mockRun } = require('../../../src/agent/core');
      mockRun.mockResolvedValue(makeAgentResult());

      await agentService.runAgent(makeParams({ autoRequestReview: undefined }), jest.fn());

      const callArgs = mockRun.mock.calls[0][0];
      expect(callArgs.autoRequestReview).toBe(false);
    });
  });

  // ── stopAgent ────────────────────────────────────────────────────────────
  describe('stopAgent()', () => {
    it('returns failure when no agent is running', () => {
      const result = agentService.stopAgent();
      expect(result.success).toBe(false);
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────
  describe('error handling', () => {
    it('calls dashboardService.failTask and re-throws on agent error', async () => {
      const { runAgent: mockRun } = require('../../../src/agent/core');
      const dashboard = require('../../../src/modules/dashboard/services/dashboard.service');
      mockRun.mockRejectedValue(new Error('LLM unavailable'));

      await expect(agentService.runAgent(makeParams(), jest.fn()))
        .rejects.toThrow('LLM unavailable');

      expect(dashboard.failTask).toHaveBeenCalled();
    });
  });
});
