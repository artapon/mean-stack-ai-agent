'use strict';

const BaseController    = require('../../../core/base.controller');
const SettingsService   = require('../services/settings.service');

class SettingsController extends BaseController {
  constructor() {
    super({ moduleName: 'Settings' });
  }

  /** GET /api/settings */
  async get(req, res) {
    try {
      const settings = await SettingsService.load();
      return this.ok(res, settings);
    } catch (err) {
      return this.serverError(res, 'Failed to load settings', err);
    }
  }

  /** POST /api/settings */
  async save(req, res) {
    try {
      const updated = await SettingsService.save(req.body || {});
      return this.ok(res, updated);
    } catch (err) {
      return this.serverError(res, 'Failed to save settings', err);
    }
  }

  /** POST /api/settings/reset */
  async reset(req, res) {
    try {
      const defaults = await SettingsService.reset();
      return this.ok(res, defaults);
    } catch (err) {
      return this.serverError(res, 'Failed to reset settings', err);
    }
  }
}

module.exports = new SettingsController();
