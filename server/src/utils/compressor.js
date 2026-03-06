const { pipeline, env } = require('@xenova/transformers');
const path = require('path');
const fs = require('fs-extra');

// Configure local cache for model files to avoid re-downloading
env.cacheDir = path.resolve(__dirname, '../../.cache/transformers');
env.logLevel = 'error';

/**
 * AI Compressor Utility
 * Uses @xenova/transformers to perform local text summarization and token counting
 * for prompt optimization.
 */
class AICompressor {
    constructor() {
        this.summarizer = null;
        this.tokenizer = null;
        this.isReady = false;
        this.isLoading = false;
    }

    /**
     * Initializes the local models if enabled in .env
     */
    async init() {
        if (this.isReady || this.isLoading) return;
        if (process.env.ENABLE_TRANSFORMERS !== 'true') return;

        console.log('[AICompressor] Initializing local transformers models...');
        this.isLoading = true;

        try {
            // Using a very small, fast model for summarization
            this.summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-6-6');

            // Tokenizer for accurate counting
            const { AutoTokenizer } = require('@xenova/transformers');
            this.tokenizer = await AutoTokenizer.from_pretrained('Xenova/gpt2');

            this.isReady = true;
            console.log('[AICompressor] Local models ready.');
        } catch (err) {
            console.error('[AICompressor] Initialization failed:', err.message);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Counts tokens in a string using GPT-2 tokenizer.
     * @param {string} text 
     * @returns {Promise<number>}
     */
    async countTokens(text) {
        if (!this.isReady) await this.init();
        if (!this.isReady) return Math.ceil(text.length / 4);

        try {
            const { input_ids } = await this.tokenizer(text);
            return input_ids.size;
        } catch (err) {
            return Math.ceil(text.length / 4);
        }
    }

    /**
     * Summarizes long text into a concise version.
     * @param {string} text 
     * @returns {Promise<string>}
     */
    async summarize(text, maxLength = 150, minLength = 30) {
        if (!this.isReady) await this.init();
        if (!this.isReady) return text;

        try {
            const result = await this.summarizer(text, {
                max_new_tokens: maxLength,
                min_new_tokens: minLength,
                chunk_length: 1024,
            });
            return result[0].summary_text;
        } catch (err) {
            console.error('[AICompressor] Summarization error:', err.message);
            return text;
        }
    }

    /**
     * Smartly truncates content that is excessively long.
     */
    async smartTruncate(content, threshold = 2000) {
        if (!content || content.length < threshold) return content;

        console.log(`[AICompressor] Summarizing long content (${content.length} chars) to save tokens...`);
        const summary = await this.summarize(content, 300, 100);
        return `[LOCAL COMPRESSION]: The original content was ${content.length} characters. Locally summarized to save prompt tokens:\n\n${summary}`;
    }

    /**
     * Compresses a block of conversation history into a single summary string.
     * @param {Array<{role:string, content:string}>} history 
     * @returns {Promise<string>}
     */
    async compressHistory(history) {
        if (!history || history.length === 0) return '';

        const formatted = history
            .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 500)}`)
            .join('\n\n');

        console.log(`[AICompressor] Compressing ${history.length} messages...`);
        const summary = await this.summarize(formatted);
        return `[CONVERSATION ARCHIVE]: The following is a summary of the previous conversation context that was compressed to save space:\n\n${summary}`;
    }
}

// Singleton instance
const compressor = new AICompressor();

module.exports = compressor;
