'use strict';

jest.mock('fs-extra', () => ({
  ensureDir:  jest.fn(),
  readdir:    jest.fn(),
  stat:       jest.fn(),
  readJson:   jest.fn(),
  exists:     jest.fn(),
  remove:     jest.fn(),
  appendFile: jest.fn().mockResolvedValue(),  // logger calls .catch() on the return value
}));

const fs            = require('fs-extra');
const memoryService = require('../../../src/modules/memory/services/memory.service');

// ── shared fixtures ───────────────────────────────────────────────────────────

const STAT = { size: 1024, mtime: new Date('2024-06-01T12:00:00Z') };

const V2_SESSION = {
  version: 2,
  mode: 'developer',
  messages: [
    { type: 'human', content: 'Build a REST API with Node.js' },
    { type: 'ai',    content: 'I will scaffold the project for you.' },
  ],
};

const LEGACY_SESSION = {
  history: [
    { role: 'assistant', content: 'ACTION: create_directory\n\nPARAMETERS: {}' },
    { role: 'user',      content: 'Tool result: success' },
  ],
};

// ── tests ─────────────────────────────────────────────────────────────────────

describe('MemoryService', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    fs.ensureDir.mockResolvedValue();
  });

  // ── listSessions() ────────────────────────────────────────────────────────

  describe('listSessions()', () => {
    it('returns empty array when sessions directory is empty', async () => {
      fs.readdir.mockResolvedValue([]);

      const result = await memoryService.listSessions();

      expect(result).toEqual([]);
    });

    it('parses v2 LangChain format — correct msgCount and preview', async () => {
      fs.readdir.mockResolvedValue(['session-abc.json']);
      fs.stat.mockResolvedValue(STAT);
      fs.readJson.mockResolvedValue(V2_SESSION);

      const [session] = await memoryService.listSessions();

      expect(session.id).toBe('session-abc');
      expect(session.version).toBe(2);
      expect(session.mode).toBe('developer');
      expect(session.msgCount).toBe(2);
      expect(session.preview).toBe('Build a REST API with Node.js');
    });

    it('normalises legacy format — role mapping and correct message count', async () => {
      fs.readdir.mockResolvedValue(['legacy-sess.json']);
      fs.stat.mockResolvedValue(STAT);
      fs.readJson.mockResolvedValue(LEGACY_SESSION);

      const [session] = await memoryService.listSessions();

      expect(session.id).toBe('legacy-sess');
      expect(session.version).toBe(1);
      expect(session.msgCount).toBe(2);
      // preview comes from the first 'human' message (user role maps to human)
      expect(session.preview).toContain('Tool result: success');
    });

    it('skips non-JSON files', async () => {
      fs.readdir.mockResolvedValue(['notes.txt', 'session.json', '.DS_Store']);
      fs.stat.mockResolvedValue(STAT);
      fs.readJson.mockResolvedValue(V2_SESSION);

      const result = await memoryService.listSessions();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('session');
    });

    it('skips malformed files without throwing', async () => {
      fs.readdir.mockResolvedValue(['bad.json']);
      fs.stat.mockResolvedValue(STAT);
      fs.readJson.mockRejectedValue(new SyntaxError('Unexpected token'));

      const result = await memoryService.listSessions();

      expect(result).toHaveLength(0);
    });

    it('returns file size and updatedAt metadata', async () => {
      fs.readdir.mockResolvedValue(['s1.json']);
      fs.stat.mockResolvedValue({ size: 4096, mtime: new Date('2024-01-15') });
      fs.readJson.mockResolvedValue(V2_SESSION);

      const [session] = await memoryService.listSessions();

      expect(session.size).toBe(4096);
      expect(session.updatedAt).toEqual(new Date('2024-01-15'));
    });

    it('sorts sessions newest-first by updatedAt', async () => {
      fs.readdir.mockResolvedValue(['old.json', 'new.json']);
      fs.stat
        .mockResolvedValueOnce({ size: 100, mtime: new Date('2024-01-01') })
        .mockResolvedValueOnce({ size: 100, mtime: new Date('2024-12-31') });
      fs.readJson.mockResolvedValue(LEGACY_SESSION);

      const result = await memoryService.listSessions();

      expect(result[0].id).toBe('new');
      expect(result[1].id).toBe('old');
    });

    it('truncates preview at 120 characters', async () => {
      const longContent = 'A'.repeat(200);
      fs.readdir.mockResolvedValue(['big.json']);
      fs.stat.mockResolvedValue(STAT);
      fs.readJson.mockResolvedValue({
        messages: [{ type: 'human', content: longContent }],
      });

      const [session] = await memoryService.listSessions();

      expect(session.preview.length).toBe(120);
    });
  });

  // ── getSession() ──────────────────────────────────────────────────────────

  describe('getSession()', () => {
    it('returns null when session file does not exist', async () => {
      fs.exists.mockResolvedValue(false);

      const result = await memoryService.getSession('ghost');

      expect(result).toBeNull();
    });

    it('normalises legacy history into messages array', async () => {
      fs.exists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(LEGACY_SESSION);

      const result = await memoryService.getSession('legacy-1');

      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages[0].type).toBe('ai');     // assistant → ai
      expect(result.messages[1].type).toBe('human');  // user → human
    });

    it('preserves v2 messages intact', async () => {
      fs.exists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(V2_SESSION);

      const result = await memoryService.getSession('v2-1');

      expect(result.messages).toEqual(V2_SESSION.messages);
      expect(result.version).toBe(2);
    });

    it('spreads original data fields into returned object', async () => {
      fs.exists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue({ ...V2_SESSION, mode: 'review' });

      const result = await memoryService.getSession('r1');

      expect(result.mode).toBe('review');
      expect(result.version).toBe(2);
    });
  });

  // ── deleteSession() ───────────────────────────────────────────────────────

  describe('deleteSession()', () => {
    it('deletes the file and returns true', async () => {
      fs.exists.mockResolvedValue(true);
      fs.remove.mockResolvedValue();

      const result = await memoryService.deleteSession('sess-1');

      expect(result).toBe(true);
      expect(fs.remove).toHaveBeenCalledWith(
        expect.stringContaining('sess-1.json')
      );
    });

    it('returns false when session file does not exist', async () => {
      fs.exists.mockResolvedValue(false);

      const result = await memoryService.deleteSession('ghost');

      expect(result).toBe(false);
      expect(fs.remove).not.toHaveBeenCalled();
    });
  });
});
