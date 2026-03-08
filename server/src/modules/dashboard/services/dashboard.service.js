const EventEmitter = require('events');
const BaseService = require('../../../core/base.service');
const config = require('../../../config');
const path = require('path');
const fs = require('fs-extra');

/**
 * DashboardService - Tracks agent tasks, workflows, and streams real-time logs
 */
class DashboardService extends BaseService {
  constructor() {
    super({ serviceName: 'DashboardService' });
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);
    
    // Task tracking
    this.tasks = new Map();
    this.taskHistory = [];
    this.maxHistorySize = 1000;
    
    // Workflow tracking
    this.workflows = new Map();
    
    // Active connections for SSE
    this.connections = new Set();
    
    // Stats
    this.stats = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      activeTasks: 0,
      startTime: Date.now()
    };
    
    this.logBuffer = [];
    this.maxBufferSize = 500;
  }

  /**
   * Register a new task
   */
  registerTask(taskId, metadata = {}) {
    const task = {
      id: taskId,
      status: 'pending',
      startTime: null,
      endTime: null,
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
    this.log('info', `Task registered: ${taskId}`, { task });
    
    return task;
  }

  /**
   * Start a task
   */
  startTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    
    task.status = 'running';
    task.startTime = Date.now();
    
    this.broadcast('task:started', task);
    this.log('info', `Task started: ${taskId}`);
    
    return task;
  }

  /**
   * Add step to task
   */
  addTaskStep(taskId, step) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    
    const stepData = {
      id: task.steps.length + 1,
      timestamp: Date.now(),
      action: step.action || 'unknown',
      status: step.status || 'pending',
      details: step.details || {}
    };
    
    task.steps.push(stepData);
    this.broadcast('task:step', { taskId, step: stepData });
  }

  /**
   * Complete a task
   */
  completeTask(taskId, result = {}) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    
    task.status = 'completed';
    task.endTime = Date.now();
    task.duration = task.endTime - task.startTime;
    task.result = result;
    
    this.stats.completedTasks++;
    this.stats.activeTasks--;
    
    this.addToHistory(task);
    this.broadcast('task:completed', task);
    this.log('info', `Task completed: ${taskId}`, { duration: task.duration });
    
    return task;
  }

  /**
   * Fail a task
   */
  failTask(taskId, error) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    
    task.status = 'failed';
    task.endTime = Date.now();
    task.duration = task.endTime - task.startTime;
    task.error = error.message || error;
    
    this.stats.failedTasks++;
    this.stats.activeTasks--;
    
    this.addToHistory(task);
    this.broadcast('task:failed', task);
    this.log('error', `Task failed: ${taskId}`, { error: task.error });
    
    return task;
  }

  /**
   * Register a workflow
   */
  registerWorkflow(workflowId, metadata = {}) {
    const workflow = {
      id: workflowId,
      status: 'pending',
      startTime: null,
      endTime: null,
      metadata: {
        name: metadata.name || 'Unnamed Workflow',
        description: metadata.description || '',
        ...metadata
      },
      tasks: [],
      currentStep: 0,
      totalSteps: metadata.totalSteps || 0
    };
    
    this.workflows.set(workflowId, workflow);
    this.broadcast('workflow:created', workflow);
    
    return workflow;
  }

  /**
   * Start workflow
   */
  startWorkflow(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return null;
    
    workflow.status = 'running';
    workflow.startTime = Date.now();
    
    this.broadcast('workflow:started', workflow);
    this.log('info', `Workflow started: ${workflowId}`);
    
    return workflow;
  }

  /**
   * Update workflow progress
   */
  updateWorkflowProgress(workflowId, currentStep, totalSteps) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;
    
    workflow.currentStep = currentStep;
    workflow.totalSteps = totalSteps;
    workflow.progress = Math.round((currentStep / totalSteps) * 100);
    
    this.broadcast('workflow:progress', { workflowId, currentStep, totalSteps, progress: workflow.progress });
  }

  /**
   * Complete workflow
   */
  completeWorkflow(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return null;
    
    workflow.status = 'completed';
    workflow.endTime = Date.now();
    workflow.duration = workflow.endTime - workflow.startTime;
    
    this.broadcast('workflow:completed', workflow);
    this.log('info', `Workflow completed: ${workflowId}`);
    
    return workflow;
  }

  /**
   * Add log entry
   */
  addLog(level, message, metadata = {}) {
    const entry = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      level,
      message,
      metadata,
      service: metadata.service || 'dashboard'
    };
    
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }
    
    this.broadcast('log:entry', entry);
    return entry;
  }

  /**
   * Add agent log from external source
   */
  addAgentLog(logData) {
    const entry = {
      id: logData.id || Date.now() + Math.random().toString(36).substr(2, 9),
      timestamp: logData.timestamp || Date.now(),
      level: logData.level || 'info',
      message: logData.message || '',
      metadata: {
        service: 'agent',
        step: logData.step,
        action: logData.action,
        ...logData.metadata
      }
    };
    
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }
    
    this.broadcast('log:entry', entry);
  }

  /**
   * Get recent logs
   */
  getRecentLogs(count = 100, level = null) {
    let logs = [...this.logBuffer];
    if (level && level !== 'all') {
      logs = logs.filter(l => l.level === level);
    }
    return logs.slice(-count);
  }

  /**
   * Get active tasks
   */
  getActiveTasks() {
    return Array.from(this.tasks.values())
      .filter(t => t.status === 'running')
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  }

  /**
   * Get all tasks
   */
  getAllTasks() {
    return Array.from(this.tasks.values())
      .sort((a, b) => (b.startTime || b.timestamp || 0) - (a.startTime || a.timestamp || 0));
  }

  /**
   * Get task by ID
   */
  getTask(taskId) {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Get active workflows
   */
  getActiveWorkflows() {
    return Array.from(this.workflows.values())
      .filter(w => w.status === 'running')
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  }

  /**
   * Get all workflows
   */
  getAllWorkflows() {
    return Array.from(this.workflows.values())
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  }

  /**
   * Get stats
   */
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

  /**
   * Get dashboard data
   */
  getDashboardData() {
    return {
      stats: this.getStats(),
      activeTasks: this.getActiveTasks(),
      recentTasks: this.getAllTasks().slice(0, 20),
      activeWorkflows: this.getActiveWorkflows(),
      recentWorkflows: this.getAllWorkflows().slice(0, 10),
      recentLogs: this.getRecentLogs(50)
    };
  }

  /**
   * Add SSE connection
   */
  addConnection(response) {
    this.connections.add(response);
    
    response.on('close', () => {
      this.removeConnection(response);
    });
    
    // Send initial data
    this.sendToConnection(response, 'init', this.getDashboardData());
  }

  /**
   * Remove SSE connection
   */
  removeConnection(response) {
    this.connections.delete(response);
  }

  /**
   * Broadcast event to all connections
   */
  broadcast(event, data) {
    this.connections.forEach(conn => {
      this.sendToConnection(conn, event, data);
    });
  }

  /**
   * Send data to single connection
   */
  sendToConnection(response, event, data) {
    try {
      if (!response.writableEnded) {
        response.write(`event: ${event}\n`);
        response.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    } catch (err) {
      this.removeConnection(response);
    }
  }

  /**
   * Add task to history
   */
  addToHistory(task) {
    this.taskHistory.unshift({
      id: task.id,
      status: task.status,
      startTime: task.startTime,
      endTime: task.endTime,
      duration: task.duration,
      metadata: task.metadata
    });
    
    if (this.taskHistory.length > this.maxHistorySize) {
      this.taskHistory.pop();
    }
  }

  /**
   * Clear all data
   */
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
      startTime: Date.now()
    };
    
    this.broadcast('dashboard:cleared', { timestamp: Date.now() });
  }

  /**
   * Clean up old data
   */
  cleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const now = Date.now();
    
    for (const [id, task] of this.tasks) {
      if (task.endTime && (now - task.endTime) > maxAge) {
        this.tasks.delete(id);
      }
    }
    
    for (const [id, workflow] of this.workflows) {
      if (workflow.endTime && (now - workflow.endTime) > maxAge) {
        this.workflows.delete(id);
      }
    }
  }
}

module.exports = new DashboardService();
