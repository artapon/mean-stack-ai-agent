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
 * Supports both v1 (raw history) and v2 (LangChain serialized memory).
 * @param {string} sessionId 
 * @returns {Promise<{history: Array, memory?: Object, version?: number}>}
 */
async function loadSession(sessionId) {
    if (!sessionId) return { history: [] };
    const sessionPath = path.join(sessionsDir, `${sessionId}.json`);
    if (await fs.exists(sessionPath)) {
        try {
            const data = await fs.readJson(sessionPath);

            // v2 LangChain memory format
            if (data.version === 2) {
                console.log(`[Session] Loaded LangChain memory session ${sessionId} (v2)`);
                return {
                    history: data.messages ? data.messages.map(m => ({
                        role: m.type === 'ai' ? 'assistant' : (m.type === 'system' ? 'system' : 'user'),
                        content: m.content
                    })) : [],
                    memory: data,
                    version: 2
                };
            }

            // v1 legacy format
            console.log(`[Session] Loaded legacy session ${sessionId} (v1)`);
            return data;
        } catch (err) {
            console.error(`[Session] Failed to read session ${sessionId}:`, err.message);
            return { history: [] };
        }
    }
    return { history: [] };
}

/**
 * Saves a session by ID.
 * Supports both v1 (raw history array) and v2 (LangChain serialized memory object).
 * 
 * @param {string} sessionId 
 * @param {Array|Object} historyOrMemory — raw history array OR LangChain serialized memory
 */
async function saveSession(sessionId, historyOrMemory) {
    if (!sessionId) return;
    await ensureSessionsDir();
    const sessionPath = path.join(sessionsDir, `${sessionId}.json`);
    try {
        // If historyOrMemory is a v2 LangChain memory object, save directly
        if (historyOrMemory && historyOrMemory.version === 2) {
            await fs.writeJson(sessionPath, historyOrMemory, { spaces: 2 });
            console.log(`[Session] Saved LangChain memory session ${sessionId} (v2, ${(historyOrMemory.messages || []).length} messages).`);
        } else {
            // Legacy format: wrap in { history: [...] }
            await fs.writeJson(sessionPath, { history: historyOrMemory }, { spaces: 2 });
            console.log(`[Session] Saved legacy session ${sessionId} (v1).`);
        }
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

