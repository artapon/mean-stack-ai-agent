const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, SystemMessage, AIMessage } = require("@langchain/core/messages");
const { DynamicTool, DynamicStructuredTool } = require("@langchain/core/tools");
const { BaseOutputParser } = require("@langchain/core/output_parsers");
const { RunnableSequence } = require("@langchain/core/runnables");
const { ChatPromptTemplate, MessagesPlaceholder } = require("@langchain/core/prompts");
const path = require('path');
const fs = require('fs-extra');

/**
 * Removes <think>...</think> blocks from model responses.
 * Also cleans common garbled artifacts like ACTIONMETERS.
 */
function cleanResponse(text) {
    if (!text || typeof text !== 'string') return text;
    // Strip <think> blocks and their content
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // Clean merged markers if any leaked through
    cleaned = cleaned.replace(/ACTIONARAMETERS|ACTIONMETERS|THOUGHTACTION|ACTIONPARAMETERS/i, '').trim();
    return cleaned;
}

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
            // DETECT MERGED MARKERS (Known LM Studio / Context Panic Issue)
            const isMerged = /ACTIONARAMETERS|ACTIONMETERS|THOUGHTACTION|ACTIONPARAMETERS/i.test(text);
            if (isMerged) {
                return {
                    action: "error",
                    response: text,
                    error: "GARBLED OUTPUT DETECTED: Merged markers (e.g. ACTIONMETERS) found. Re-anchoring format."
                };
            }

            const thoughtMatch = text.match(/THOUGHT:\s*([\s\S]*?)(?=ACTION:|$)/i);
            const actionMatch = text.match(/ACTION:\s*([\w_]+)/i);
            const paramsMatch = text.match(/PARAMETERS:\s*(\{[\s\S]*?\})/i);

            const result = {
                thought: thoughtMatch ? thoughtMatch[1].trim() : "",
                action: actionMatch ? actionMatch[1].trim().toLowerCase() : (isMerged ? "error" : "finish"),
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

            // Final validation: if no action found and not finish, it's a parse error
            if (!actionMatch && text.length > 50) {
                result.error = "Could not identify ACTION marker. Please ensure format is: THOUGHT: ... ACTION: ... PARAMETERS: { ... }";
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
            let isThinking = false;
            let thinkBuffer = "";

            const stream = await this.chat.stream(messages, { signal });

            for await (const chunk of stream) {
                if (signal?.aborted) throw new Error('AbortSignal triggered');
                const content = chunk.content;
                if (content) {
                    fullText += content;

                    // STREAM FILTERING: Skip content inside <think> tags
                    if (content.includes('<think>')) isThinking = true;

                    if (!isThinking) {
                        // Regular content - send to UI
                        if (onChunk) onChunk(content);
                    } else {
                        // Buffer thinking content to check for end tag
                        thinkBuffer += content;
                        if (thinkBuffer.includes('</think>')) {
                            const parts = thinkBuffer.split('</think>');
                            const afterThink = parts.slice(1).join('</think>');
                            if (afterThink && onChunk) onChunk(afterThink);
                            isThinking = false;
                            thinkBuffer = "";
                        }
                    }
                }
            }
            return cleanResponse(fullText);
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
        return cleanResponse(response.content);
    }
}

/**
 * Bridge for existing core call logic.
 */
async function callLangchain(history, onChunk, signal, selectedModel, options = {}) {
    const model = selectedModel || process.env.LM_STUDIO_MODEL || 'openai/gpt-oss-20b';
    const workflow = new LangchainWorkflow(model, options);
    let result = await workflow.call(history, onChunk, signal);

    // FORMATTING: If in Review mode and the message looks like a summary, wrap with code block for readability
    if (options.isReview && result.length > 100 && !result.includes('```')) {
        result = "```markdown\n" + result + "\n```";
    }

    return result;
}

/**
 * Langchain Analysis Guard
 * Specifically used to verify reports against hallucinations (ghost libraries, fake files).
 */
class LangchainAnalysisGuard {
    constructor(modelName) {
        const baseUrl = (process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234').replace(/\/$/, '') + '/v1';
        this.chat = new ChatOpenAI({
            modelName,
            temperature: 0, // Deterministic for verification
            configuration: {
                baseURL: baseUrl,
                apiKey: "lm-studio",
            },
        });
    }

    /**
     * Verifies that all libraries mentioned in the Tech Stack exist in package.json
     */
    async verifyDependencies(reportContent, packageJsonContent) {
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", `You are a Strict Architectural Validator. Compare the "Technology Stack" section of an Analysis Report against a real package.json.
            
TASKS:
1. HALLUCINATION CHECK: Identify any library listed in the report that is ABSENT from the package.json.
2. OMISSION CHECK: Identify any library in the package.json (dependencies or devDependencies) that is MISSING from the report.

RESPONSE FORMAT:
- If perfect: "VERIFIED"
- If errors: "HALLUCINATION DETECTED: [libs]" and/or "OMISSION DETECTED: [libs]". List the exact package names.`],
            ["human", "PACKAGE.JSON:\n{packageJson}\n\nREPORT CONTENT:\n{report}"]
        ]);

        const chain = RunnableSequence.from([prompt, this.chat]);
        const response = await chain.invoke({ packageJson: packageJsonContent, report: reportContent });
        return cleanResponse(response.content);
    }
}

module.exports = {
    callLangchain,
    LangchainWorkflow,
    DevAgentOutputParser,
    createLangchainTools,
    LangchainPlanner,
    LangchainAnalysisGuard
};
