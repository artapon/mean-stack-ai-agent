'use strict';

const path = require('path');
const fs   = require('fs-extra');

const SESSIONS_DIR = path.resolve(__dirname, '../../../../sessions');

/**
 * Normalise any session format into a flat messages array:
 *   v2  { version:2, messages:[{type,content}] }  → keep as-is
 *   legacy { history:[{role,content}] }            → map role→type
 */
function normaliseMessages(data) {
  if (Array.isArray(data.messages) && data.messages.length > 0) {
    return data.messages;
  }
  if (Array.isArray(data.history) && data.history.length > 0) {
    return data.history.map(m => ({
      type:    m.role === 'user' ? 'human' : m.role === 'assistant' ? 'ai' : m.role,
      content: m.content ?? ''
    }));
  }
  return [];
}

class MemoryService {
  async listSessions() {
    await fs.ensureDir(SESSIONS_DIR);
    const files = await fs.readdir(SESSIONS_DIR);
    const sessions = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(SESSIONS_DIR, file);
      try {
        const stat = await fs.stat(filePath);
        const data = await fs.readJson(filePath);
        const msgs = normaliseMessages(data);

        const firstHuman = msgs.find(m => m.type === 'human');
        const firstContent = firstHuman?.content ?? msgs[0]?.content ?? null;
        const preview = typeof firstContent === 'string'
          ? firstContent.slice(0, 120)
          : null;

        sessions.push({
          id:        file.replace('.json', ''),
          file,
          size:      stat.size,
          updatedAt: stat.mtime,
          version:   data.version ?? 1,
          mode:      data.mode ?? 'unknown',
          msgCount:  msgs.length,
          preview
        });
      } catch {
        // skip malformed files
      }
    }

    sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return sessions;
  }

  async getSession(id) {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    if (!(await fs.exists(filePath))) return null;
    const data = await fs.readJson(filePath);
    // Always return normalised messages so the frontend has a consistent shape
    return {
      ...data,
      messages: normaliseMessages(data)
    };
  }

  async deleteSession(id) {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    if (!(await fs.exists(filePath))) return false;
    await fs.remove(filePath);
    return true;
  }
}

module.exports = new MemoryService();
