const fs = require('fs-extra');
const path = require('path');

const sessionsDir = path.resolve(__dirname, '../../sessions');

/**
 * Ensures the sessions directory exists.
 */
async function ensureSessionsDir() {
    await fs.ensureDir(sessionsDir);
}

/**
 * Loads a session by ID.
 * @param {string} sessionId 
 * @returns {Promise<{history: Array}>}
 */
async function loadSession(sessionId) {
    if (!sessionId) return { history: [] };
    const sessionPath = path.join(sessionsDir, `${sessionId}.json`);
    if (await fs.exists(sessionPath)) {
        try {
            return await fs.readJson(sessionPath);
        } catch (err) {
            console.error(`[Session] Failed to read session ${sessionId}:`, err.message);
            return { history: [] };
        }
    }
    return { history: [] };
}

/**
 * Saves a session by ID.
 * @param {string} sessionId 
 * @param {Array} history 
 */
async function saveSession(sessionId, history) {
    if (!sessionId) return;
    await ensureSessionsDir();
    const sessionPath = path.join(sessionsDir, `${sessionId}.json`);
    try {
        await fs.writeJson(sessionPath, { history }, { spaces: 2 });
    } catch (err) {
        console.error(`[Session] Failed to save session ${sessionId}:`, err.message);
    }
}

/**
 * Clears (deletes) a session by ID.
 * @param {string} sessionId 
 */
async function clearSession(sessionId) {
    if (!sessionId) return;
    const sessionPath = path.join(sessionsDir, `${sessionId}.json`);
    if (await fs.exists(sessionPath)) {
        try {
            await fs.remove(sessionPath);
            console.log(`[Session] Cleared session ${sessionId}`);
        } catch (err) {
            console.error(`[Session] Failed to clear session ${sessionId}:`, err.message);
        }
    }
}

module.exports = {
    loadSession,
    saveSession,
    clearSession
};
