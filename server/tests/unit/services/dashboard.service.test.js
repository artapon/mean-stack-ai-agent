'use strict';

// DashboardService is a singleton — require a fresh instance for each suite
// by resetting the module registry before each test file.
const DashboardService = require('../../../src/modules/dashboard/services/dashboard.service');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFakeRes() {
  const res = { writableEnded: false, events: [] };
  res.write  = jest.fn((chunk) => res.events.push(chunk));
  res.on     = jest.fn((event, cb) => { res._closeCb = cb; });
  return res;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('DashboardService', () => {

  beforeEach(() => {
    DashboardService.clearAll();
  });

  // ── Task lifecycle ──────────────────────────────────────────────────────────

  describe('registerTask()', () => {
    it('creates a task with pending status', () => {
      const task = DashboardService.registerTask('t1', { model: 'gpt-4', stack: 'default' });

      expect(task.id).toBe('t1');
      expect(task.status).toBe('pending');
      expect(task.steps).toEqual([]);
      expect(task.metadata.model).toBe('gpt-4');
    });

    it('increments totalTasks counter', () => {
      DashboardService.registerTask('t2');
      const stats = DashboardService.getStats();
      expect(stats.totalTasks).toBeGreaterThanOrEqual(1);
    });
  });

  describe('startTask()', () => {
    it('sets status to running and records startTime', () => {
      DashboardService.registerTask('t3');
      const task = DashboardService.startTask('t3');

      expect(task.status).toBe('running');
      expect(task.startTime).toBeGreaterThan(0);
    });

    it('returns null for unknown taskId', () => {
      const result = DashboardService.startTask('ghost');
      expect(result).toBeNull();
    });
  });

  describe('addTaskStep()', () => {
    it('appends a step with auto-incremented id', () => {
      DashboardService.registerTask('t4');
      DashboardService.addTaskStep('t4', { action: 'read_file', detail: 'src/app.js', status: 'completed' });
      DashboardService.addTaskStep('t4', { action: 'write_file', detail: 'dist/app.js', status: 'pending' });

      const task = DashboardService.getTask('t4');
      expect(task.steps).toHaveLength(2);
      expect(task.steps[0].id).toBe(1);
      expect(task.steps[1].id).toBe(2);
      expect(task.steps[0].action).toBe('read_file');
    });

    it('is a no-op for unknown taskId', () => {
      expect(() => DashboardService.addTaskStep('ghost', {})).not.toThrow();
    });
  });

  describe('completeTask()', () => {
    it('sets status to completed and calculates duration', () => {
      DashboardService.registerTask('t5');
      DashboardService.startTask('t5');
      const task = DashboardService.completeTask('t5', { iterations: 3 });

      expect(task.status).toBe('completed');
      expect(task.endTime).toBeGreaterThan(0);
      expect(task.duration).toBeGreaterThanOrEqual(0);
      expect(task.result.iterations).toBe(3);
    });

    it('decrements activeTasks stat', () => {
      DashboardService.registerTask('t6');
      DashboardService.startTask('t6');
      const before = DashboardService.getStats().activeTasks;
      DashboardService.completeTask('t6');
      const after = DashboardService.getStats().activeTasks;

      expect(after).toBe(Math.max(0, before - 1));
    });

    it('adds task to history', () => {
      DashboardService.registerTask('t7');
      DashboardService.completeTask('t7');

      expect(DashboardService.taskHistory.length).toBeGreaterThan(0);
      expect(DashboardService.taskHistory[0].id).toBe('t7');
    });

    it('returns null for unknown taskId', () => {
      expect(DashboardService.completeTask('ghost')).toBeNull();
    });
  });

  describe('failTask()', () => {
    it('sets status to failed with error message', () => {
      DashboardService.registerTask('t8');
      const task = DashboardService.failTask('t8', new Error('timeout'));

      expect(task.status).toBe('failed');
      expect(task.error).toBe('timeout');
    });

    it('increments failedTasks stat', () => {
      DashboardService.registerTask('t9');
      DashboardService.failTask('t9', new Error('boom'));
      expect(DashboardService.getStats().failedTasks).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Queries ────────────────────────────────────────────────────────────────

  describe('getActiveTasks()', () => {
    it('returns only running tasks', () => {
      DashboardService.registerTask('active1');
      DashboardService.startTask('active1');
      DashboardService.registerTask('pending1');   // stays pending
      DashboardService.registerTask('done1');
      DashboardService.completeTask('done1');

      const active = DashboardService.getActiveTasks();
      expect(active.every(t => t.status === 'running')).toBe(true);
      expect(active.find(t => t.id === 'active1')).toBeTruthy();
    });
  });

  describe('getTask()', () => {
    it('returns task by id', () => {
      DashboardService.registerTask('find-me', { model: 'mistral' });
      const task = DashboardService.getTask('find-me');
      expect(task.metadata.model).toBe('mistral');
    });

    it('returns null for missing id', () => {
      expect(DashboardService.getTask('nope')).toBeNull();
    });
  });

  // ── Log buffer ─────────────────────────────────────────────────────────────

  describe('addLog()', () => {
    it('adds an entry to the log buffer', () => {
      DashboardService.addLog('info', 'test message', { service: 'test' });
      const logs = DashboardService.getRecentLogs(10);
      expect(logs.some(l => l.message === 'test message')).toBe(true);
    });

    it('assigns a unique id and timestamp to each entry', () => {
      DashboardService.addLog('info', 'entry A');
      DashboardService.addLog('warn', 'entry B');
      const logs = DashboardService.getRecentLogs(10);
      const ids  = logs.map(l => l.id);
      expect(new Set(ids).size).toBe(ids.length); // all unique
    });

    it('filters by level', () => {
      DashboardService.addLog('info',  'info log');
      DashboardService.addLog('error', 'error log');
      const errors = DashboardService.getRecentLogs(100, 'error');
      expect(errors.every(l => l.level === 'error')).toBe(true);
    });
  });

  // ── Stats ──────────────────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('includes uptime and activeConnections', () => {
      const stats = DashboardService.getStats();
      expect(typeof stats.uptime).toBe('number');
      expect(typeof stats.activeConnections).toBe('number');
    });
  });

  // ── SSE broadcast ──────────────────────────────────────────────────────────

  describe('broadcast()', () => {
    it('writes SSE event to all connected responses', () => {
      const res1 = makeFakeRes();
      const res2 = makeFakeRes();
      DashboardService.addConnection(res1);
      DashboardService.addConnection(res2);

      DashboardService.broadcast('test:event', { hello: 'world' });

      // addConnection() sends an 'init' event on connect, then broadcast adds another write
      expect(res1.write.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(res2.write.mock.calls.length).toBeGreaterThanOrEqual(2);

      // The broadcast write is the last call
      const written = res1.write.mock.calls.at(-1)[0];
      expect(written).toContain('event: test:event');
      expect(written).toContain('"hello":"world"');

      // cleanup
      DashboardService.removeConnection(res1);
      DashboardService.removeConnection(res2);
    });

    it('removes a connection when its response stream ends', () => {
      const res = makeFakeRes();
      DashboardService.addConnection(res);
      expect(DashboardService.connections.has(res)).toBe(true);

      // Simulate client disconnect
      res._closeCb?.();
      expect(DashboardService.connections.has(res)).toBe(false);
    });
  });

  // ── clearAll ───────────────────────────────────────────────────────────────

  describe('clearAll()', () => {
    it('resets tasks, logs, history and stats', () => {
      DashboardService.registerTask('x1');
      DashboardService.addLog('info', 'noise');
      DashboardService.clearAll();

      expect(DashboardService.tasks.size).toBe(0);
      expect(DashboardService.logBuffer).toHaveLength(0);
      expect(DashboardService.taskHistory).toHaveLength(0);
      expect(DashboardService.getStats().totalTasks).toBe(0);
    });
  });
});
