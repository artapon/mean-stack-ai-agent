/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LangChain Memory Manager for DevAgent
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Replaces the raw array-based history system with LangChain's structured
 * memory primitives. Uses the modern LangChain.js v0.3+ API:
 *
 *   1. InMemoryChatMessageHistory — structured message storage (HumanMessage/AIMessage)
 *   2. trimMessages               — sliding window over recent messages (configurable maxTokens)
 *   3. Serialization              — save/load memory state to/from JSON for session persistence
 *   4. Essential tracking         — important messages (nudges, directives) survive windowing
 *
 * DESIGN:
 *   The memory wraps LangChain's InMemoryChatMessageHistory and exposes a
 *   familiar interface (`addUserMessage`, `addAIMessage`, `toHistory`) so
 *   core.js can migrate smoothly. The `getWindowedHistory()` method implements
 *   sliding window context management, replacing the old manual pruning.
 */

const { InMemoryChatMessageHistory } = require("@langchain/core/chat_history");
const { HumanMessage, SystemMessage, AIMessage } = require("@langchain/core/messages");
const fs = require('fs-extra');
const path = require('path');
const compressor = require('../utils/compressor');

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_WINDOW_K = 50;          // Normal mode: keep last 50 messages
const ANALYSIS_WINDOW_K = 300;        // Analysis mode: deep context
const FAST_MODE_WINDOW_K = 20;        // Fast mode: minimal context

/**
 * AgentMemory — LangChain-based conversation memory for the DevAgent.
 *
 * Uses InMemoryChatMessageHistory for structured message storage and
 * a configurable sliding window for context management. Supports
 * serialization for session persistence and provides helper methods
 * for the agent loop.
 */
class AgentMemory {
    /**
     * @param {Object} options
     * @param {number} [options.windowSize]   — Number of messages to keep in window
     * @param {string} [options.mode]          — 'developer', 'review', or 'analysis'
     * @param {boolean} [options.fastMode]     — If true, uses minimal window
     * @param {string} [options.sessionId]     — Session ID for persistence
     * @param {string} [options.sessionsDir]   — Path to sessions directory
     */
    constructor(options = {}) {
        const { mode = 'developer', fastMode = false, sessionId = null, sessionsDir = null } = options;

        this.sessionId = sessionId;
        this.sessionsDir = sessionsDir || path.resolve(__dirname, '../../sessions');
        this.mode = mode;

        // Determine window size based on mode
        let windowSize = options.windowSize;
        if (!windowSize) {
            if (fastMode) windowSize = FAST_MODE_WINDOW_K;
            else if (mode === 'analysis') windowSize = ANALYSIS_WINDOW_K;
            else windowSize = DEFAULT_WINDOW_K;
        }

        // Initialize LangChain ChatMessageHistory
        this.chatHistory = new InMemoryChatMessageHistory();

        // System prompt is stored separately (always retained, outside sliding window)
        this.systemPrompt = null;

        // Metadata for tracking
        this.metadata = {
            totalMessages: 0,
            windowSize: windowSize,
        };

        // Essential messages that survive windowing (nudges, directives, tool results with reports)
        this._essentialMessages = [];

        // Archive for compressed history
        this._historyArchive = null;
    }

    /**
     * Sets the system prompt. This is always prepended to history output
     * but NOT stored in the ChatMessageHistory (it lives outside the sliding window).
     * @param {string} content
     */
    setSystemPrompt(content) {
        this.systemPrompt = content;
    }

    /**
     * Adds a user message to the memory.
     * @param {string} content
     */
    async addUserMessage(content) {
        // AI Compression: Summarize huge inputs (like multi-file uploads/reads) locally
        let processedContent = content;
        if (process.env.ENABLE_TRANSFORMERS === 'true' && content.length > 5000) {
            processedContent = await compressor.smartTruncate(content, 5000);
        }

        await this.chatHistory.addMessage(new HumanMessage(processedContent));
        this.metadata.totalMessages++;

        // Track essential messages
        if (this._isEssential(content, 'user')) {
            this._essentialMessages.push({ role: 'user', content });
        }
    }

    /**
     * Adds an assistant message to the memory.
     * @param {string} content
     */
    async addAIMessage(content) {
        // AI Compression: Summarize huge outputs locally
        let processedContent = content;
        if (process.env.ENABLE_TRANSFORMERS === 'true' && content.length > 5000) {
            processedContent = await compressor.smartTruncate(content, 5000);
        }

        await this.chatHistory.addMessage(new AIMessage(processedContent));
        this.metadata.totalMessages++;

        if (this._isEssential(content, 'assistant')) {
            this._essentialMessages.push({ role: 'assistant', content });
        }
    }

    /**
     * Adds a system-level directive (injected as a HumanMessage with [SYSTEM DIRECTIVE] prefix).
     * LangChain memory doesn't support system messages mid-conversation, so we inject
     * these as specially prefixed human messages for the model to treat as instructions.
     * @param {string} content
     */
    async addSystemDirective(content) {
        const prefixed = content.startsWith('[SYSTEM DIRECTIVE]') ? content : `[SYSTEM DIRECTIVE] ${content}`;
        await this.chatHistory.addMessage(new HumanMessage(prefixed));
        this.metadata.totalMessages++;
        this._essentialMessages.push({ role: 'user', content: prefixed });
    }

    /**
     * Injects a nudge pair (assistant acknowledgement + user directive).
     * Mirrors pushNudge() from core.js but uses LangChain memory.
     * @param {string} directive
     * @param {string} [ackMsg]
     */
    async pushNudge(directive, ackMsg) {
        const ack = ackMsg || 'THOUGHT: I need to follow the mandatory instruction before proceeding.\n\nACTION: (pending next instruction)\n\nPARAMETERS: {}';
        await this.chatHistory.addMessage(new AIMessage(ack));
        await this.chatHistory.addMessage(new HumanMessage(`[SYSTEM DIRECTIVE]\n\n${directive}\n\nRespond with the correct ACTION and PARAMETERS block immediately.`));
        this.metadata.totalMessages += 2;
    }

    /**
     * Injects a format recovery block.
     * @param {string} lastBadOutput
     * @param {string} errorReason
     * @param {string} [exampleAction]
     */
    async pushFormatRecovery(lastBadOutput, errorReason, exampleAction = 'write_file') {
        const example = exampleAction || 'write_file';

        // Assistant part: Acknowledgement of rejection
        const rejected = `[GARBLED OUTPUT — REJECTED BY SYSTEM]`;
        await this.chatHistory.addMessage(new AIMessage(rejected));

        // User part: Directions for recovery
        const recovery = [
            `[FORMAT RECOVERY]`,
            ``,
            `Your last response was rejected: ${errorReason}`,
            ``,
            `CORRECT FORMAT (copy this structure exactly):`,
            ``,
            `THOUGHT: I will now perform the required action.`,
            ``,
            `ACTION: ${example}`,
            ``,
            `PARAMETERS: { "path": "example/path.js", "content": "example content" }`,
            ``,
            `---`,
            `CRITICAL RULES:`,
            `1. Each marker (THOUGHT, ACTION, PARAMETERS) must be on its OWN LINE with a BLANK LINE before it.`,
            `2. NEVER merge markers. "ACTIONARAMETERS" or "1. ACTIONARAMETERS:" are INVALID.`,
            `3. Output ONE action only. Do not number or bold the markers.`,
            ``,
            `Now output a valid response for your current task.`
        ].join('\n');

        await this.chatHistory.addMessage(new HumanMessage(recovery));
        this.metadata.totalMessages += 2;
    }

    /**
     * Returns the full message history in the classic `[{role, content}]` format.
     * This includes: system prompt (always first) + all stored messages.
     *
     * @returns {Promise<Array<{role:string, content:string}>>}
     */
    async toHistory() {
        const messages = await this.chatHistory.getMessages();
        const history = [];

        // System prompt always first
        if (this.systemPrompt) {
            history.push({ role: 'system', content: this.systemPrompt });
        }

        // Convert LangChain messages to role/content format
        for (const msg of messages) {
            if (msg instanceof SystemMessage) {
                history.push({ role: 'system', content: msg.content });
            } else if (msg instanceof AIMessage) {
                history.push({ role: 'assistant', content: msg.content });
            } else if (msg instanceof HumanMessage) {
                history.push({ role: 'user', content: msg.content });
            }
        }

        return history;
    }

    /**
     * Returns messages within a sliding window (for LLM context).
     * Uses LangChain's trimMessages for intelligent context windowing.
     *
     * Window size is configured per mode:
     *   - Fast mode: 20 messages
     *   - Normal: 50 messages
     *   - Analysis: 300 messages
     *
     * Essential messages (nudges, directives, reports) that fall outside the
     * window are prepended to ensure critical context is never lost.
     *
     * @returns {Promise<Array<{role:string, content:string}>>}
     */
    async getWindowedHistory() {
        const allMessages = await this.chatHistory.getMessages();
        const history = [];

        // System prompt always first
        if (this.systemPrompt) {
            history.push({ role: 'system', content: this.systemPrompt });
        }

        // Apply sliding window: keep most recent N messages
        const windowSize = this.metadata.windowSize;
        let windowedMessages = allMessages;

        if (allMessages.length > windowSize) {
            // Keep the essential messages that would otherwise be pruned
            const pruned = allMessages.slice(0, allMessages.length - windowSize);
            const recent = allMessages.slice(-windowSize);

            // AUTOMATED COMPRESSION: If transformers are enabled, summarize the pruned portion
            if (process.env.ENABLE_TRANSFORMERS === 'true' && pruned.length > 5) {
                try {
                    const toCompress = pruned.map(m => ({
                        role: m instanceof AIMessage ? 'assistant' : 'user',
                        content: m.content
                    }));

                    // Fire-and-forget: Start compression in background if not already archived
                    // In a stateless loop, we normally do this synchronously to ensure prompt inclusion
                    const archiveSummary = await compressor.compressHistory(toCompress);
                    if (archiveSummary) this._historyArchive = archiveSummary;
                } catch (e) {
                    console.warn('[AgentMemory] Compression failed:', e.message);
                }
            }

            // Collect essential messages from the pruned portion
            const essentialFromPruned = pruned.filter(msg => {
                const content = msg.content || '';
                return this._isEssential(content, msg instanceof AIMessage ? 'assistant' : 'user');
            });

            // Combine: [Archive Summary] + essential (pruned) + recent (windowed)
            windowedMessages = [];

            if (this._historyArchive) {
                windowedMessages.push(new HumanMessage(this._historyArchive));
            }

            windowedMessages = [...windowedMessages, ...essentialFromPruned, ...recent];

            console.log(`[AgentMemory] Window applied: ${allMessages.length} → ${windowedMessages.length} messages (window: ${windowSize}, essential: ${essentialFromPruned.length}${this._historyArchive ? ', archived' : ''})`);
        }

        // Convert LangChain messages
        for (const msg of windowedMessages) {
            if (msg instanceof SystemMessage) {
                history.push({ role: 'system', content: msg.content });
            } else if (msg instanceof AIMessage) {
                history.push({ role: 'assistant', content: msg.content });
            } else if (msg instanceof HumanMessage) {
                history.push({ role: 'user', content: msg.content });
            }
        }

        return history;
    }

    /**
     * Returns the raw LangChain messages array.
     * @returns {Promise<Array>}
     */
    async getMessages() {
        return await this.chatHistory.getMessages();
    }

    /**
     * Returns message count.
     * @returns {Promise<number>}
     */
    async getMessageCount() {
        const msgs = await this.chatHistory.getMessages();
        return msgs.length;
    }

    /**
     * Serializes the memory state for session persistence.
     * @returns {Promise<Object>}
     */
    async serialize() {
        const messages = await this.chatHistory.getMessages();
        return {
            version: 2, // v2 = LangChain memory format
            systemPrompt: this.systemPrompt,
            messages: messages.map(msg => ({
                type: msg instanceof SystemMessage ? 'system' :
                    msg instanceof AIMessage ? 'ai' : 'human',
                content: msg.content,
            })),
            essentials: this._essentialMessages,
            metadata: this.metadata,
        };
    }

    /**
     * Restores memory state from a serialized object.
     * @param {Object} data — previously serialized state
     */
    async deserialize(data) {
        if (!data || data.version !== 2) {
            // Legacy format (v1 = raw history array) — convert
            return this._importLegacy(data);
        }

        // Restore system prompt
        if (data.systemPrompt) {
            this.systemPrompt = data.systemPrompt;
        }

        // Restore messages
        if (data.messages && Array.isArray(data.messages)) {
            for (const msg of data.messages) {
                if (msg.type === 'system') {
                    await this.chatHistory.addMessage(new SystemMessage(msg.content));
                } else if (msg.type === 'ai') {
                    await this.chatHistory.addMessage(new AIMessage(msg.content));
                } else {
                    await this.chatHistory.addMessage(new HumanMessage(msg.content));
                }
            }
        }

        // Restore essentials
        if (data.essentials) {
            this._essentialMessages = data.essentials;
        }

        // Restore metadata
        if (data.metadata) {
            this.metadata = { ...this.metadata, ...data.metadata };
        }
    }

    /**
     * Imports a legacy v1 history format `[{role, content}]` into LangChain memory.
     * @param {Object} data — legacy session data
     */
    async _importLegacy(data) {
        const history = data?.history || data || [];
        if (!Array.isArray(history)) return;

        for (const msg of history) {
            if (!msg || !msg.content) continue;
            if (msg.role === 'system') {
                // First system message becomes the system prompt
                if (!this.systemPrompt) {
                    this.systemPrompt = msg.content;
                } else {
                    await this.chatHistory.addMessage(new SystemMessage(msg.content));
                }
            } else if (msg.role === 'assistant') {
                await this.chatHistory.addMessage(new AIMessage(msg.content));
            } else {
                await this.chatHistory.addMessage(new HumanMessage(msg.content));
            }
            this.metadata.totalMessages++;
        }

        console.log(`[AgentMemory] Imported ${history.length} legacy messages into LangChain memory.`);
    }

    /**
     * Clears all memory.
     */
    async clear() {
        await this.chatHistory.clear();
        this.systemPrompt = null;
        this._essentialMessages = [];
        this.metadata.totalMessages = 0;
    }

    /**
     * Saves memory to disk.
     * @param {string} [sessionId] — override session ID
     */
    async saveToDisk(sessionId) {
        const sid = sessionId || this.sessionId;
        if (!sid) return;

        await fs.ensureDir(this.sessionsDir);
        const sessionPath = path.join(this.sessionsDir, `${sid}.json`);

        try {
            const serialized = await this.serialize();
            await fs.writeJson(sessionPath, serialized, { spaces: 2 });
            console.log(`[AgentMemory] Session ${sid} saved (${this.metadata.totalMessages} messages).`);
        } catch (err) {
            console.error(`[AgentMemory] Failed to save session ${sid}:`, err.message);
        }
    }

    /**
     * Loads memory from disk.
     * @param {string} [sessionId] — override session ID
     * @returns {Promise<boolean>} — true if session was loaded
     */
    async loadFromDisk(sessionId) {
        const sid = sessionId || this.sessionId;
        if (!sid) return false;

        const sessionPath = path.join(this.sessionsDir, `${sid}.json`);

        try {
            if (await fs.exists(sessionPath)) {
                const data = await fs.readJson(sessionPath);
                await this.deserialize(data);
                console.log(`[AgentMemory] Session ${sid} loaded.`);
                return true;
            }
        } catch (err) {
            console.error(`[AgentMemory] Failed to load session ${sid}:`, err.message);
        }

        return false;
    }

    /**
     * Checks if a message is "essential" (should survive windowing).
     * @param {string} content
     * @param {string} role
     * @returns {boolean}
     * @private
     */
    _isEssential(content, role) {
        if (!content) return false;
        const c = content.toLowerCase();
        return (
            c.includes('walkthrough_review_report') ||
            c.includes('walkthrough_system_analysis_report') ||
            c.includes('request_review') ||
            c.startsWith('[system directive]') ||
            c.startsWith('[format recovery]') ||
            c.includes('[action roadmap]')
        );
    }
}

// ── Factory function ──────────────────────────────────────────────────────────
/**
 * Creates a new AgentMemory instance pre-configured for the given mode.
 *
 * @param {Object} options
 * @param {string} [options.mode]       — 'developer', 'review', or 'analysis'
 * @param {boolean} [options.fastMode]  — Fast mode flag
 * @param {string} [options.sessionId]  — Session ID for persistence
 * @returns {AgentMemory}
 */
function createAgentMemory(options = {}) {
    return new AgentMemory(options);
}

module.exports = {
    AgentMemory,
    createAgentMemory,
    DEFAULT_WINDOW_K,
    ANALYSIS_WINDOW_K,
    FAST_MODE_WINDOW_K,
};
