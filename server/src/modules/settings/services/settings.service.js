'use strict';

const fs   = require('fs-extra');
const path = require('path');
const BaseService = require('../../../core/base.service');

// Persisted to server/settings.json — survives restarts
const SETTINGS_FILE = path.resolve(__dirname, '../../../../settings.json');

const DEFAULTS = {
  agentType:         'default',   // stack id, e.g. 'default' | 'mean_stack' | 'html_css'
  orchestrator:      'classic',   // 'classic' | 'langgraph'
  followReview:      false,
  followAnalysis:    false,
  autoRequestReview: false,
  fastMode:          true,
  unlimitedSteps:    false,
  workspacePath:     ''           // empty = use WORKSPACE_DIR env / default './workspace'
};

class SettingsService extends BaseService {
  constructor() {
    super({ serviceName: 'SettingsService' });
    this._cache = null; // in-memory cache after first load
  }

  /** Load settings, merging persisted values over defaults. */
  async load() {
    if (this._cache) return { ...this._cache };
    try {
      if (await fs.pathExists(SETTINGS_FILE)) {
        const saved = await fs.readJson(SETTINGS_FILE);
        this._cache = { ...DEFAULTS, ...saved };
      } else {
        this._cache = { ...DEFAULTS };
      }
    } catch (err) {
      this.log('warn', 'Could not read settings file, using defaults', { error: err.message });
      this._cache = { ...DEFAULTS };
    }
    return { ...this._cache };
  }

  /** Merge `updates` into current settings and persist. */
  async save(updates) {
    const current = await this.load();
    // Only accept known keys to prevent arbitrary writes
    const next = { ...current };
    for (const key of Object.keys(DEFAULTS)) {
      if (key in updates) next[key] = updates[key];
    }
    this._cache = next;
    try {
      await fs.writeJson(SETTINGS_FILE, next, { spaces: 2 });
      this.log('info', 'Settings saved');
    } catch (err) {
      this.log('error', 'Failed to persist settings', { error: err.message });
      throw err;
    }
    return { ...next };
  }

  /** Reset all settings to factory defaults. */
  async reset() {
    this._cache = { ...DEFAULTS };
    await fs.writeJson(SETTINGS_FILE, this._cache, { spaces: 2 });
    this.log('info', 'Settings reset to defaults');
    return { ...this._cache };
  }
}

module.exports = new SettingsService();
