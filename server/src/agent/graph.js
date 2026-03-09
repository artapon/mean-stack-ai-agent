const { StateGraph, START, END, Annotation } = require("@langchain/langgraph");
const { AIMessage, HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { DevAgentOutputParser, cleanResponse } = require("./langchain");
const { ChatOpenAI } = require("@langchain/openai");
const path = require('path');
const fs = require('fs-extra');
const { createLogger } = require('../utils/logger');

const graphLogger = createLogger('LangGraph');

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LangGraph Orchestrator for DevAgent
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// Define the State Schema
const AgentState = Annotation.Root({
    messages: Annotation({
        reducer: (x, y) => x.concat(y),
    }),
    agentState: Annotation({
        reducer: (x, y) => ({ ...x, ...y }),
    }),
    config: Annotation({
        reducer: (x, y) => ({ ...x, ...y }),
    }),
    lastAction: Annotation({
        reducer: (x, y) => y,
    }),
    lastResult: Annotation({
        reducer: (x, y) => y,
    }),
    step: Annotation({
        reducer: (x, y) => y,
    }),
    // Loop detection state
    lastActionSig: Annotation({
        reducer: (x, y) => y,
    }),
    currentActionSig: Annotation({
        reducer: (x, y) => y,
    }),
    lastActionRepeat: Annotation({
        reducer: (x, y) => y,
    })
});

/**
 * Rough token estimator: 1 token ≈ 4 characters.
 */
function estimateTokens(text) {
    return Math.ceil((text || '').length / 4);
}

/**
 * Truncate a single message's content to at most maxChars characters.
 */
function truncateContent(content, maxChars) {
    if (typeof content !== 'string' || content.length <= maxChars) return content;
    return content.slice(0, maxChars) + '\n...[TRUNCATED]';
}

/**
 * Build the final message list that fits within contextTokenLimit.
 *  - Reserves RESERVE_FOR_OUTPUT tokens for the model's response.
 *  - Always includes the system prompt (truncated if needed).
 *  - Always includes the first HumanMessage (original user task).
 *  - Fills remaining budget with the most-recent messages, skipping oversized ones.
 */
function buildContextMessages(systemPrompt, history, contextTokenLimit) {
    const RESERVE_FOR_OUTPUT = Math.min(1024, Math.floor(contextTokenLimit * 0.25));
    const MAX_MSG_CHARS       = 4000; // per-message character cap before truncation
    const inputBudgetTokens   = contextTokenLimit - RESERVE_FOR_OUTPUT;
    const inputBudgetChars    = inputBudgetTokens * 4;

    // System prompt — truncate to at most half the input budget
    const sysMaxChars  = Math.floor(inputBudgetChars * 0.5);
    const sysContent   = truncateContent(systemPrompt || '', sysMaxChars);
    const sysTokens    = estimateTokens(sysContent);

    let remaining = inputBudgetTokens - sysTokens;

    // Find the first HumanMessage — this is the original user task; must always be included
    const firstHumanIdx = history.findIndex(m => m instanceof HumanMessage);

    const kept = [];
    const includedIdxs = new Set();

    // Walk history newest→oldest — use continue (not break) to skip oversized messages
    for (let i = history.length - 1; i >= 0; i--) {
        if (remaining <= 0) break;
        const msg     = history[i];
        const raw     = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const content = truncateContent(raw, MAX_MSG_CHARS);
        const tokens  = estimateTokens(content);

        if (tokens > remaining) continue; // skip this one, try older/smaller messages
        remaining -= tokens;
        includedIdxs.add(i);

        if (content !== raw) {
            kept.unshift(new msg.constructor(content));
        } else {
            kept.unshift(msg);
        }
    }

    // Always ensure first HumanMessage is present (force-insert if budget skipped it)
    if (firstHumanIdx !== -1 && !includedIdxs.has(firstHumanIdx)) {
        const msg     = history[firstHumanIdx];
        const raw     = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const content = truncateContent(raw, Math.max(remaining, 1) * 4);
        // Insert after SystemMessage position (index 0 of kept)
        kept.unshift(new HumanMessage(content));
    }

    const finalMessages = [];
    if (sysContent) finalMessages.push(new SystemMessage(sysContent));
    finalMessages.push(...kept);
    return finalMessages;
}

/**
 * Utility to create a ChatOpenAI instance based on state config.
 */
function createModel(config) {
    const baseUrl = (process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234').replace(/\/$/, '') + '/v1';
    // Cap maxTokens to what the model's context actually allows for output
    return new ChatOpenAI({
        modelName: config.resolvedModel,
        temperature: 0.1,
        streaming: true,
        configuration: {
            baseURL: baseUrl,
            apiKey: "lm-studio",
        },
        maxTokens: 2048,
    });
}

/**
 * NODE: call_model
 * Trims history, calls LLM, and parses output.
 */
async function callModel(state) {
    const { messages, config, agentState } = state;
    const model = createModel(config);
    const parser = new DevAgentOutputParser(config.fastMode);

    const ctxLimit     = config.contextSize || parseInt(process.env.LM_CONTEXT_SIZE || '4096', 10);
    const finalMessages = buildContextMessages(config.systemPrompt, messages, ctxLimit);

    // SAFETY: Prevent "No user query found" in LM Studio
    if (!finalMessages.some(m => m instanceof HumanMessage)) {
        finalMessages.push(new HumanMessage("[SYSTEM DIRECTIVE] Continue with your next step."));
    }

    const estTokens = finalMessages.reduce((s, m) => s + estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)), 0);
    graphLogger.info(`[callModel] context ~${estTokens} tokens (limit ${ctxLimit}), msgs: ${finalMessages.length}`);

    // DEBUG: log full request payload when DEBUG=true
    if (process.env.DEBUG === 'true') {
        const payload = {
            model: config.resolvedModel,
            temperature: 0.1,
            stream: true,
            max_tokens: 2048,
            messages: finalMessages.map(m => ({
                role: m._getType ? m._getType() : (m.constructor?.name || 'unknown'),
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })),
        };
        graphLogger.info(`[callModel][DEBUG] Full request payload:\n${JSON.stringify(payload, null, 2)}`);
    }

    let fullText = "";
    let parsed;
    let cleanedText;
    try {
        const response = await model.invoke(finalMessages);
        fullText = response.content;

        // Clean output for the graph state (strips <think> tags etc.)
        cleanedText = cleanResponse(fullText);

        // DEBUG: log raw model response before parsing
        if (process.env.DEBUG === 'true') {
            graphLogger.info(`[callModel][DEBUG] Raw response before parser:\n${cleanedText}`);
        }

        parsed = await parser.parse(cleanedText);

        // Stream THOUGHT to UI (only if it shifted or we found one)
        if (config.onStep) {
            const thoughtMatch = cleanedText.match(/THOUGHT:\s*([\s\S]*?)(?=\s*ACTION:|$)/i);
            if (thoughtMatch && thoughtMatch[1].trim()) {
                config.onStep({ type: 'thought', content: thoughtMatch[1].trim() });
            }
        }
    } catch (err) {
        console.error(`[LangGraph] Model call failed:`, err.message);
        const repeatCount = (state.lastActionSig === "error") ? (state.lastActionRepeat || 0) + 1 : 0;

        const newState = {
            lastAction: { action: "error", error: err.message },
            lastActionSig: "error",
            lastActionRepeat: repeatCount
        };

        // Aggressive recovery for LM Studio Jinja errors
        if (err.message.includes("No user query found") || err.message.includes("jinja")) {
            console.warn("[LangGraph] Template error detected. Forcing HumanMessage context reset.");
            // Reset messages to contain exactly the system prompt + a human instruction
            const recoveryMessages = [
                new SystemMessage(config.systemPrompt || "You are a helpful assistant."),
                new HumanMessage("[SYSTEM DIRECTIVE] The previous prompt failed. Please proceed with your task using the provided tools.")
            ];
            newState.messages = recoveryMessages;
        } else {
            newState.messages = [new AIMessage(`Error: ${err.message}`)];
        }

        return newState;
    }

    // Stream action to the UI
    if (config.onStep && parsed.action && parsed.action !== 'finish') {
        config.onStep({
            type: 'tool_call',
            tool: parsed.action,
            parameters: parsed.parameters,
            step: (state.step || 0) + 1
        });
    }

    // Loop detection logic
    const sig = `${parsed.action}:${JSON.stringify(parsed.parameters)}`;
    // Correct logic: compare current signature with the one from the PREVIOUS model call
    const repeatCount = (sig === state.currentActionSig) ? (state.lastActionRepeat || 0) + 1 : 0;

    return {
        lastAction: parsed,
        messages: [new AIMessage(cleanedText)], // Store cleaned message in history
        step: (state.step || 0) + 1,
        lastActionSig: state.currentActionSig,
        currentActionSig: sig,
        lastActionRepeat: repeatCount
    };
}

/**
 * NODE: execute_tool
 * Runs the requested tool and returns the result.
 */
async function executeTool(state, TOOLS) {
    const { lastAction, config } = state;
    const { action, parameters } = lastAction;

    graphLogger.toolCall(action, { step: state.step || 0, action, parameters });

    if (action === "finish") {
        // Auto-log review feedback for handoff
        if (config.mode === 'review' && lastAction.response) {
            const r = lastAction.response;
            if (r.includes('[CODE: NOT OK]') || r.toLowerCase().includes('issue')) {
                try {
                    const lp = path.resolve(config.effectiveWorkspaceDir || process.cwd(), 'agent-handoff.log');
                    fs.appendFileSync(lp, `\n[${new Date().toLocaleString()}] REVIEWER:\n${r}\n${'-'.repeat(40)}\n`, 'utf-8');
                    console.log(`[LangGraph] Review handoff logged to: ${lp}`);
                } catch (e) {
                    console.warn('[LangGraph] Failed to log review handoff:', e.message);
                }
            }
        }
        return { lastResult: { success: true, message: "Finished" } };
    }

    // Tool alias mapping for robustness (handles common model hallucinations)
    const toolAliasMap = {
        'create_file': 'write_file',
        'update_file': 'write_file',
        'read': 'read_file',
        'ls': 'list_files',
        'delete_file': 'replace_in_file', // We don't have delete, but often they use it for empty writes
    };

    const targetAction = toolAliasMap[action] || action;
    const toolFunc = TOOLS[targetAction];

    if (!toolFunc) {
        const errorMsg = `Tool "${action}" not found. Available: ${Object.keys(TOOLS).join(', ')}`;
        console.warn(`[LangGraph] Tool Error: ${errorMsg}`);
        if (config.onStep) config.onStep({ type: 'error', message: errorMsg });
        return {
            lastResult: { success: false, error: errorMsg },
            messages: [new HumanMessage(`Error: ${errorMsg}`)]
        };
    }

    try {
        const p = { ...parameters };
        if (config.targetFolderName) {
            // Only force flat mode if we are scaffolding INTO the current focused directory
            if (targetAction === 'scaffold_project' && p.name === config.targetFolderName) p.flat = true;

            const strip = (fp) => {
                if (!fp || typeof fp !== 'string') return fp;
                const np = fp.replace(/\\/g, '/'), nt = config.targetFolderName.replace(/\\/g, '/');
                if (np === nt) return '.';
                return np.startsWith(nt + '/') ? np.slice(nt.length + 1) : fp;
            };
            ['path', 'file', 'filepath', 'filename', 'target'].forEach(k => { if (p[k]) p[k] = strip(p[k]); });
            if ((targetAction === 'bulk_write' || targetAction === 'apply_blueprint') && Array.isArray(p.files))
                p.files.forEach(f => ['path', 'file'].forEach(k => { if (f[k]) f[k] = strip(f[k]); }));
        }

        // Deciding base directory for tool execution
        // scaffold_project is a special case: if not 'flat', it should create a new folder in the root workspaceDir
        const toolBaseDir = (targetAction === 'scaffold_project' && !p.flat)
            ? (config.workspaceDir || config.effectiveWorkspaceDir)
            : config.effectiveWorkspaceDir;

        const result = await toolFunc(p, toolBaseDir, false, config.projectRoot || config.workspaceDir);
        const resolvedAction = targetAction; // Use the mapped action for state tracking

        const newState = {};
        if (['write_file', 'replace_in_file', 'bulk_write', 'apply_blueprint', 'scaffold_project', 'delete_file'].includes(resolvedAction)) {
            // Check top level path first
            const topPath = (parameters.path || parameters.file || '').toLowerCase();
            // Check nested paths (for bulk operations)
            const nestedPaths = Array.isArray(parameters.files)
                ? parameters.files.map(f => (f.path || f.file || '').toLowerCase()).join('|')
                : (typeof parameters.content === 'string' ? parameters.content.slice(0, 1000).toLowerCase() : ''); // apply_blueprint might have it in content headers

            const isPlan = topPath.includes('developer_walkthrough.md') || topPath.includes('plan.md') ||
                nestedPaths.includes('developer_walkthrough.md') || nestedPaths.includes('plan.md');
            const isReport = topPath.includes('reviewer_walkthrough.md') || topPath.includes('system_analysis_walkthrough.md') ||
                nestedPaths.includes('reviewer_walkthrough.md') || nestedPaths.includes('system_analysis_walkthrough.md');

            if (isPlan) newState.planWritten = true;
            else if (isReport) newState.reportSaved = true;
            else newState.codeModified = true;
        }

        if (resolvedAction === 'list_files' && result.filesList) {
            const newFiles = result.filesList.map(f => String(f).toLowerCase());
            newState.discoveredFiles = Array.from(new Set([...(state.agentState.discoveredFiles || []), ...newFiles]));
        }

        if (resolvedAction === 'replace_in_file' && result.error) {
            const key = (parameters.path || parameters.file || '').toLowerCase();
            if (key) {
                const failCounts = { ...(state.agentState.replaceFailCounts || {}) };
                failCounts[key] = (failCounts[key] || 0) + 1;
                newState.replaceFailCounts = failCounts;

                // Provide a helpful snippet of what the file actually contains to help the agent fix its search block
                if (result.error.toLowerCase().includes('search block was not found')) {
                    try {
                        const absPath = path.resolve(config.effectiveWorkspaceDir, key.replace(/^[/\\]+/, ''));
                        if (fs.existsSync(absPath)) {
                            const actual = fs.readFileSync(absPath, 'utf-8');
                            const MAX_CH = 6000;
                            const snippet = actual.length > MAX_CH ? actual.slice(0, MAX_CH) + '\n...[TRUNCATED]' : actual;
                            result.currentFileContent = `CURRENT "${key}":\n\`\`\`\n${snippet}\n\`\`\`\n\nSearch block NOT found. Fix whitespace/match or rewrite with write_file.`;
                        }
                    } catch (e) { }
                }
            }
        }

        if (resolvedAction === 'read_file' && (parameters.path === 'package.json' || parameters.path === 'requirements.txt')) {
            newState.configRead = true;
        }
        if (resolvedAction === 'request_review') {
            newState.reviewRequested = true;
            if (config.onStep) config.onStep({ type: 'review_requested' });
        }

        // Log tool result
        graphLogger.toolResult(action, {
            step: state.step || 0,
            action,
            ok: result.success !== false && !result.error,
            error: result.error || null,
        });

        // Summary formatting
        const summary = `Tool ${action} result: ${JSON.stringify(result).slice(0, 200)}...`;

        // Stream result to UI
        if (config.onStep) {
            config.onStep({
                type: 'tool_result',
                tool: action,
                result: result
            });
        }

        return {
            lastResult: result,
            agentState: newState,
            messages: [new HumanMessage(summary)]
        };
    } catch (err) {
        graphLogger.toolResult(action, { step: state.step || 0, action, ok: false, error: err.message });
        if (config.onStep) config.onStep({ type: 'error', message: err.message });
        return {
            lastResult: { success: false, error: err.message },
            messages: [new HumanMessage(`Error: ${err.message}`)]
        };
    }
}

/**
 * CONDITIONAL EDGE: router
 * Decides whether to continue tool loop, finish, or handle errors/nudges.
 */
function router(state) {
    const { lastAction, step: rawStep, config, agentState, lastActionRepeat = 0 } = state;
    const { action } = lastAction;
    const step = Number(rawStep || 0);
    const maxSteps = Number(config?.maxSteps || 50);

    console.log(`[LangGraph] Router Check - Step: ${step}/${maxSteps}, Action: ${action || 'None'}`);

    // 1. HARD STOP: Max Steps Guard (First priority)
    if (step >= maxSteps) {
        console.warn(`[LangGraph] TERMINATING: Max steps reached (${step}/${maxSteps}). Action was: ${action}`);
        lastAction.error = "MAX_STEPS_REACHED";
        lastAction.response = `Agent reached MAX_STEPS (${maxSteps}). Please increase AGENT_MAX_STEPS or simplify the task.`;

        // Force finish even if it wasn't the model's action
        lastAction.action = "finish";
        lastAction.parameters = { response: lastAction.response };

        return "finish";
    }

    // 2. Check for Finish
    if (action === "finish") {
        // Developer Mode guards
        if (config.mode === 'developer' && step < maxSteps) {
            // Priority: If they modified code, they MUST write the walkthrough
            if (agentState.codeModified && !agentState.planWritten) {
                return "nudge_walkthrough_missing";
            }
            // If they haven't modified code OR written a plan, and it's early, they might be slacking
            if (!agentState.codeModified && !agentState.planWritten && step < 3) {
                return "nudge_premature_finish";
            }
        }

        // Review Mode guards
        if (config.mode === 'review') {
            if (!agentState.reportSaved) return "nudge_report_missing";
            if (!lastAction.response?.toUpperCase().includes('[CODE: OK]') && !lastAction.response?.toUpperCase().includes('[CODE: NOT OK]')) {
                return "nudge_verdict_missing";
            }
        }

        // Analysis Mode guards
        if (config.mode === 'analysis') {
            if (!agentState.configRead) return "nudge_config_missing";
            if (!agentState.reportSaved) return "nudge_analysis_missing";
            if (!lastAction.response?.toUpperCase().includes('[ANALYSIS: COMPLETE]')) {
                return "nudge_verdict_missing";
            }
        }

        // Auto review-request guard (Developer mode)
        // Note: do NOT gate on agentState.codeModified — if write_file failed, codeModified
        // is never set, so the agent would bypass review entirely. Always enforce when enabled.
        if (config.autoRequestReview && config.mode === 'developer' && !agentState.reviewRequested) {
            return "nudge_review_missing";
        }

        return "finish";
    }

    // 2. Check for Errors/Format Issues
    if (lastAction.error) {
        // If the model call itself failed (e.g. API error), don't loop forever
        // EXCEPT for Jinja/UserQuery errors which we now have auto-recovery for
        const isTemplateError = lastAction.error?.includes("No user query found") || lastAction.error?.includes("jinja");
        if (lastAction.action === "error" && (state.lastActionRepeat || 0) >= 3 && !isTemplateError) {
            console.error(`[LangGraph] Persistent model error. Aborting.`);
            return "finish";
        }

        if (isTemplateError) {
            console.log("[LangGraph] Template error detected, routing back to call_model for recovery.");
            return "call_model";
        }

        if (lastAction.isGarbled) return "nudge_format_recovery";
        return "nudge_general_error";
    }

    // 3. Duplicate Action Guard
    if (state.lastActionSig === state.currentActionSig && action !== 'chain_error' && action !== 'finish') {
        if (lastActionRepeat >= 3) {
            console.warn(`[LangGraph] Duplicate action detected (${action}). Triggering nudge.`);
            return "nudge_duplicate_loop";
        }
    }

    // 4. Check for unauthorized/empty action
    if (!action) {
        console.warn("[LangGraph] Empty action detected. Forcing model re-call.");
        return "call_model";
    }

    // 5. Unauthorized Tool Guard
    const allowedTools = config.allowedTools || [];
    if (action && !allowedTools.includes(action)) {
        return "nudge_unauthorized_tool";
    }

    return "execute_tool";
}

/**
 * NODE: handle_nudge
 * Injects specific nudges based on the failure reason.
 */
async function handleNudge(state, type) {
    const { config } = state;
    let directive = "";
    let ack = "[SYSTEM: Correction received — adjusting next action]";

    switch (type) {
        case "nudge_premature_finish":
            directive = `You called finish too early. You still need to write source code files and the walkthrough report. Do that NOW, then call finish.`;
            break;
        case "nudge_report_missing":
            directive = `You must write the review report to ./agent_reports/reviewer_walkthrough.md before finishing.`;
            break;
        case "nudge_verdict_missing":
            directive = `Your finish response is missing the required verdict ([CODE: OK], [CODE: NOT OK], or [ANALYSIS: COMPLETE]). Include it now.`;
            break;
        case "nudge_walkthrough_missing":
            directive = `You must write the walkthrough summary to ./agent_reports/developer_walkthrough.md before finishing.`;
            break;
        case "nudge_config_missing":
            directive = `You MUST read the project's configuration (e.g., package.json) before finishing.`;
            break;
        case "nudge_unauthorized_tool":
            directive = `The tool you used is not authorized in this mode. Please use only: ${config.allowedTools.join(", ")}`;
            break;
        case "nudge_analysis_missing":
            directive = `You must write the system analysis report to ./agent_reports/system_analysis_walkthrough.md before finishing.`;
            break;
        case "nudge_review_missing":
            directive = `You have not called request_review yet. You MUST do it now before finishing.\n\n` +
                `ACTION: request_review\n\n` +
                `PARAMETERS: {}\n\n` +
                `Output ONLY the ACTION and PARAMETERS above. Do NOT call finish yet.`;
            ack = "[SYSTEM: Correction received — calling request_review before finish]";
            break;
        case "nudge_format_recovery":
            directive = `Your last response was garbled or merged the THOUGHT/ACTION/PARAMETERS blocks incorrectly. 
Please follow this EXACT format:
THOUGHT: <your reasoning>
ACTION: <tool_name>
PARAMETERS: { "arg1": "value" }`;
            break;
        case "nudge_general_error":
            directive = `An error occurred: ${state.lastAction?.error || "Unknown error"}. Please fix your approach.`;
            break;
        case "nudge_duplicate_loop":
            directive = `You have repeated the same action 3 times. STOP and change your approach or finish if done.`;
            break;
        default:
            directive = "Follow the system instructions correctly.";
    }

    const messages = [
        new AIMessage(ack),
        new HumanMessage(`[SYSTEM DIRECTIVE]\n\n${directive}\n\nRespond with the correct ACTION and PARAMETERS block immediately.`)
    ];

    return { messages };
}

/**
 * Build and compile the graph.
 */
function createAgentGraph(TOOLS) {
    const workflow = new StateGraph(AgentState)
        .addNode("call_model", callModel)
        .addNode("execute_tool", (state) => executeTool(state, TOOLS))
        .addNode("nudge_premature_finish", (state) => handleNudge(state, "nudge_premature_finish"))
        .addNode("nudge_report_missing", (state) => handleNudge(state, "nudge_report_missing"))
        .addNode("nudge_analysis_missing", (state) => handleNudge(state, "nudge_analysis_missing"))
        .addNode("nudge_verdict_missing", (state) => handleNudge(state, "nudge_verdict_missing"))
        .addNode("nudge_walkthrough_missing", (state) => handleNudge(state, "nudge_walkthrough_missing"))
        .addNode("nudge_config_missing", (state) => handleNudge(state, "nudge_config_missing"))
        .addNode("nudge_unauthorized_tool", (state) => handleNudge(state, "nudge_unauthorized_tool"))
        .addNode("nudge_duplicate_loop", (state) => handleNudge(state, "nudge_duplicate_loop"))
        .addNode("nudge_format_recovery", (state) => handleNudge(state, "nudge_format_recovery"))
        .addNode("nudge_general_error", (state) => handleNudge(state, "nudge_general_error"))
        .addNode("nudge_review_missing", (state) => handleNudge(state, "nudge_review_missing"))
        .addEdge(START, "call_model")
        .addConditionalEdges("call_model", router, {
            "execute_tool": "execute_tool",
            "nudge_premature_finish": "nudge_premature_finish",
            "nudge_report_missing": "nudge_report_missing",
            "nudge_analysis_missing": "nudge_analysis_missing",
            "nudge_verdict_missing": "nudge_verdict_missing",
            "nudge_walkthrough_missing": "nudge_walkthrough_missing",
            "nudge_config_missing": "nudge_config_missing",
            "nudge_unauthorized_tool": "nudge_unauthorized_tool",
            "nudge_duplicate_loop": "nudge_duplicate_loop",
            "nudge_format_recovery": "nudge_format_recovery",
            "nudge_general_error": "nudge_general_error",
            "nudge_review_missing": "nudge_review_missing",
            "call_model": "call_model",
            "finish": END
        })
        .addEdge("execute_tool", "call_model")
        .addEdge("nudge_premature_finish", "call_model")
        .addEdge("nudge_report_missing", "call_model")
        .addEdge("nudge_analysis_missing", "call_model")
        .addEdge("nudge_verdict_missing", "call_model")
        .addEdge("nudge_walkthrough_missing", "call_model")
        .addEdge("nudge_config_missing", "call_model")
        .addEdge("nudge_unauthorized_tool", "call_model")
        .addEdge("nudge_duplicate_loop", "call_model")
        .addEdge("nudge_format_recovery", "call_model")
        .addEdge("nudge_general_error", "call_model")
        .addEdge("nudge_review_missing", "call_model");

    return workflow.compile();
}

module.exports = {
    createAgentGraph
};
