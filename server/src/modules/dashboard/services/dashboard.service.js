'use strict';

/**
 * DashboardService — in-memory task/workflow tracker with SSE broadcasting.
 *
 * Design notes:
 *  - Does NOT extend BaseService to avoid circular dependency with the logger
 *    (logger → dashboard → base-service → logger).
 *  - TTL cleanup runs every 5 min and prunes completed/failed records > 1 h old.
 *  - Task map is capped at MAX_TASKS; oldest entries are evicted first.
 *  - Log buffer is a fixed-size ring of MAX_LOGS entries.
 */

const MAX_TASKS = 500;   // live task map hard cap
const MAX_HISTORY = 1000;  // task history entries
const MAX_LOGS = 500;   // log ring buffer
const TTL_MS = 60 * 60 * 1000;   // 1 hour
const CLEANUP_MS = 5 * 60 * 1000;   // 5 minutes

class DashboardService {
  constructor() {
    // Task tracking
    this.tasks = new Map();   // taskId → task object (all statuses)
    this.taskHistory = [];          // trimmed snapshot of completed/failed tasks

    // Workflow tracking
    this.workflows = new Map();

    // SSE connections
    this.connections = new Set();

    // Stats counters
    this.stats = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      activeTasks: 0,
      totalWorkflows: 0,
      totalLogs: 0,
      startTime: Date.now()
    };

    // Log ring buffer
    this.logBuffer = [];

    // Start periodic TTL cleanup
    this._cleanupTimer = setInterval(() => this._ttlCleanup(), CLEANUP_MS);
    // Don't keep Node process alive just for this timer
    if (this._cleanupTimer.unref) this._cleanupTimer.unref();
  }

  // ── Task lifecycle ─────────────────────────────────────────────────────────

  registerTask(taskId, metadata = {}) {
    // Evict oldest entry if at cap
    if (this.tasks.size >= MAX_TASKS) {
      const oldestKey = this.tasks.keys().next().value;
      this.tasks.delete(oldestKey);
    }

    const task = {
      id: taskId,
      status: 'pending',
      startTime: null,
      endTime: null,
      duration: null,
      error: null,
      metadata: {
        model: metadata.model || 'unknown',
        stack: metadata.stack || 'default',
        prompt: metadata.prompt || '',
        ...metadata
      },
      steps: [],
      logs: []
    };

    this.tasks.set(taskId, task);
    this.stats.totalTasks++;
    this.stats.activeTasks++;

    this.broadcast('task:created', task);
    this.addLog('info', `Task registered: ${taskId}`, { service: 'dashboard' });
    return task;
  }

  startTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.status = 'running';
    task.startTime = Date.now();
    this.broadcast('task:started', task);
    return task;
  }

  addTaskStep(taskId, step) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    const stepData = {
      id: task.steps.length + 1,
      timestamp: Date.now(),
      action: step.action || 'unknown',
      detail: step.detail || '',
      thought: step.thought || '',
      status: step.status || 'pending',
      details: step.details || {}
    };
    task.steps.push(stepData);
    this.broadcast('task:step', { taskId, step: stepData });
  }

  completeTask(taskId, result = {}) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.status = 'completed';
    task.endTime = Date.now();
    task.duration = task.endTime - (task.startTime || task.endTime);
    task.result = result;
    this.stats.completedTasks++;
    this.stats.activeTasks = Math.max(0, this.stats.activeTasks - 1);
    this._addToHistory(task);
    this.broadcast('task:completed', task);
    this.addLog('info', `Task completed: ${taskId}`, { service: 'dashboard', duration: task.duration });
    return task;
  }

  failTask(taskId, error) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.status = 'failed';
    task.endTime = Date.now();
    task.duration = task.endTime - (task.startTime || task.endTime);
    task.error = error?.message || String(error);
    this.stats.failedTasks++;
    this.stats.activeTasks = Math.max(0, this.stats.activeTasks - 1);
    this._addToHistory(task);
    this.broadcast('task:failed', task);
    this.addLog('error', `Task failed: ${taskId}`, { service: 'dashboard', error: task.error });
    return task;
  }

  // ── Workflow lifecycle ─────────────────────────────────────────────────────

  registerWorkflow(workflowId, metadata = {}) {
    const workflow = {
      id: workflowId,
      status: 'pending',
      startTime: null,
      endTime: null,
      duration: null,
      progress: 0,
      currentStep: 0,
      totalSteps: metadata.totalSteps || 0,
      metadata: {
        name: metadata.name || 'Unnamed Workflow',
        description: metadata.description || '',
        ...metadata
      },
      tasks: []
    };

    this.workflows.set(workflowId, workflow);
    this.stats.totalWorkflows++;
    this.broadcast('workflow:created', workflow);
    return workflow;
  }

  startWorkflow(workflowId) {
    const wf = this.workflows.get(workflowId);
    if (!wf) return null;
    wf.status = 'running';
    wf.startTime = Date.now();
    this.broadcast('workflow:started', wf);
    this.addLog('info', `Workflow started: ${workflowId}`, { service: 'dashboard' });
    return wf;
  }

  updateWorkflowProgress(workflowId, currentStep, totalSteps) {
    const wf = this.workflows.get(workflowId);
    if (!wf) return;
    wf.currentStep = currentStep;
    wf.totalSteps = totalSteps;
    wf.progress = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
    this.broadcast('workflow:progress', { workflowId, currentStep, totalSteps, progress: wf.progress });
  }

  completeWorkflow(workflowId) {
    const wf = this.workflows.get(workflowId);
    if (!wf) return null;
    wf.status = 'completed';
    wf.endTime = Date.now();
    wf.duration = wf.endTime - (wf.startTime || wf.endTime);
    wf.progress = 100;
    this.broadcast('workflow:completed', wf);
    this.addLog('info', `Workflow completed: ${workflowId}`, { service: 'dashboard' });
    return wf;
  }

  // ── Log buffer ─────────────────────────────────────────────────────────────

  /**
   * Add a structured log entry and broadcast to connected clients.
   * This is the canonical log method — does NOT call the global logger to
   * prevent circular calls (global logger → addLog → global logger …).
   */
  addLog(level, message, metadata = {}) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      level,
      message,
      metadata: { service: 'dashboard', ...metadata }
    };

    // Ring buffer: evict oldest when full
    if (this.logBuffer.length >= MAX_LOGS) this.logBuffer.shift();
    this.logBuffer.push(entry);
    this.stats.totalLogs++;

    this.broadcast('log:entry', entry);
    return entry;
  }

  /** Accept a pre-formed log object from external sources (e.g. AgentService). */
  addAgentLog(logData) {
    return this.addLog(
      logData.level || 'info',
      logData.message || '',
      {
        service: 'agent',
        step: logData.step,
        action: logData.action,
        ...logData.metadata
      }
    );
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  getActiveTasks() {
    return Array.from(this.tasks.values())
      .filter(t => t.status === 'running')
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  }

  getAllTasks() {
    return Array.from(this.tasks.values())
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  }

  getTask(taskId) {
    return this.tasks.get(taskId) ?? null;
  }

  getActiveWorkflows() {
    return Array.from(this.workflows.values())
      .filter(w => w.status === 'running')
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  }

  getAllWorkflows() {
    return Array.from(this.workflows.values())
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  }

  getRecentLogs(count = 100, level = null) {
    let logs = this.logBuffer;
    if (level && level !== 'all') logs = logs.filter(l => l.level === level);
    return logs.slice(-count);
  }

  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime,
      activeConnections: this.connections.size,
      bufferedLogs: this.logBuffer.length,
      activeTasks: this.getActiveTasks().length,
      activeWorkflows: this.getActiveWorkflows().length
    };
  }

  getDashboardData() {
    return {
      stats: this.getStats(),
      activeTasks: this.getActiveTasks(),
      recentTasks: this.getAllTasks().slice(0, 20),
      taskHistory: this.taskHistory.slice(0, 50),
      activeWorkflows: this.getActiveWorkflows(),
      recentWorkflows: this.getAllWorkflows().slice(0, 10),
      recentLogs: this.getRecentLogs(100)
    };
  }

  // ── SSE connection management ─────────────────────────────────────────────

  addConnection(response) {
    this.connections.add(response);
    response.on('close', () => this.removeConnection(response));
    // Send full snapshot on connect
    this._sendToConnection(response, 'init', this.getDashboardData());
  }

  removeConnection(response) {
    this.connections.delete(response);
  }

  broadcast(event, data) {
    if (this.connections.size === 0) return;
    for (const conn of this.connections) {
      this._sendToConnection(conn, event, data);
    }
  }

  _sendToConnection(response, event, data) {
    try {
      if (!response.writableEnded) {
        response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    } catch {
      this.removeConnection(response);
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  _addToHistory(task) {
    this.taskHistory.unshift({
      id: task.id,
      status: task.status,
      error: task.error || null,
      startTime: task.startTime,
      endTime: task.endTime,
      duration: task.duration,
      metadata: task.metadata
    });
    if (this.taskHistory.length > MAX_HISTORY) this.taskHistory.pop();
  }

  /**
   * TTL cleanup — removes completed/failed tasks and workflows older than 1 hour.
   * Runs automatically every CLEANUP_MS (5 min).
   */
  _ttlCleanup() {
    const cutoff = Date.now() - TTL_MS;
    let removed = 0;

    for (const [id, task] of this.tasks) {
      if (task.endTime && task.endTime < cutoff) {
        this.tasks.delete(id);
        removed++;
      }
    }

    for (const [id, wf] of this.workflows) {
      if (wf.endTime && wf.endTime < cutoff) {
        this.workflows.delete(id);
      }
    }

    if (removed > 0) {
      this.addLog('debug', `TTL cleanup: removed ${removed} old task(s)`, { service: 'dashboard' });
    }
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  clearAll() {
    this.tasks.clear();
    this.workflows.clear();
    this.logBuffer = [];
    this.taskHistory = [];
    this.stats = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      activeTasks: 0,
      totalWorkflows: 0,
      totalLogs: 0,
      startTime: Date.now()
    };
    this.broadcast('dashboard:cleared', { timestamp: Date.now() });
  }
}

module.exports = new DashboardService();
