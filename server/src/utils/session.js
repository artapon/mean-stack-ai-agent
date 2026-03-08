'use strict';

const fs   = require('fs-extra');
const path = require('path');
const { createLogger } = require('./logger');

const log         = createLogger('Session');
const sessionsDir = path.resolve(__dirname, '../../sessions');

/** Ensures sessions directory exists (idempotent). */
async function ensureSessionsDir() {
  await fs.ensureDir(sessionsDir);
}

/**
 * Load a session by ID.
 * Supports v1 (raw history array) and v2 (LangChain serialised memory object).
 *
 * @param {string} sessionId
 * @returns {Promise<{ history: Array, memory?: object, version?: number }>}
 */
async function loadSession(sessionId) {
  if (!sessionId) return { history: [] };

  const sessionPath = path.join(sessionsDir, `${sessionId}.json`);

  if (!(await fs.exists(sessionPath))) return { history: [] };

  try {
    const data = await fs.readJson(sessionPath);

    // v2 — LangChain memory format
    if (data.version === 2) {
      log.info(`Loaded v2 session ${sessionId}`, { messages: (data.messages || []).length });
      return {
        history: (data.messages || []).map(m => ({
          role:    m.type === 'ai' ? 'assistant' : m.type === 'system' ? 'system' : 'user',
          content: m.content
        })),
        memory:  data,
        version: 2
      };
    }

    // v1 — legacy array format
    log.info(`Loaded v1 session ${sessionId}`);
    return data;
  } catch (err) {
    log.error(`Failed to read session ${sessionId}`, { error: err.message });
    return { history: [] };
  }
}

/**
 * Persist a session by ID.
 *
 * @param {string} sessionId
 * @param {Array|object} historyOrMemory  Raw history array (v1) or LangChain memory object (v2).
 */
async function saveSession(sessionId, historyOrMemory) {
  if (!sessionId) return;
  await ensureSessionsDir();

  const sessionPath = path.join(sessionsDir, `${sessionId}.json`);

  try {
    if (historyOrMemory?.version === 2) {
      await fs.writeJson(sessionPath, historyOrMemory, { spaces: 2 });
      log.info(`Saved v2 session ${sessionId}`, { messages: (historyOrMemory.messages || []).length });
    } else {
      await fs.writeJson(sessionPath, { history: historyOrMemory }, { spaces: 2 });
      log.info(`Saved v1 session ${sessionId}`, { messages: (historyOrMemory || []).length });
    }
  } catch (err) {
    log.error(`Failed to save session ${sessionId}`, { error: err.message });
  }
}

/**
 * Delete a session by ID.
 *
 * @param {string} sessionId
 */
async function clearSession(sessionId) {
  if (!sessionId) return;

  const sessionPath = path.join(sessionsDir, `${sessionId}.json`);

  if (!(await fs.exists(sessionPath))) return;

  try {
    await fs.remove(sessionPath);
    log.info(`Cleared session ${sessionId}`);
  } catch (err) {
    log.error(`Failed to clear session ${sessionId}`, { error: err.message });
  }
}

module.exports = { loadSession, saveSession, clearSession };
