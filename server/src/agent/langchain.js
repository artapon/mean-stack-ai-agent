const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, SystemMessage, AIMessage } = require("@langchain/core/messages");
const { DynamicTool, DynamicStructuredTool } = require("@langchain/core/tools");
const { BaseOutputParser } = require("@langchain/core/output_parsers");
const { RunnableSequence } = require("@langchain/core/runnables");
const { ChatPromptTemplate, MessagesPlaceholder } = require("@langchain/core/prompts");
const path = require('path');
const fs = require('fs-extra');

/**
 * Custom Output Parser for DevAgent's specific THOUGHT/ACTION/PARAMETERS format.
 * This ensures the model's response adheres to our required structure.
 */
class DevAgentOutputParser extends BaseOutputParser {
    constructor(fastMode = false) {
        super();
        this.fastMode = fastMode;
    }

    async parse(text) {
        try {
            const thoughtMatch = text.match(/THOUGHT:\s*([\s\S]*?)(?=ACTION:|$)/i);
            const actionMatch = text.match(/ACTION:\s*([\w_]+)/i);
            const paramsMatch = text.match(/PARAMETERS:\s*(\{[\s\S]*?\})/i);

            const result = {
                thought: thoughtMatch ? thoughtMatch[1].trim() : "",
                action: actionMatch ? actionMatch[1].trim().toLowerCase() : "finish",
                parameters: {},
                response: text
            };

            if (paramsMatch) {
                try {
                    result.parameters = JSON.parse(paramsMatch[1].trim());
                } catch (e) {
                    result.error = "Invalid JSON in PARAMETERS";
                }
            }
            return result;
        } catch (e) {
            return { action: "finish", response: text, error: "Parser failed: " + e.message };
        }
    }

    getFormatInstructions() {
        return this.fastMode
            ? `ACTION: (tool name)\n\nPARAMETERS: (JSON)`
            : `THOUGHT: (reasoning)\n\nACTION: (tool name)\n\nPARAMETERS: (JSON)`;
    }
}

/**
 * Langchain Workflow System
 * Encapsulates the reasoning chain with persistent memory and structured outputs.
 */
class LangchainWorkflow {
    constructor(modelName, options = {}) {
        const baseUrl = (process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234').replace(/\/$/, '') + '/v1';
        this.chat = new ChatOpenAI({
            modelName,
            temperature: 0.1,
            streaming: true,
            configuration: {
                baseURL: baseUrl,
                apiKey: "lm-studio",
            },
            maxTokens: 8192,
        });

        this.memory = null; // Memory is managed by the core agent history for now
        this.parser = new DevAgentOutputParser(options.fastMode || false);
    }

    /**
     * Executes a single reasoning turn in the workflow.
     */
    async call(history, onChunk, signal) {
        // Convert input history to Langchain messages
        const messages = history.map(m => {
            if (m.role === 'system') return new SystemMessage(m.content);
            if (m.role === 'assistant') return new AIMessage(m.content);
            return new HumanMessage(m.content);
        });

        try {
            let fullText = "";
            const stream = await this.chat.stream(messages, { signal });

            for await (const chunk of stream) {
                if (signal?.aborted) throw new Error('AbortSignal triggered');
                const content = chunk.content;
                if (content) {
                    fullText += content;
                    if (onChunk) onChunk(content);
                }
            }
            return fullText;
        } catch (err) {
            throw err;
        }
    }
}

/**
 * Wraps our internal TOOLS into Langchain-compatible Tool objects.
 */
function createLangchainTools(TOOLS, workspaceDir) {
    return Object.entries(TOOLS).map(([name, func]) => {
        return new DynamicTool({
            name,
            description: `Execute ${name} tool. Uses schema: ${func.params || '{}'}`,
            func: async (input) => {
                const params = typeof input === 'string' ? JSON.parse(input) : input;
                const result = await func(params, workspaceDir);
                return JSON.stringify(result);
            }
        });
    });
}

/**
 * Langchain Planner System
 * Helps the agent create a high-level Action Roadmap BEFORE executing steps.
 */
class LangchainPlanner {
    constructor(modelName) {
        const baseUrl = (process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234').replace(/\/$/, '') + '/v1';
        this.chat = new ChatOpenAI({
            modelName,
            temperature: 0.2, // Higher temperature for more creative planning
            configuration: {
                baseURL: baseUrl,
                apiKey: "lm-studio",
            },
        });
    }

    /**
     * Generates a structured Roadmap for a given user objective.
     */
    async plan(objective, context = "") {
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", "You are a Senior Project Architect. Analyze the objective and create a professional Action Roadmap. Focus on file structure, modularity, and security."],
            ["human", "CONTEXT: {context}\n\nOBJECTIVE: {objective}\n\nCreate a numbered Action Roadmap. For each step, specify the tool to use (write_file, scaffold_project, etc.) and the target file path."]
        ]);

        const chain = RunnableSequence.from([prompt, this.chat]);
        const response = await chain.invoke({ objective, context });
        return response.content;
    }
}

/**
 * Bridge for existing core call logic.
 */
async function callLangchain(history, onChunk, signal, selectedModel, options = {}) {
    const model = selectedModel || process.env.LM_STUDIO_MODEL || 'openai/gpt-oss-20b';
    const workflow = new LangchainWorkflow(model, options);
    return await workflow.call(history, onChunk, signal);
}

module.exports = {
    callLangchain,
    LangchainWorkflow,
    DevAgentOutputParser,
    createLangchainTools,
    LangchainPlanner
};
