const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, SystemMessage, AIMessage } = require("@langchain/core/messages");
const path = require('path');
const fs = require('fs-extra');

/**
 * Langchain-powered model call for LM Studio
 * This replaces the manual axios streaming logic with Langchain's robust abstractions.
 * 
 * @param {Array}       history     - Standard DevAgent message history
 * @param {Function}    onChunk     - (optional) function for real-time streaming
 * @param {AbortSignal} signal      - signal to terminate the request
 * @param {string}     [selectedModel] - target model name
 * @returns {Promise<string>}
 */
async function callLangchain(history, onChunk, signal, selectedModel) {
    // Langchain prefers BASE_URL to end with /v1 for OpenAI-compatible APIs
    const baseUrl = (process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234').replace(/\/$/, '') + '/v1';
    const modelName = selectedModel || process.env.LM_STUDIO_MODEL || 'openai/gpt-oss-20b';

    console.log(`[DevAgent] Langchain Model Call -> ${baseUrl} | model: "${modelName}"`);

    // Initialize ChatOpenAI for LM Studio
    const chat = new ChatOpenAI({
        modelName,
        temperature: 0.1,
        streaming: true,
        configuration: {
            baseURL: baseUrl,
            apiKey: "lm-studio", // Dummy key for LM Studio
        },
        maxTokens: 8192,
    });

    // Convert history into Langchain message objects
    const messages = history.map(m => {
        if (m.role === 'system') return new SystemMessage(m.content);
        if (m.role === 'assistant') return new AIMessage(m.content);
        return new HumanMessage(m.content);
    });

    try {
        let fullText = "";
        // Note: Signal support depends on Langchain's underlying axios/fetch implementation
        const stream = await chat.stream(messages, { signal });

        for await (const chunk of stream) {
            // Abort check since signal support in iterators can be jittery
            if (signal?.aborted) {
                throw new Error('AbortSignal triggered');
            }

            const content = chunk.content;
            if (content) {
                fullText += content;
                if (onChunk) onChunk(content);
            }
        }
        return fullText;
    } catch (err) {
        if (['AbortError', 'canceled', 'AbortSignal triggered'].some(s => err.name === s || err.message === s)) {
            throw new Error('Agent stopped by user.');
        }
        console.error('[DevAgent] Langchain call failed:', err.message);
        throw err;
    }
}

module.exports = { callLangchain };
