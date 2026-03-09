'use strict';

const BaseController   = require('../../../core/base.controller');
const MemoryService    = require('../services/memory.service');

class MemoryController extends BaseController {
  constructor() {
    super({ moduleName: 'Memory' });
  }

  async list(req, res) {
    try {
      const sessions = await MemoryService.listSessions();
      return this.ok(res, { sessions });
    } catch (err) {
      return this.serverError(res, 'Failed to list memory sessions', err);
    }
  }

  async get(req, res) {
    try {
      const { id } = req.params;
      const session = await MemoryService.getSession(id);
      if (!session) return this.notFound(res, `Session "${id}" not found`);
      return this.ok(res, session);
    } catch (err) {
      return this.serverError(res, 'Failed to read session', err);
    }
  }

  async remove(req, res) {
    try {
      const { id } = req.params;
      const deleted = await MemoryService.deleteSession(id);
      if (!deleted) return this.notFound(res, `Session "${id}" not found`);
      return this.ok(res, { deleted: true });
    } catch (err) {
      return this.serverError(res, 'Failed to delete session', err);
    }
  }
}

module.exports = new MemoryController();
