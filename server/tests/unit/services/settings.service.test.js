'use strict';

// Explicit factory so every method is a jest.fn() returning Promises
jest.mock('fs-extra', () => ({
  pathExists:  jest.fn(),
  readJson:    jest.fn(),
  writeJson:   jest.fn(),
  ensureDir:   jest.fn(),
  appendFile:  jest.fn().mockResolvedValue(),  // logger calls .catch() on the return value
}));

const fs             = require('fs-extra');
const settingsService = require('../../../src/modules/settings/services/settings.service');

const DEFAULTS = {
  agentType:         'default',
  orchestrator:      'classic',
  followReview:      false,
  followAnalysis:    false,
  autoRequestReview: false,
  fastMode:          true,
  unlimitedSteps:    false,
  workspacePath:     '',
};

describe('SettingsService', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    settingsService._cache = null;       // reset in-memory cache before each test
    fs.writeJson.mockResolvedValue();    // default: write succeeds
  });

  // ── load() ────────────────────────────────────────────────────────────────

  describe('load()', () => {
    it('returns factory defaults when settings file does not exist', async () => {
      fs.pathExists.mockResolvedValue(false);

      const result = await settingsService.load();

      expect(result).toEqual(DEFAULTS);
      expect(fs.readJson).not.toHaveBeenCalled();
    });

    it('merges persisted values over defaults when file exists', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue({ agentType: 'mean_stack', fastMode: false });

      const result = await settingsService.load();

      expect(result.agentType).toBe('mean_stack');
      expect(result.fastMode).toBe(false);
      expect(result.orchestrator).toBe('classic');   // default preserved
      expect(result.unlimitedSteps).toBe(false);     // default preserved
    });

    it('returns cached result on subsequent calls (no extra I/O)', async () => {
      fs.pathExists.mockResolvedValue(false);

      await settingsService.load();
      await settingsService.load();

      expect(fs.pathExists).toHaveBeenCalledTimes(1);
    });

    it('falls back to defaults when file read throws', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockRejectedValue(new Error('permission denied'));

      const result = await settingsService.load();

      expect(result).toEqual(DEFAULTS);
    });

    it('returned object is a copy — mutations do not affect cache', async () => {
      fs.pathExists.mockResolvedValue(false);

      const result = await settingsService.load();
      result.agentType = 'mutated';

      const second = await settingsService.load();
      expect(second.agentType).toBe('default');
    });
  });

  // ── save() ────────────────────────────────────────────────────────────────

  describe('save()', () => {
    beforeEach(() => {
      fs.pathExists.mockResolvedValue(false); // load() returns defaults
    });

    it('merges the update into current settings and returns result', async () => {
      const result = await settingsService.save({ agentType: 'html_css' });

      expect(result.agentType).toBe('html_css');
      expect(result.orchestrator).toBe('classic');
    });

    it('ignores unknown keys', async () => {
      const result = await settingsService.save({ injected: true, agentType: 'default' });

      expect(result).not.toHaveProperty('injected');
    });

    it('persists updated settings to disk', async () => {
      await settingsService.save({ fastMode: false });

      expect(fs.writeJson).toHaveBeenCalledTimes(1);
      const [, written] = fs.writeJson.mock.calls[0];
      expect(written.fastMode).toBe(false);
    });

    it('updates the in-memory cache', async () => {
      await settingsService.save({ orchestrator: 'langgraph' });

      expect(settingsService._cache.orchestrator).toBe('langgraph');
    });

    it('throws (and propagates) when writeJson fails', async () => {
      fs.writeJson.mockRejectedValue(new Error('disk full'));

      await expect(settingsService.save({ fastMode: false }))
        .rejects.toThrow('disk full');
    });
  });

  // ── reset() ───────────────────────────────────────────────────────────────

  describe('reset()', () => {
    it('restores all settings to factory defaults', async () => {
      // Dirty the cache with non-default values
      settingsService._cache = {
        agentType: 'custom', orchestrator: 'langgraph',
        followReview: true, followAnalysis: true,
        autoRequestReview: true, fastMode: false,
        unlimitedSteps: true, workspacePath: '/custom',
      };

      const result = await settingsService.reset();

      expect(result).toEqual(DEFAULTS);
    });

    it('writes defaults to disk', async () => {
      settingsService._cache = { ...DEFAULTS };

      await settingsService.reset();

      expect(fs.writeJson).toHaveBeenCalledTimes(1);
      const [, written] = fs.writeJson.mock.calls[0];
      expect(written).toEqual(DEFAULTS);
    });

    it('updates the in-memory cache to defaults', async () => {
      settingsService._cache = { ...DEFAULTS, fastMode: false };

      await settingsService.reset();

      expect(settingsService._cache.fastMode).toBe(true);
    });
  });
});
