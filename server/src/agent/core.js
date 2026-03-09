const path = require('path');
const fs = require('fs-extra');
const { readFile, writeFile, listFiles, bulkWrite, applyBlueprint, bulkRead, replaceInFile, createDirectory } = require('../tools/filesystem');
const { scaffoldProject } = require('../tools/scaffolder');
const { callLangchain, LangchainWorkflow, DevAgentOutputParser, createLangchainTools, LangchainPlanner, LangchainAnalysisGuard } = require('./langchain');
const { AIMessage, HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { logError, logInfo } = require('../utils/logger');
const { saveSession: saveSessionFile } = require('../utils/session');
const { createAgentMemory } = require('./memory');
const { createAgentGraph } = require('./graph');


// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK RESPONSE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════
//
// ROOT CAUSE of "ACTIONARAMETERS" death spiral:
//   When a nudge was injected as a bare user message (role:'user', content:'Error: ...'),
//   the model received a raw instruction with NO preceding assistant turn. This breaks
//   the expected assistant→user→assistant rhythm, causing the model to panic and output
//   garbled merged markers like "1. ACTIONARAMETERS:" instead of valid tool calls.
//
// SOLUTION — pushNudge():
//   Every guard that needs to redirect the model MUST call pushNudge() instead of
//   directly pushing to history. pushNudge() injects a PAIR of entries:
//     1. assistant turn  — a well-formed acknowledgement (looks like a model response)
//     2. user turn       — the actual directive in clean, numbered imperative format
//
//   This preserves the conversation rhythm the model was trained on, preventing
//   format panic and ensuring the next response is a valid ACTION+PARAMETERS block.
//
// RECOVERY BLOCK — pushFormatRecovery():
//   When chain_error fires (garbled output detected), we inject a strong re-anchor
//   block that explicitly shows the model what valid output looks like. This replaces
//   the old bare "Error: ..." message that made the panic worse.
//
// ═══════════════════════════════════════════════════════════════════════════════

// ── LangChain Memory System ──────────────────────────────────────────────────
//
// DevAgent has migrated from raw array-based history to LangChain-based memory.
// AgentMemory (memory.js) provides:
//   1. Structured message storage (AIMessage/HumanMessage/SystemMessage)
//   2. Intelligent sliding windowing (preserving essential context like reports)
//   3. Persistence via session serialization
//
// GUARDRAILS:
//   All nudges and format recovery now MUST use agentMemory.pushNudge() and
//   agentMemory.pushFormatRecovery(). These methods inject PAIRS of messages
//   (Assistant Ack + User Directive) to preserve the conversation rhythm
//   expected by the model.
// ──────────────────────────────────────────────────────────────────────────────


// ── System prompt & Skills ─────────────────────────────────────────────────────
/**
 * Loads the agent's skill files dynamically based on the current mode.
 * @param {string} mode - 'developer', 'review', or 'analysis'
 * @param {string} stack
 * @returns {string}
 */
function loadSkills(mode, stack = 'default') {
  const agentDir = __dirname;
  const stackDir = path.join(agentDir, 'agents', stack);

  console.log(`[DevAgent] 🛠 Loading prompts for stack: ${stack} | Mode: ${mode}`);

  const read = (dir, filename) => {
    try {
      const p = path.join(dir, filename);
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');

      // Fallback to default if not found in requested stack
      if (stack !== 'default') {
        const fallBackPath = path.join(agentDir, 'agents', 'default', filename);
        if (fs.existsSync(fallBackPath)) return fs.readFileSync(fallBackPath, 'utf-8');
      }

      // Legacy fallback (mean_stack)
      if (stack !== 'mean_stack') {
        const meanPath = path.join(agentDir, 'agents', 'mean_stack', filename);
        if (fs.existsSync(meanPath)) return fs.readFileSync(meanPath, 'utf-8');
      }

      return '';
    } catch (e) {
      console.warn(`[DevAgent] Could not load ${filename}:`, e.message);
      return '';
    }
  };

  const filenameMap = {
    'developer': 'developer.md',
    'review': 'review.md',
    'analysis': 'system_analysis.md'
  };

  const skillFiles = [];
  if (mode !== 'analysis') skillFiles.push(read(stackDir, 'skill.md'));
  skillFiles.push(read(stackDir, filenameMap[mode] || 'developer.md'));

  return skillFiles.filter(Boolean).join('\n\n---\n\n');
}

/**
 * Returns the authoritative list of tools allowed for a given mode.
 * @param {string} mode - 'developer', 'review', or 'analysis'
 * @returns {Array} toolsList
 */
function getToolsForMode(mode) {
  const allTools = [
    { name: 'read_file', params: '{path}', safe: true },
    { name: 'write_file', params: '{path, content}', safe: false },
    { name: 'replace_in_file', params: '{path, search, replace}', safe: false },
    { name: 'bulk_write', params: '{files:[{path,content}]}', safe: false },
    { name: 'apply_blueprint', params: '{content}', safe: false },
    { name: 'list_files', params: '{path}', safe: true },
    { name: 'create_directory', params: '{path}', safe: false },
    { name: 'bulk_read', params: '{paths:[]}', safe: true },
    { name: 'scaffold_project', params: '{type, name} (types: express-api, express-api-swagger, express-api-mongo, modular-standard, healthcare-api, vue-app, landing-page, fullstack, fullstack-auth)', safe: false },
    { name: 'order_fix', params: '{instructions}', safe: true },
    { name: 'request_review', params: '{}', safe: true }
  ];

  if (mode === 'review') {
    return allTools.filter(t => ['read_file', 'write_file', 'list_files', 'bulk_read', 'order_fix'].includes(t.name));
  } else if (mode === 'analysis') {
    return allTools.filter(t => ['read_file', 'write_file', 'list_files', 'bulk_read'].includes(t.name));
  }
  return allTools; // Developer gets everything
}

/**
 * Builds the full system prompt.
 * @param {string} mode - 'developer', 'review', or 'analysis'
 * @param {string}  [targetFolder]
 * @param {boolean} [fastMode]
 * @param {boolean} [autoRequestReview]
 * @param {string}  [stack]
 * @param {boolean} [isFollowAnalysis]
 * @returns {string}
 */
function getSystemPrompt(mode, targetFolder, fastMode = false, autoRequestReview = false, stack = 'default', isFollowAnalysis = false) {
  const EXPERT_SKILLS = loadSkills(mode, stack);
  const toolsList = getToolsForMode(mode);

  const availableTools = toolsList
    .map(t => `  ${t.name.padEnd(16)} ${t.params}`)
    .join('\n');

  // Analysis mode MANDATES the template (system_analysis.md) even in fast mode to prevent structural hallucinations.
  // Developer/Review modes skip the skill.md/developer.md in fast mode for speed.
  const skillHeader = (mode === 'analysis' || !fastMode) ? EXPERT_SKILLS : '';

  return `${skillHeader ? skillHeader + '\n\n---\n\n' : ''}You are an expert ${stack === 'mean_stack' ? 'MEAN Stack' : ''} agentic AI developer.
${mode === 'review'
      ? 'You are currently in REVIEW MODE. AUDIT the codebase. ONLY use write_file for ./agent_reports/reviewer_walkthrough.md.'
      : mode === 'analysis'
        ? 'You are currently in ANALYSIS MODE. SCAN and ANALYZE the codebase. ONLY use write_file for ./agent_reports/system_analysis_walkthrough.md. DO NOT modify source code. 🛑 **STRICT REGULATION**: Do NOT include any folders or files in your report (especially the Tree View) that were not physically found in your scan. NO GHOST FOLDERS allowed.'
        : 'Your primary goal is to MODIFY THE FILESYSTEM using tools — never describe code.'}
${targetFolder ? `\nCURRENT WORKSPACE ROOT: "${targetFolder}"` : ''}
${isFollowAnalysis ? '\n[FOLLOW ANALYSIS] ACTIVE: A System Analysis report is injected into your context. You MUST follow its architecture, module map, and file list strictly. DO NOT use scaffold_project to generate boilerplate; use write_file to fulfill the specific report requirements. IMPORTANT: When translating the Tree View to write_file calls, STRIP any leading "/root" or "/" characters to ensure paths are relative to the CURRENT WORKSPACE ROOT.' : ''}
${process.env.ENABLE_TRANSFORMERS === 'true' ? '\n[LOCAL AI CAPABILITY] ENABLED: The `@xenova/transformers` library is available in the server environment.' : ''}

🛑 **PATH SAFETY WARNING**: NEVER prefix your file paths with "root/". Your current working directory IS the project root. Use "src/app.js" NOT "root/src/app.js". If you use "root/", your action will be REJECTED.

TOOLS:
${availableTools}

TOOL CALL FORMAT (MANDATORY & RIGID):
${fastMode
      ? `ACTION: (tool name)\n\nPARAMETERS: (JSON)\n\nCRITICAL: DO NOT OUTPUT ANY "THOUGHT" OR REASONING BLOCK. DO NOT REPEAT "ACTION" OR "PARAMETERS" MARKERS. JUST ONE ACTION BLOCK.\n\n🛑 **ZERO TOLERANCE**: Do NOT use architectural intuition to guess project structure. If you didn't see the folder in list_files, it DOES NOT exist.`
      : `THOUGHT: (reasoning)\n\nACTION: (tool name)\n\nPARAMETERS: (JSON)`}

CRITICAL: Each marker must be on its own line with a BLANK LINE before it.
NEVER write "1. ACTION" or "ACTIONARAMETERS" or merge markers in any way.
NEVER number or bold the markers. Just: THOUGHT, ACTION, PARAMETERS — separated by blank lines.

FINISH FORMAT:
${fastMode
      ? `ACTION: finish\n\nPARAMETERS: { "response": "Markdown summary." }`
      : `THOUGHT: (done reasoning)\n\nACTION: finish\n\nPARAMETERS: { "response": "Markdown summary." }`}

RULES:
1. GENERATE mode: SCAN -> READ -> IMPLEMENT -> DOCUMENT (./agent_reports/developer_walkthrough.md) -> FINISH.
2. REVIEW mode: READ all files -> ANALYZE -> WRITE ./agent_reports/reviewer_walkthrough.md -> FINISH with [CODE: OK] or [CODE: NOT OK].
3. ANALYSIS mode: SCAN -> IDENTIFY STACK -> MAP MODULES -> WRITE ./agent_reports/system_analysis_walkthrough.md -> FINISH with [ANALYSIS: COMPLETE].
4. ALWAYS use tools to write files. Never output code blocks in plain text.
5. JSDoc 3.0 on every method.
6. Adapt to the project's ACTUAL structure discovered via list_files. DO NOT assume a specific directory layout.
7. NO placeholders. Write full working code.
8. NO shell commands in write_file.
9. Single action per response — ONE THOUGHT + ONE ACTION + ONE PARAMETERS block.
${fastMode ? '10. FAST MODE: No THOUGHT block at all.' : ''}
${autoRequestReview && mode === 'developer' ? '11. Call "request_review" after EVERYTHING else (code, documentation) is done, and BEFORE "finish". This is MANDATORY.' : ''}
12. RELATIVE PATHS: Always use paths RELATIVE to the workspace root. NEVER start paths with a slash (e.g., use "src/file.js" NOT "/src/file.js" or "/root/src/file.js"). Access to absolute system paths is FORBIDDEN.
`;
}

// ── Tools ──────────────────────────────────────────────────────────────────────
const TOOLS = {
  read_file: readFile,
  write_file: writeFile,
  replace_in_file: replaceInFile,
  bulk_write: bulkWrite,
  apply_blueprint: applyBlueprint,
  list_files: listFiles,
  create_directory: createDirectory,
  bulk_read: bulkRead,
  scaffold_project: scaffoldProject,

  /** @param {{instructions:string}} params @param {string} workspaceDir */
  order_fix: async (params, workspaceDir) => {
    const instructions = params.instructions || params.content || params.message;
    if (!instructions) throw new Error('Missing "instructions" parameter.');
    const logPath = path.resolve(workspaceDir, 'agent-handoff.log');
    await fs.ensureDir(path.dirname(logPath));
    await fs.appendFile(logPath,
      `\n[${new Date().toLocaleString()}] REVIEWER ORDER:\n${instructions}\n${'-'.repeat(40)}\n`, 'utf-8');
    return { success: true, message: 'Logged to agent-handoff.log', path: 'agent-handoff.log' };
  },

  /** @param {{}} params @param {string} workspaceDir */
  request_review: async (params, workspaceDir) => {
    const logPath = path.resolve(workspaceDir, 'agent-handoff.log');
    await fs.ensureDir(path.dirname(logPath));
    await fs.appendFile(logPath,
      `\n[${new Date().toLocaleString()}] DEVELOPER REQUEST:\nReady for review.\n${'-'.repeat(40)}\n`, 'utf-8');
    return { success: true, message: 'Review request logged.', path: 'agent-handoff.log' };
  }
};


// ── Extract SSE reply text ─────────────────────────────────────────────────────
/** @param {object} data @returns {string|null} */
function extractReply(data) {
  if (!data) return null;
  if (data.choices?.[0]) {
    const c = data.choices[0];
    if (c.delta?.content) return c.delta.content;
    if (c.message?.content) return c.message.content;
  }
  if (Array.isArray(data.output)) {
    const msg = data.output.find(b => b.type === 'message');
    if (msg?.content) return msg.content;
    return data.output.map(b => b.content || '').join('').trim();
  }
  return data.output || data.response || data.text || data.content || (typeof data === 'string' ? data : null);
}


// ── Extract JSON from raw model output ────────────────────────────────────────
/** @param {string} raw @returns {object|null} */
function extractJSON(raw) {
  if (!raw) return null;
  const i = raw.indexOf('{');
  if (i === -1) return null;

  let depth = 0, end = -1, inQuote = null;
  for (let j = i; j < raw.length; j++) {
    const c = raw[j];
    if (c === '\\') { j++; continue; }
    if (inQuote) { if (c === inQuote) inQuote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inQuote = c; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  // Truncated JSON (stream cut off mid-token by max_tokens): close the string and object
  const truncated = end === -1;
  if (truncated) end = raw.length - 1;
  let candidate = raw.slice(i, end + 1);

  // If stream was truncated, attempt to close any open string then close the object
  if (truncated) {
    // Count quote parity to see if we're inside a string value
    let q = 0;
    for (let k = 0; k < candidate.length; k++) {
      if (candidate[k] === '\\') { k++; continue; }
      if (candidate[k] === '"') q ^= 1;
    }
    if (q === 1) candidate += '"'; // close open string
    candidate += '}';             // close object
  }

  // Strip known system-noise patterns that leak into content strings
  const NOISE = [
    /THOUGHT:\s*I need to follow the mandatory instruction[^\n]*/gi,
    /\[SYSTEM:\s*Correction received[^\]]*\]/gi,
    /\[SYSTEM DIRECTIVE\][^\n]*/gi,
    /\[GARBLED OUTPUT[^\]]*\]/gi,
  ];
  const stripNoise = (s) => {
    let r = s;
    NOISE.forEach(re => { r = r.replace(re, ''); });
    return r.trim();
  };

  const parseAndClean = (s) => {
    let j;
    try { j = JSON.parse(s); } catch (_) { return null; }
    if (j && typeof j.content === 'string') j.content = stripNoise(j.content);
    if (j && typeof j.replace === 'string') j.replace = stripNoise(j.replace);
    return j;
  };
  const r1 = parseAndClean(candidate); if (r1) return r1;
  try {
    const r = require('vm').runInNewContext('(' + candidate + ')', Object.create(null));
    if (r && typeof r === 'object') {
      if (typeof r.content === 'string') r.content = stripNoise(r.content);
      return r;
    }
  } catch (_) { }
  const r2 = parseAndClean(candidate.replace(/,(\s*[}\]])/g, '$1')); if (r2) return r2;

  // Field-by-field recovery
  try {
    const clean = candidate.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();
    const result = { _isRecovered: true };
    const extractField = (name) => {
      const ki = clean.search(new RegExp(`"?${name}"?\\s*:`, 'i'));
      if (ki === -1) return null;
      let slice = clean.slice(clean.indexOf(':', ki) + 1).trim();
      const md = slice.match(/^```(?:[a-z]*)\n?([\s\S]*?)```/i);
      if (md) return md[1].trim();
      if (slice.startsWith('```')) {
        const le = slice.indexOf('\n');
        return slice.slice(le === -1 ? 3 : le + 1).replace(/\n?\}?\s*$/g, '').trim();
      }
      const dm = slice.match(/^["'`]/);
      if (dm) {
        const d = dm[0]; let fe = -1, esc = false;
        for (let k = 1; k < slice.length; k++) {
          if (esc) { esc = false; continue; }
          if (slice[k] === '\\') { esc = true; continue; }
          if (slice[k] === d) {
            const after = slice.slice(k + 1).trim();
            if (after.startsWith(',') || after.startsWith('}') || !after) { fe = k; break; }
          }
        }
        if (fe === -1) fe = slice.lastIndexOf(d);
        if (fe > 0) return slice.slice(1, fe);
        return slice.slice(1).replace(/\n?\}?\s*$/g, '').trim();
      }
      return null;
    };
    let any = false;
    ['path', 'content', 'search', 'replace', 'name', 'type', 'files'].forEach(f => {
      const v = extractField(f); if (v !== null) { result[f] = v; any = true; }
    });
    if (any) {
      // Clean noise from content/replace fields that leaked from nudge messages
      if (typeof result.content  === 'string') result.content  = stripNoise(result.content);
      if (typeof result.replace  === 'string') result.replace  = stripNoise(result.replace);
      return result;
    }
  } catch (_) { }
  return null;
}


// ── Detect garbled / merged-marker output ─────────────────────────────────────
/**
 * Returns true if the raw output is definitively malformed (merged markers,
 * garbage repetition, etc.) and cannot be parsed into a valid action.
 *
 * DESIGN: We detect the specific pattern seen in logs ("1. ACTIONARAMETERS:")
 * and similar hallucinations, then route to pushFormatRecovery() instead of
 * the normal chain_error path. Recovery is structurally different — it shows
 * the model a concrete correct example rather than just saying "error".
 *
 * @param {string} raw
 * @returns {boolean}
 */
function isGarbledOutput(raw) {
  if (!raw) return false;
  return (
    /ACTION[A-Z]{2,}ETERS/i.test(raw) ||                    // ACTIONMETERS, ACTIONPARAMETERS, etc.
    /(?:ACTION[A-Z]*METERS[:\s]*){2,}/i.test(raw) ||        // repeated merged markers
    /^(?:\d+\.\s*)?ACTION[A-Z]*METERS/im.test(raw) ||       // numbered or bare ACTIONMETERS
    /^(ACTION[A-Z]*ETERS:[A-Z:]{5,})/i.test(raw.trim()) ||  // pure garbage stream
    /(?:THO[A-Z]*[:\s]*){3,}/i.test(raw) ||                 // excessive THO/THOUGHT repetition
    /^(THO[A-Z]*){3,}/im.test(raw) ||                       // pure repeated markers without colons
    /(?:THO[A-Z]*\s*){10,}/i.test(raw)                       // very long string of THO/THOUGHT tokens
  );
}


// ── Sanitize raw model reply ───────────────────────────────────────────────────
/** @param {string} raw @returns {string} */
const sanitizeRawReply = (raw) => {
  if (!raw) return '';
  return raw
    .replace(/(?:^|\n)(?:\d+\.)?\*?\*?\s*(ACTION|PARAMETERS|THOUGHT)\s*\*?\*?\s*(?:[:\s]+)?/gi,
      (_, p1) => `\n\n${p1.toUpperCase()}: `)
    .replace(/(?:^|\n)###\s*(ACTION|PARAMETERS|THOUGHT)[:\s]*/gi,
      (_, p1) => `\n\n${p1.toUpperCase()}: `)
    .replace(/ACTION[A-Z]*METERS[:\s]*([a-z_]*)/gi, '\n\nACTION: $1\n\nPARAMETERS: ')
    .replace(/ACTION[A-Z]*AMETERS[:\s]*([a-z_]*)/gi, '\n\nACTION: $1\n\nPARAMETERS: ')
    .replace(/ACTION[A-Z]*ETERS[:\s]*([a-z_]*)/gi, '\n\nACTION: $1\n\nPARAMETERS: ')
    .replace(/ACTIONPARAMETERS[:\s]*([a-z_]*)/gi, '\n\nACTION: $1\n\nPARAMETERS: ')
    .replace(/ACTIONSON[:\s]*([a-z_]*)/gi, '\n\nACTION: $1\n\nPARAMETERS: ')
    .replace(/THOUGHTACTION:[ \t]*([a-z_]*)/gi, 'THOUGHT: \n\nACTION: $1\n\nPARAMETERS: ')
    .replace(/THOUGHTPARAMETERS:[ \t]*([a-z_]*)/gi, 'THOUGHT: \n\nPARAMETERS: $1')
    .replace(/(?:ACTION[A-Z]*METERS[:\s]*){2,}/gi, '\n\nACTION: \n\nPARAMETERS: ')
    .replace(/(?:ACTION[:\s]*){2,}/gi, '\n\nACTION: ')
    .replace(/(?:PARAMETERS[:\s]*){2,}/gi, '\n\nPARAMETERS: ')
    .replace(/(?:THO[A-Z]*[:\s]*){2,}/gi, '\n\nTHOUGHT: ')
    .replace(/(?:THOUGHT){2,}/gi, '\n\nTHOUGHT: ')
    .replace(/(\n\nACTION:\s*\w+)\s*\n+(?=(?:```[a-z]*\s*)?\{)/gi, '$1\n\nPARAMETERS: ')
    .replace(/(?:^|\n)(?:THO[A-Z]*[:\s]*)+/gi, '\n\nTHOUGHT: ') // merge repeated variations
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}


// ── Parse reply → action/parameters/response ───────────────────────────────────
/**
 * @param {string}  rawText
 * @param {boolean} isReview
 * @param {boolean} fastMode
 * @returns {{ action:string, parameters?:object, response?:string, thought?:string, error?:string, isGarbled?:boolean }}
 */
function parseReply(rawText, isReview, fastMode) {
  // Early garbled detection — return special flag so runAgent can call pushFormatRecovery
  if (isGarbledOutput(rawText)) {
    return {
      action: 'chain_error',
      isGarbled: true,
      error: 'Merged or repeated markers detected (e.g. ACTIONARAMETERS). Format recovery required.',
      thought: 'Garbled output detected by isGarbledOutput().'
    };
  }

  const raw = sanitizeRawReply(rawText);
  if (!raw) return { action: 'finish', response: '' };

  const actionMatch = raw.match(/(?:^|\n)ACTION:\s*([a-z_][\w_]*)/i);
  const thoughtMatch = raw.match(/(?:^|\n)THOUGHT:\s*([\s\S]*?)(?=(?:\n(?:\d+\.)?\*?\*?\s*ACTION:)|\n(?:\d+\.)?\*?\*?\s*PARAMETERS:|(?:\n$|$))/i);

  const paramIdx = raw.search(/(?:^|\n)PARAMETERS:\s*(?:```json\s*)?\{/i);
  const paramSection = paramIdx !== -1 ? raw.slice(paramIdx) : raw;
  const json = extractJSON(paramSection);

  let rawAction = actionMatch ? actionMatch[1].toLowerCase() : null;
  let thought = thoughtMatch ? thoughtMatch[1].trim().replace(/^THOUGHT:\s*/i, '') : '';
  if (fastMode) thought = '';

  function getSafeAction(name) {
    if (!name) return null;
    const n = name.toLowerCase();
    if (n === 'finish' || n === 'final') return 'finish';
    if (TOOLS[n]) return n;
    return null;
  }

  let action = getSafeAction(rawAction);

  if (!action) {
    const legacy = raw.match(/<\|channel\|>\s*([\w]+)(?:\s+to=([\w:_]+))?/i);
    if (legacy) {
      const m = legacy[1].toLowerCase(), t = (legacy[2] || '').toLowerCase().replace(/^tool:/, '');
      if (m === 'final') action = 'finish';
      else if (t && TOOLS[t]) action = t;
      else if (TOOLS[m]) action = m;
    }
  }
  if (!action && json?.action) action = getSafeAction(json.action);

  if (action === 'finish') {
    let cleanResponse = raw;
    if (!json?.response && !json?.message) {
      cleanResponse = raw
        .replace(/ACTION:\s*[\w_]+/gi, '')
        .replace(/PARAMETERS:\s*\{[\s\S]*?\}?/gi, '')
        .replace(/THOUGHT:\s*[\s\S]*?(?=ACTION:|$)/gi, '')
        .replace(/\n\s*\n\s*\n+/g, '\n\n').trim() || raw;
    }

    let finRes = json ? (json.response || json.message || cleanResponse) : cleanResponse;
    // Strip wrapping markdown codeblocks if the ENTIRE response is wrapped in them
    if (typeof finRes === 'string') {
      finRes = finRes.replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    }

    return { action: 'finish', response: finRes, thought };
  }


  if (action) {
    if (!json && raw.toLowerCase().includes('parameters:')) {
      // Model formatting issue — keep it out of agent-errors.log.
      logInfo('parse_error', `Unparseable PARAMETERS for "${action}"`, { rawBuffer: '[omitted]' });
      return {
        action: 'chain_error',
        isGarbled: false,
        error: `ACTION "${action}" found but PARAMETERS block is not valid JSON. Use double-quoted keys.`,
        thought: thought || 'Unparseable parameters.'
      };
    }
    return { action, parameters: json || {}, thought };
  }

  if (json?.action || json?.tool) {
    const fb = getSafeAction(json.action || json.tool);
    if (fb) return { action: fb, parameters: json.parameters || json.params || json, thought: json.thought || '' };
  }

  if (raw.includes('```') && !isReview && !raw.includes('ACTION:')) {
    return {
      action: 'chain_error',
      isGarbled: false,
      error: 'Code block output without tool call. Use write_file or replace_in_file.',
      thought: thought || 'Orphaned code block.'
    };
  }

  if (json?.response || json?.message)
    return { action: 'finish', response: json.response || json.message, thought: json.thought || '' };

  return { action: 'finish', response: raw, thought: '' };
}





// ── Tool result summary ────────────────────────────────────────────────────────
/**
 * @param {string}  action
 * @param {object}  params
 * @param {object}  result
 * @param {boolean} isReview
 * @returns {string}
 */
function summariseResult(action, params, result, isReview, onStep) {
  if (result?.error) {
    let advice = 'Check parameters and try a different approach.';
    if (result.error.toLowerCase().includes('is a directory')) advice = 'Path is a DIRECTORY — provide a filename.';
    else if (result.error.toLowerCase().includes('not found')) advice = 'Path not found — use list_files to verify.';
    return `Error: ${result.error}\n\nADVICE: ${advice}`;
  }
  if (action === 'scaffold_project') {
    const files = result?.filesCreated || [], steps = result?.nextSteps || [];
    return `Scaffolding complete: ${params.name || ''}\n` +
      files.map(f => `  + ${f}`).join('\n') +
      (steps.length ? '\n\nNext: ' + steps.join(', ') : '');
  }
  if (action === 'bulk_write' || action === 'apply_blueprint') {
    const ok = (result?.results || []).filter(r => r.success).length;
    return `Bulk write: ${ok}/${(result?.results || []).length} files written.`;
  }
  if (action === 'write_file') {
    const isPlan = (params.path || '').endsWith('./agent_reports/developer_walkthrough.md');
    if (isPlan) {
      if (onStep) onStep({
        type: 'status',
        text: 'Continue to next file or FINISH with ./agent_reports/developer_walkthrough.md.'
      });
    }
    return `File written: ${params.path}\n\n` + (
      isReview ? 'Continue your review.' :
        isPlan ? 'DOCUMENTATION SAVED — YOU MAY NOW FINISH.' :
          'Continue to next file or FINISH with ./agent_reports/developer_walkthrough.md.'
    );
  }
  if (action === 'replace_in_file') return `Edit applied: ${params.path}\n\n${isReview ? 'Continue.' : 'Continue or FINISH.'}`;
  if (action === 'create_directory') return `Directory created: ${params.path}\n\nYou can now write files into it using write_file. Continue with implementation.`;
  if (action === 'read_file') return `File read: ${params.path}\n\n${isReview ? 'Analyze and advise.' : 'Analyze and implement.'}`;
  if (action === 'bulk_read') return `Bulk read: ${(result?.results || []).filter(r => r.success).length} files. ${isReview ? 'Analyze.' : 'Implement.'}`;
  if (action === 'list_files') {
    const list = result?.filesList || [];
    const count = list.length;
    const items = list.join('\n- ');
    return `COMPLETE RECURSIVE FILE LIST (${count} files found):\n- ${items}\n\n${isReview ? 'Read relevant files.' : 'Read and implement.'}`;
  }
  if (action === 'order_fix') return 'Fix order logged to agent-handoff.log.';
  if (action === 'request_review') return 'Review request logged. Now call finish.';
  return `Done. ${isReview ? 'Review complete.' : 'Verify files.'} FINISH if done.`;
}

/**
 * Redacts large / sensitive-ish fields before logging to agent-infos.log.
 * Prevents accidental multi-MB logs when tool parameters include file contents.
 *
 * @param {any} value
 * @param {number} [maxStrLen]
 * @returns {any}
 */
function redactForInfoLog(value, maxStrLen = 2000) {
  const seen = new WeakSet();

  const truncateString = (s) => {
    if (typeof s !== 'string') return s;
    if (s.length <= maxStrLen) return s;
    return s.slice(0, maxStrLen) + `\n… [truncated, total ${s.length} chars]`;
  };

  const walk = (v, keyHint = '') => {
    if (v == null) return v;
    if (typeof v === 'string') return truncateString(v);
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.slice(0, 50).map((x) => walk(x, keyHint));
    if (typeof v !== 'object') return String(v);

    if (seen.has(v)) return '[circular]';
    seen.add(v);

    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const lk = String(k).toLowerCase();
      const isNestedFiles = lk === 'files' && Array.isArray(val);

      if (isNestedFiles) {
        out[k] = val.slice(0, 50).map((f) => {
          if (!f || typeof f !== 'object') return walk(f, 'files');
          const fo = {};
          for (const [fk, fv] of Object.entries(f)) {
            fo[fk] = walk(fv, fk);
          }
          return fo;
        });
        continue;
      }

      out[k] = walk(val, k);
    }
    return out;
  };

  return walk(value);
}


// ═══════════════════════════════════════════════════════════════════════════════
// ReAct agent loop
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Main agent execution loop.
 *
 * BLOCK RESPONSE FLOW:
 *
 *   Normal step:
 *     [assistant: tool call] -> [user: tool result] -> [assistant: next action]
 *
 *   Nudge (guard triggered):
 *     [assistant: acknowledgement]   <- pushNudge() injects this
 *     [user: SYSTEM DIRECTIVE]       <- then this
 *     [assistant: corrected action]  <- model responds here
 *
 *   Format recovery (garbled output):
 *     [assistant: GARBLED — REJECTED]  <- last entry replaced
 *     [user: FORMAT RECOVERY block]    <- pushFormatRecovery() injects
 *     [assistant: valid action]        <- model re-anchors here
 *
 * @param {Object}      opts
 * @param {Array}       opts.messages
 * @param {string}      opts.workspaceDir
 * @param {Function}    opts.onStep
 * @param {AbortSignal} opts.signal
 * @param {string}     [opts.selectedModel]
 * @param {boolean}    [opts.fastMode]
 * @param {boolean}    [opts.autoRequestReview]
 * @returns {Promise<{success:boolean, response:string}>}
 */
async function runAgent(opts) {
  const { messages, workspaceDir, onStep, signal, fastMode = false, autoRequestReview = false, stack = 'default', selectedModel = null, unlimitedSteps = false, sessionId = null, projectRoot = null } = opts;

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const lastContent = lastUserMsg?.content || '';

  // Mode detection: last-one-wins via history scan
  let isReview = false, isAnalysis = false, isFollowAnalysis = false;
  let modeFound = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user' && typeof m.content === 'string') {
      if (!modeFound) {
        if (m.content.includes('[MODE: REVIEW]') || m.content.includes('[CONTINUE REVIEW]')) {
          isReview = true; modeFound = true;
        } else if (m.content.includes('[MODE: ANALYSIS]') || m.content.includes('[CONTINUE ANALYSIS]')) {
          isAnalysis = true; modeFound = true;
        } else if (m.content.includes('[MODE: GENERATE]') || m.content.includes('[MODE: DEVELOPER]')) {
          modeFound = true; // explicitly switching to developer mode
        }
      }
      if (m.content.includes('[FOLLOW ANALYSIS]')) isFollowAnalysis = true;
    }
  }

  if (isFollowAnalysis) console.log(`[DevAgent] FOLLOW ANALYSIS mode active (detected in history)`);

  const mode = isReview ? 'review' : (isAnalysis ? 'analysis' : 'developer');

  // Target folder resolution: scan history (from latest to oldest) for [TARGET FOLDER: XXX]
  let effectiveWorkspaceDir = workspaceDir, targetFolderName = '';

  console.log(`[DevAgent] 🚀 STARTING AGENT | Mode: ${mode} | Workspace: ${workspaceDir}`);
  if (onStep) onStep({ type: 'status', text: `🚀 Initializing Agent in: ${workspaceDir}` });
  let targetMatch = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user' && typeof m.content === 'string') {
      targetMatch = m.content.match(/\[TARGET FOLDER:\s*([^\]]+)\]/);
      if (targetMatch) break;
    }
  }

  if (targetMatch) {
    const tp = targetMatch[1].trim();
    const res = path.isAbsolute(tp) ? tp : path.resolve(workspaceDir, tp.replace(/^[\/\\]+/, ''));
    if (tp && tp !== '.') {
      effectiveWorkspaceDir = res; targetFolderName = tp;
      console.log(`[DevAgent] TARGET FOLDER (from history): "${tp}"`);
      if (onStep) onStep({ type: 'status', text: `📍 Target Folder Pinned: ${tp}` });
    }
  }

  // ── Analysis mode: auto-detect project subfolder if no target pinned ──────
  // When the user launches Analysis without pinning a folder, list_files(".")
  // would scan workspace/ root and save the report there instead of the project.
  // ── Auto-detect project subfolder if no target pinned ───────────────────
  // If the user hasn't explicitly clicked a folder, we try to find the "active"
  // project. We look for folders containing package.json or an analysis report.
  if (!targetFolderName) {
    try {
      const PROJECT_SIGNALS = ['package.json', 'server.js', 'app.js', 'index.html', 'index.js'];
      const entries = fs.readdirSync(workspaceDir, { withFileTypes: true });
      const SKIP_DIRS = new Set(['.git', 'node_modules', '.cache', 'dist', 'build', 'coverage']);

      let candidate = null;
      for (const entry of entries) {
        if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
        const candidateDir = path.join(workspaceDir, entry.name);

        // Priority 1: Has a System Analysis report
        if (fs.existsSync(path.join(candidateDir, './agent_reports/system_analysis_walkthrough.md'))) {
          candidate = entry.name;
          console.log(`[DevAgent] AUTO-DETECT: Found Analysis Report in "${entry.name}". Selecting as target.`);
          effectiveWorkspaceDir = candidateDir;
          analysisPath = path.join(candidateDir, './agent_reports/system_analysis_walkthrough.md');
          break;
        }

        // Priority 2: Has standard project signals (if no P1 found yet)
        if (!candidate) {
          const hasSignal = PROJECT_SIGNALS.some(sig => fs.existsSync(path.join(candidateDir, sig)));
          if (hasSignal) candidate = entry.name;
        }
      }

      if (candidate) {
        effectiveWorkspaceDir = path.join(workspaceDir, candidate);
        targetFolderName = candidate;
        console.log(`[DevAgent] AUTO-DETECT: Selected project folder: "${candidate}"`);
      }
    } catch (e) {
      console.warn('[DevAgent] Auto-detect failed:', e.message);
    }
  }

  // Model resolution
  let modelConfig = {};
  try {
    const mp = path.join(__dirname, 'models.json');
    if (fs.existsSync(mp)) modelConfig = JSON.parse(fs.readFileSync(mp, 'utf-8')).config || {};
  } catch (e) { console.warn('[DevAgent] models.json:', e.message); }

  const resolvedModel = (isReview ? modelConfig.review : (isAnalysis ? (modelConfig.analysis || modelConfig.review) : modelConfig.dev))
    || selectedModel || process.env.LM_STUDIO_MODEL || modelConfig.global || 'openai/gpt-oss-20b';

  const BASE_MAX_STEPS = Number(process.env.AGENT_MAX_STEPS) || 50;
  let MAX_STEPS = BASE_MAX_STEPS;
  if (isAnalysis) MAX_STEPS = Math.max(BASE_MAX_STEPS, 200);
  else if (mode === 'developer') MAX_STEPS = Math.max(BASE_MAX_STEPS, 100);
  if (unlimitedSteps) MAX_STEPS = 10000; // Virtually unlimited safety cap
  const MAX_REVIEW_LOOPS = Number(process.env.AGENT_MAX_LOOPS) || 3;

  console.log(`[DevAgent] Model: "${resolvedModel}" | ${mode.toUpperCase()} | fast:${fastMode}`);
  // Fire-and-forget info log (logger is internally try/catch guarded).
  logInfo('agent_start', 'Agent run started', {
    model: resolvedModel,
    mode: mode,
    fastMode: !!fastMode,
    workspaceDir,
    targetFolder: targetFolderName || '',
    maxSteps: MAX_STEPS,
    maxReviewLoops: MAX_REVIEW_LOOPS
  });

  const systemPrompt = getSystemPrompt(mode, targetFolderName, fastMode, autoRequestReview, stack, isFollowAnalysis);

  let lastScaffoldedName = '';
  let step = 0, listFilesCount = 0, lastActionSig = null, lastActionRepeat = 0;
  const recentActions = []; // Ring buffer of last 6 actions for cycle detection

  // ── Escape counters — all nudge branches have hard abort limits ────────────
  let chainErrorCount = 0;
  let planNudgeCount = 0;
  let analysisNudgeCount = 0;
  let reviewNudgeCount = 0;
  let reviewRequestNudgeCount = 0;
  let prematureFinishCount = 0;
  let followReviewNudgeCount = 0;
  let reviewWriteBlockCount = 0;
  let formatRecoveryCount = 0;  // NEW: tracks pushFormatRecovery() calls

  // ── Persistent state — survives history pruning ────────────────────────────
  const agentState = {
    reportSaved: false,
    configRead: false,
    hallucinationVerified: false,
    reviewRequested: false,
    codeModified: false,
    planWritten: false,
    reviewLoopCount: 0,
    replaceFailCounts: {}, // per-path replace_in_file failure counters
    discoveredFiles: [], // list of absolute/relative paths from list_files
  };

  // ── LangChain Memory Initialization ─────────────────────────────────────────
  const agentMemory = createAgentMemory({
    mode,
    fastMode,
    sessionId: sessionId || null,
  });

  // Set system prompt (lives outside the sliding window)
  agentMemory.setSystemPrompt(systemPrompt);

  // Load incoming messages into LangChain memory.
  // Filter out internal nudge/recovery artifacts that were saved to session and
  // echoed back by the client — these accumulate and cause the model to echo them.
  const NUDGE_ACK_PATTERNS = [
    /^\[SYSTEM:\s*Correction received/i,
    /^\[GARBLED OUTPUT — REJECTED BY SYSTEM\]/i,
    /^\[FORMAT RECOVERY\]/i,
    // Legacy ack that used to be the pushNudge default:
    /^THOUGHT:\s*I need to follow the mandatory instruction/i,
  ];
  const NUDGE_USER_PATTERNS = [
    /^\[SYSTEM DIRECTIVE\]/i,
    /^\[FORMAT RECOVERY\]/i,
  ];
  let skippedNudges = 0;
  for (const m of messages) {
    const content = typeof m.content === 'string' ? m.content : String(m.content);
    // Skip internal nudge/recovery pairs saved from previous runs
    if (m.role === 'assistant' && NUDGE_ACK_PATTERNS.some(re => re.test(content.trimStart()))) {
      skippedNudges++;
      continue;
    }
    if (m.role === 'user' && NUDGE_USER_PATTERNS.some(re => re.test(content.trimStart()))) {
      skippedNudges++;
      continue;
    }
    if (m.role === 'assistant') {
      await agentMemory.addAIMessage(content);
    } else if (m.role === 'user') {
      await agentMemory.addUserMessage(content);
    }
    // System messages from client are added as directives
    if (m.role === 'system') {
      await agentMemory.addSystemDirective(content);
    }
  }
  if (skippedNudges > 0) {
    console.warn(`[DevAgent] Filtered ${skippedNudges} stale nudge/recovery messages from incoming history.`);
    logInfo('history_clean', `Stripped ${skippedNudges} nudge artifacts from incoming history`, { skippedNudges });
  }

  console.log(`[DevAgent] LangChain AgentMemory initialized (mode: ${mode}, window: ${agentMemory.metadata.windowSize})`);

  // Build history from memory for backward compatibility
  let history = await agentMemory.toHistory();

  // ── POWERFUL WORKFLOW: Langchain Action Roadmap ─────────────────────────
  const isCreationPrompt = /create|new|scaffold|setup|generate/i.test(lastContent);
  const isResumingAnalysis = isAnalysis && fs.existsSync(path.resolve(effectiveWorkspaceDir, './agent_reports/system_analysis_walkthrough.md'));
  const skipPlanner = isAnalysis || lastContent.includes('[FOLLOW REVIEW]') || lastContent.includes('[FOLLOW ANALYSIS]') || isResumingAnalysis;

  if (!isReview && !skipPlanner && (messages.length <= 2 || isCreationPrompt)) {
    try {
      if (onStep) onStep({ type: 'status', text: 'Langchain: Generating Action Roadmap...' });
      const planner = new LangchainPlanner(resolvedModel);
      const roadmap = await planner.plan(lastContent, "Workspace: " + (targetFolderName || 'root'));

      const roadmapContent = `[ACTION ROADMAP]\nThis roadmap was generated by the Langchain Planner. Follow it to ensure architectural integrity:\n\n${roadmap}`;
      await agentMemory.addSystemDirective(roadmapContent);
      history = await agentMemory.toHistory();

      console.log(`[DevAgent] Roadmap generated and injected.`);
      if (onStep) onStep({ type: 'roadmap', content: roadmap });
      if (onStep) onStep({ type: 'status', text: 'Roadmap ready. Starting implementation...' });
    } catch (err) {
      console.error('[DevAgent] Planner failed:', err.message);
    }
  }

  // ── FOLLOW ANALYSIS Injection ───────────────────────────────────────────
  // We only inject if isFollowAnalysis is active AND it hasn't been injected in the history yet.
  const alreadyInjected = messages.some(m => typeof m.content === 'string' && m.content.includes('[SYSTEM DIRECTIVE: ARCHITECTURAL ADHERENCE]'));

  if (isFollowAnalysis && !isReview && !alreadyInjected) {
    try {
      let analysisPath = path.resolve(effectiveWorkspaceDir, './agent_reports/system_analysis_walkthrough.md');

      // Traverse UP the directory tree if not found in the exact target folder
      let searchDir = effectiveWorkspaceDir;
      for (let i = 0; i < 5; i++) {
        const candidate = path.resolve(searchDir, './agent_reports/system_analysis_walkthrough.md');
        if (fs.existsSync(candidate)) {
          analysisPath = candidate;
          break;
        }
        const parentDir = path.dirname(searchDir);
        if (parentDir === searchDir) break; // reached root
        searchDir = parentDir;
      }

      // Final fallback to server workspace root just in case
      if (!fs.existsSync(analysisPath)) {
        analysisPath = path.resolve(workspaceDir, './agent_reports/system_analysis_walkthrough.md');
      }

      if (fs.existsSync(analysisPath)) {
        const report = fs.readFileSync(analysisPath, 'utf-8');
        const workflowTag = isCreationPrompt ? '[WORKFLOW: CREATE]' : '[WORKFLOW: UPDATE]';
        const analysisDirective = `[SYSTEM DIRECTIVE: ARCHITECTURAL ADHERENCE]
${workflowTag} [FOLLOW ANALYSIS]
You MUST follow the architecture and module map defined in this System Analysis report.
DO NOT use scaffold_project to generate boilerplate; implement the directories and files sequentially using write_file.

REPORT CONTENT:
${report}`;

        await agentMemory.addSystemDirective(analysisDirective);
        history = await agentMemory.toHistory();
        console.log(`[DevAgent] System Analysis Report injected from: ${analysisPath}`);
        logInfo('injection', 'System Analysis Report injected', { path: analysisPath, workflow: workflowTag });
      } else {
        console.warn(`[DevAgent] Analysis report requested but NOT FOUND in tree starting from: ${effectiveWorkspaceDir}`);
        logInfo('injection_warning', 'Analysis report NOT FOUND', { startDir: effectiveWorkspaceDir });
      }
    } catch (e) {
      console.warn('[DevAgent] Failed to inject analysis report:', e.message);
      logError('injection_error', e.message, { startDir: effectiveWorkspaceDir });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  while (step < MAX_STEPS) {
    step++;
    const memCount = await agentMemory.getMessageCount();
    console.log(`\n[DevAgent] STEP ${step} | Memory: ${memCount} messages (LangChain BufferWindowMemory)`);

    // ── LangChain Memory Windowing ──────────────────────────────────────────
    // BufferWindowMemory automatically handles context pruning via its k parameter.
    // We rebuild the history from the windowed view on each step.
    history = await agentMemory.getWindowedHistory();

    if (signal?.aborted) throw new Error('Agent stopped by user.');

    // ── LM Studio API call (LangChain memory-aware) ───────────────────────────
    let rawText;
    try {
      let stepFull = '', sentLen = 0;
      rawText = await callLangchain(history, (chunk) => {
        if (!onStep) return;
        stepFull += chunk;
        let clean = stepFull
          .replace(/ACTION:\s*[\w_]*/gi, '')
          .replace(/PARAMETERS:\s*\{[\s\S]*?\}/gi, '')
          .replace(/PARAMETERS:\s*\{[\s\S]*/gi, '');
        if (fastMode) {
          clean = clean.replace(/THOUGHT[:\s]*[\s\S]*?(?=ACTION:|$)/gi, '');
          clean = clean.replace(/THO[A-Z]*[:\s]*/gi, ''); // extra aggressive fix for markers without colon
        }
        const delta = clean.slice(sentLen);
        if (delta.length > 0) { onStep({ type: 'chunk', content: delta }); sentLen = clean.length; }
        const isInternal = stepFull.toLowerCase().includes('action:') ||
          stepFull.toLowerCase().includes('parameters:') || stepFull.toLowerCase().includes('thought:');
        if (isInternal && delta.length === 0)
          onStep({ type: 'status', text: `Agent is ${stepFull.toLowerCase().includes('action:') ? 'acting' : 'thinking'}...` });
      }, signal, resolvedModel, { agentMemory, fastMode });
    } catch (apiErr) {
      const msg = `API Error: ${apiErr.message}${apiErr.response?.data ? ' - ' + JSON.stringify(apiErr.response.data) : ''}`;
      console.error('[DevAgent]', msg);
      if (onStep) onStep({ type: 'error', message: msg });
      throw new Error(msg);
    }

    // AI message is auto-saved by LangchainWorkflow when agentMemory is attached
    // Still push to local history for backward compatibility within this loop iteration
    history.push({ role: 'assistant', content: rawText });
    const parsed = parseReply(rawText, isReview, fastMode);
    let action = (parsed.action || '').toLowerCase();

    console.log(`[DevAgent] STEP ${step} -> ${action || 'none'}`);
    console.log(rawText.length > 500 ? rawText.slice(0, 500) + '...' : rawText);

    // ── Log full LLM response to agent-infos.log ──────────────────────────────
    logInfo('llm_response', `[step ${step}] LLM raw output (${rawText.length} chars)`, {
      step, action: action || 'none', _text: rawText
    });

    if (parsed.thought && onStep) onStep({ type: 'thought', content: parsed.thought });

    logInfo('action', `[step ${step}] Parsed action: ${action || 'none'}`, {
      step,
      action: action || 'none',
      thought: parsed.thought || undefined,
      parameters: redactForInfoLog(parsed.parameters, 2000),
      isGarbled: parsed.isGarbled,
      error: parsed.error
    });

    // ── No action ────────────────────────────────────────────────────────────
    if (!action) {
      // Not a system failure — model produced an answer without an ACTION.
      // Keep it out of agent-errors.log so that file reflects real runtime/tool failures.
      logInfo('parse_warning', 'Model output had no ACTION', { step, rawText: '[omitted]' });
      if (onStep) onStep({ type: 'response', content: rawText });
      return { success: true, response: rawText, history };
    }

    // ── Duplicate action guard ───────────────────────────────────────────────
    const normP = (p) => {
      const c = JSON.parse(JSON.stringify(p || {}));
      ['content', 'replace', 'search', 'text', 'blueprint'].forEach(k => {
        if (typeof c[k] === 'string') c[k] = c[k].replace(/\s+/g, '').slice(0, 5000);
      });
      return JSON.stringify(c);
    };
    const sig = action + '|' + normP(parsed.parameters);
    if (sig === lastActionSig && action !== 'chain_error') {
      lastActionRepeat++;
      console.warn(`[DevAgent] Duplicate (${lastActionRepeat}/3): ${action}`);
      if (lastActionRepeat >= 3) {
        const msg = `Loop: "${action}" repeated 3x identically.`;
        // Guardrail event — don't write to agent-errors.log.
        logInfo('loop_guard', msg, { step, action });
        if (onStep) onStep({ type: 'error', message: msg });
        // Use pushNudge for loop correction — smoother than bare error push
        await agentMemory.pushNudge(
          `You have called "${action}" 3 times with identical parameters.\n\n` +
          `1. STOP repeating this action.\n` +
          `2. Either provide DIFFERENT parameters, or call ACTION: finish if the task is done.`,
          `THOUGHT: I have been repeating the same action. I must change my approach.`
        );
        if (lastActionRepeat >= 4) return { success: false, response: msg, history };
        continue;
      }
    } else { lastActionSig = sig; lastActionRepeat = 0; }

    // ── Alternating-cycle guard (A→B→A→B pattern) ────────────────────────────
    recentActions.push(action);
    if (recentActions.length > 6) recentActions.shift();
    if (recentActions.length >= 6) {
      // Detect A→B→A→B→A→B (2-step cycle repeated 3 times)
      const [a1, b1, a2, b2, a3, b3] = recentActions;
      if (a1 === a2 && a2 === a3 && b1 === b2 && b2 === b3 && a1 !== b1) {
        const cycleMsg = `Cycle detected: "${a1}" → "${b1}" repeated 3 times. Aborting loop.`;
        logInfo('loop_guard', cycleMsg, { step, cycle: `${a1}→${b1}` });
        if (onStep) onStep({ type: 'error', message: cycleMsg });
        await agentMemory.pushNudge(
          `You are stuck in a "${a1}" → "${b1}" loop (repeated 3 times).\n\n` +
          `STOP this pattern immediately.\n` +
          `If directories are needed, use create_directory once then write_file.\n` +
          `If files are missing, use write_file to create them directly.\n` +
          `Move forward with implementation — do not keep scanning or creating directories.`,
          `THOUGHT: I am cycling between ${a1} and ${b1} repeatedly. I must break this pattern and make concrete progress.`
        );
        recentActions.length = 0; // reset after nudge
        if (step > 10) return { success: false, response: cycleMsg, history };
        continue;
      }
    }

    // ── No-progress guard ────────────────────────────────────────────────────
    if (['list_files', 'read_file', 'bulk_read'].includes(action)) {
      listFilesCount++;
      if (listFilesCount >= 3 && step > 5) {
        console.warn('[DevAgent] No-progress loop.');
        await agentMemory.pushNudge(
          `You have read/listed files ${listFilesCount} times with no writes.\n\n` +
          `1. STOP scanning.\n` +
          `2. Use ACTION: write_file NOW to implement the required code.`,
          `THOUGHT: I have been scanning without writing. I must start implementing.`
        );
        if (onStep) onStep({ type: 'status', text: 'Nudging: must write files now.' });
        logInfo('nudge', 'No-progress guard triggered', { step, action, listFilesCount });
        continue;
      }
    } else if (['write_file', 'replace_in_file', 'bulk_write', 'apply_blueprint', 'scaffold_project', 'create_directory'].includes(action)) {
      listFilesCount = 0;
    }

    // ── Chain error / Format recovery ────────────────────────────────────────
    if (action === 'chain_error') {
      chainErrorCount++;
      console.warn(`[DevAgent] chain_error (${chainErrorCount}/3) | garbled:${parsed.isGarbled}`);

      if (chainErrorCount >= 3) {
        const msg = `Aborted: malformed output ${chainErrorCount}x. ${parsed.error}`;
        console.error('[DevAgent] chain_error limit. Aborting.');
        if (onStep) onStep({ type: 'error', message: msg });
        return { success: false, response: msg, history };
      }

      if (parsed.isGarbled) {
        // ── BLOCK RESPONSE: Format Recovery ─────────────────────────────────
        // Garbled output (ACTIONARAMETERS etc.) — show the model a correct example
        // instead of just injecting a bare error message which makes it worse.
        await agentMemory.pushFormatRecovery(rawText, parsed.error, isReview ? 'write_file' : 'write_file');
        logInfo('format_recovery', 'Injected format recovery block', { step, error: parsed.error });
        if (onStep) onStep({ type: 'status', text: 'Format recovery: re-anchoring model output format...' });
      } else {
        // Non-garbled chain error (orphaned code block, bad JSON) — use nudge
        await agentMemory.pushNudge(
          `Your response had a format error: ${parsed.error}\n\n` +
          `1. Do NOT output raw code blocks.\n` +
          `2. Use ACTION: write_file with PARAMETERS: { "path": "...", "content": "..." }`,
          `THOUGHT: My last response had a format error. I will use the correct tool call format.`
        );
        logInfo('nudge', 'Injected nudge due to format error', { step, error: parsed.error });
        if (onStep) onStep({ type: 'error', message: parsed.error });
      }
      continue;
    }

    // ── Finish ───────────────────────────────────────────────────────────────
    if (action === 'finish') {

      // Sync flags from history on first finish (warm-start safety)
      if (!agentState.codeModified) {
        agentState.codeModified = history.some(m => {
          const c = (m.content || '').toLowerCase();
          return m.role === 'user' && c.includes('tool result') &&
            ['write_file', 'replace_in_file', 'bulk_write', 'apply_blueprint', 'scaffold_project'].some(t => c.includes(t)) &&
            !c.includes('developer_walkthrough.md');
        });
      }
      if (!agentState.planWritten) {
        agentState.planWritten = history.some(m => {
          const c = (m.content || '').toLowerCase();
          return m.role === 'user' && c.includes('tool result') &&
            ['write_file', 'bulk_write', 'scaffold_project'].some(t => c.includes(t)) &&
            (c.includes('developer_walkthrough.md') || c.includes('plan.md'));
        });
      }

      const isUpdateTask = history.some(m => {
        const c = (m.content || '').toLowerCase();
        return m.role === 'user' &&
          ['generate', 'update', 'modify', 'fix', 'add', '[workflow: update]'].some(kw => c.includes(kw));
      });

      // ── Premature finish guard ─────────────────────────────────────────────
      if (isUpdateTask && (!agentState.codeModified || !agentState.planWritten) && step < MAX_STEPS && !isReview) {
        prematureFinishCount++;
        console.warn(`[DevAgent] Premature finish (${prematureFinishCount}/3)`);
        if (prematureFinishCount < 3) {
          const what = !agentState.codeModified ? 'write source code files' : 'write ./agent_reports/developer_walkthrough.md';
          if (planNudgeCount < 3) {
            console.warn(`[DevAgent] ${what} nudge (${planNudgeCount}/3)`);
          }
          await agentMemory.pushNudge(
            `You called finish too early.\n\n` +
            `1. You still need to: ${what}.\n` +
            `2. Do that NOW, then call finish.`,
            `THOUGHT: I tried to finish before completing all required steps. I must ${what} first.`
          );
          if (onStep) onStep({ type: 'status', text: `Nudging: must ${what} before finishing.` });
          continue;
        }
        console.warn('[DevAgent] Premature finish limit — allowing through.');
      }

      // ── Follow-review guard ───────────────────────────────────────────────
      const isFollowReview = history.some(m => (m.content || '').includes('[CODE: NOT OK]'));
      if (!isReview && isFollowReview && (!history.some(m => (m.content || '').toLowerCase().includes('read_file') && m.content.toLowerCase().includes('./agent_reports/reviewer_walkthrough.md')) || !agentState.codeModified)) {
        followReviewNudgeCount++;
        console.warn(`[DevAgent] Follow-review nudge (${followReviewNudgeCount}/3)`);
        if (followReviewNudgeCount >= 3) return { success: false, response: 'Aborted: refused to address [CODE: NOT OK] after 3 nudges.', history };
        await agentMemory.pushNudge(
          `The reviewer issued [CODE: NOT OK].\n\n` +
          `1. Call ACTION: read_file with reviewer_walkthrough.md\n` +
          `2. Fix every issue listed.\n` +
          `3. Only then call finish.`,
          `THOUGHT: The reviewer rejected my code. I must read the report and fix the issues.`
        );
        if (onStep) onStep({ type: 'status', text: 'Nudging: must read review report and fix code.' });
        continue;
      }

      // ── Auto re-request review loops after fixing [CODE: NOT OK] ───────────
      // If we are in DEV mode, there is a prior [CODE: NOT OK], and we've now
      // both read the review report and modified code, automatically prepare
      // to request another review, up to MAX_REVIEW_LOOPS.
      if (!isReview && isFollowReview && autoRequestReview) {
        if (agentState.reviewLoopCount >= MAX_REVIEW_LOOPS) {
          console.warn('[DevAgent] Max review loops reached — allowing finish without new request_review.');
        } else {
          // Clear the flag so the auto review-request guard below will fire
          // again and nudge the model to call request_review before finishing.
          agentState.reviewRequested = false;
          agentState.reviewLoopCount += 1;
          reviewRequestNudgeCount = 0;
          console.log(`[DevAgent] Preparing review loop #${agentState.reviewLoopCount}/${MAX_REVIEW_LOOPS}`);
        }
      }

      // ── Review mode guards ────────────────────────────────────────────────
      if (isReview) {

        // Report-saved check — agentState is the primary source, history scan as fallback
        if (!agentState.reportSaved) {
          agentState.reportSaved = history.some(m => {
            if (m.role !== 'user') return false;
            const c = (m.content || '').toLowerCase();
            return c.includes('./agent_reports/reviewer_walkthrough.md') && (
              c.includes('file written') || c.includes('file updated') || c.includes('tool result (write_file)')
            );
          });
        }

        if (!agentState.reportSaved) {
          reviewNudgeCount++;
          console.warn(`[DevAgent] Report missing (${reviewNudgeCount}/3)`);
          if (reviewNudgeCount >= 3) return { success: false, response: 'Review aborted: refused to write report after 3 nudges.', history };
          // ── BLOCK RESPONSE: smooth nudge pair ───────────────────────────
          await agentMemory.pushNudge(
            `You must write the review report before finishing.\n\n` +
            `1. ACTION: write_file\n` +
            `2. PARAMETERS: { "path": "./agent_reports/reviewer_walkthrough.md", "content": "## AGENT Reasoning\\n...\\n## Summary\\n..." }\n\n` +
            `Do this NOW. Include your full audit findings.`,
            `THOUGHT: I need to save my review findings to ./agent_reports/reviewer_walkthrough.md before I can finish.`
          );
          if (onStep) onStep({ type: 'status', text: 'Nudging: must write review report first.' });
          continue;
        }

        // Verdict check
        const verdict = (parsed.response || '').toUpperCase();
        if (!verdict.includes('[CODE: OK]') && !verdict.includes('[CODE: NOT OK]')) {
          reviewNudgeCount++;
          console.warn(`[DevAgent] Verdict missing (${reviewNudgeCount}/3)`);
          if (reviewNudgeCount >= 3) return { success: false, response: 'Review aborted: refused to include verdict after 3 nudges.', history };
          // ── BLOCK RESPONSE: smooth nudge pair ───────────────────────────
          await agentMemory.pushNudge(
            `Your finish response is missing the required verdict.\n\n` +
            `1. ACTION: finish\n` +
            `2. PARAMETERS: { "response": "...your summary... [CODE: OK]" }\n\n` +
            `You MUST include exactly [CODE: OK] or [CODE: NOT OK] at the end of your response.`,
            `THOUGHT: My finish response was missing the [CODE: OK] or [CODE: NOT OK] verdict. I will include it now.`
          );
          if (onStep) onStep({ type: 'status', text: 'Nudging: verdict missing in finish response.' });
          continue;
        }
      }

      // ── Analysis mode guards ──────────────────────────────────────────────
      if (isAnalysis) {
        if (!agentState.configRead) {
          // Double check history
          agentState.configRead = history.some(m => {
            if (m.role !== 'user' || !m.content) return false;
            const c = m.content.toLowerCase();
            return (c.includes('package.json') || c.includes('requirements.txt') || c.includes('pom.xml')) &&
              (c.includes('tool result (read_file)') || c.includes('tool result (bulk_read)'));
          });
        }

        if (!agentState.configRead) {
          await agentMemory.pushNudge(
            `You MUST explicitly read the project's configuration (e.g., package.json) before finishing the analysis.\n\n` +
            `1. ACTION: read_file\n` +
            `2. PARAMETERS: { "path": "package.json" }\n\n` +
            `This is required to ensure 1:1 accurate Technology Stack documentation. Do not guess libraries.`,
            `THOUGHT: I need to read the configuration file to ensure I don't hallucinate the technology stack.`
          );
          if (onStep) onStep({ type: 'status', text: 'Nudging: must read package.json first.' });
          continue;
        }

        if (!agentState.reportSaved) {
          // Correct check: Find the latest assistant message writing the report and verify its content
          for (let i = history.length - 1; i >= 0; i--) {
            const m = history[i];
            if (m.role === 'assistant' && m.content) {
              const cUpper = m.content.toUpperCase();
              if (cUpper.includes('WRITE_FILE') && cUpper.includes('SYSTEM_ANALYSIS_WALKTHROUGH.MD')) {
                const hasTree = cUpper.includes('TREE VIEW');
                const hasTech = cUpper.includes('TECHNOLOGY STACK');
                const hasConventions = cUpper.includes('CONVENTIONS');
                const hasBlueprint = cUpper.includes('BLUEPRINT');
                const hasTotalAudit = cUpper.includes('TOTAL FILE AUDIT');

                // We do not enforce 'MODELS' here to ensure compatibility with HTML/CSS stacks
                if (hasTree && hasTech && hasConventions && hasBlueprint && hasTotalAudit) {
                  agentState.reportSaved = true;
                  break;
                }
              }
            }
            if (agentState.reportSaved) break;
          }
        }

        if (!agentState.reportSaved) {
          analysisNudgeCount++;
          console.warn(`[DevAgent] Analysis report incomplete/missing (${analysisNudgeCount}/3)`);
          if (analysisNudgeCount >= 3) return { success: false, response: 'Analysis aborted: refused to provide forensic-level report after 3 nudges.', history };

          await agentMemory.pushNudge(
            `Your analysis report is incomplete or missing mandatory forensic sections.\n\n` +
            `You MUST include these EXACT headers with deep detail (adapted to your project type):\n` +
            `1. ## 🌳 PROJECT STRUCTURE (TREE VIEW) (Full visual map)\n` +
            `2. ## 🏷️ TECHNOLOGY STACK (Exhaustive numbered list of all package.json dependencies with emoji explanations)\n` +
            `3. ## 📐 CODING STANDARDS & CONVENTIONS (Naming rules, patterns)\n` +
            `4. ## 📦 MODULE MAP & TOTAL FILE AUDIT (Deep logic for every file)\n` +
            `5. ## 📑 CLONING BLUEPRINT (Step-by-step logic for system recreation)\n\n` +
            `Do not skip these. They are mandatory for cloning potential.`,
            `THOUGHT: I must provide the exhaustive dependencies, conventions, total file audit, and cloning blueprint in the report before I can finish.`
          );
          if (onStep) onStep({ type: 'status', text: 'Nudging: forensic report detail missing.' });
          continue;
        }
        if (!agentState.hallucinationVerified && agentState.reportSaved) {
          try {
            const guard = new LangchainAnalysisGuard(resolvedModel);
            const pkgPath = path.resolve(effectiveWorkspaceDir, 'package.json');
            let pkgJson = "";
            if (fs.existsSync(pkgPath)) {
              pkgJson = fs.readFileSync(pkgPath, 'utf8');
            }

            if (onStep) onStep({ type: 'status', text: 'Forensic Guard: Auditing report for hallucinations...' });

            // Get report content: Prioritize the actual file on disk, fallback to history
            let reportContent = "";
            const reportPath = path.resolve(workspaceDir, './agent_reports/system_analysis_walkthrough.md');
            if (fs.existsSync(reportPath)) {
              reportContent = fs.readFileSync(reportPath, 'utf8');

              // REPAIR: Many models escape newlines as \\n when writing to files in JSON.
              // Use a ratio check: if escaped \n count exceeds real \n count, the file is
              // majority-escaped and needs repair — even if some real newlines exist.
              const escapedNCount = (reportContent.match(/\\n/g) || []).length;
              const realNCount = (reportContent.match(/\n/g) || []).length;
              if (escapedNCount > 0 && escapedNCount > realNCount) {
                console.log(`[DevAgent] 🛠️ REPAIRING: Escaped newlines detected (${escapedNCount} escaped vs ${realNCount} real).`);
                reportContent = reportContent.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '');
                fs.writeFileSync(reportPath, reportContent);
                if (onStep) onStep({ type: 'status', text: 'Fixed: formatting (escaped newlines repaired).' });
              }
            } else {
              for (let i = history.length - 1; i >= 0; i--) {
                const m = history[i];
                if (m.role === 'assistant' && (m.content || '').toUpperCase().includes('SYSTEM_ANALYSIS_WALKTHROUGH.MD')) {
                  reportContent = m.content;
                  break;
                }
              }
            }

            if (!reportContent) {
              console.warn('[DevAgent] Forensic Guard: Could not find report content to verify.');
              agentState.hallucinationVerified = true;
            } else {
              // Always verify structure, verify dependencies only if pkgJson exists
              const structVerification = await guard.verifyStructure(reportContent, agentState.discoveredFiles);
              const verification = pkgJson ? await guard.verifyDependencies(reportContent, pkgJson) : "VERIFIED";

              console.log(`[DevAgent] Structure Audit: ${structVerification}`);
              console.log(`[DevAgent] Dependency Audit: ${verification}`);

              const hasDependencyError = verification.includes('HALLUCINATION DETECTED') || verification.includes('OMISSION DETECTED');
              const hasStructureError = structVerification.includes('GHOST FOLDER DETECTED');

              if (hasDependencyError || hasStructureError) {
                let directive = "";
                if (hasDependencyError) directive += `TECH STACK ERROR: ${verification}\n`;
                if (hasStructureError) directive += `STRUCTURE ERROR: ${structVerification}\n`;

                console.warn(`[DevAgent] Forensic Audit Failed: ${directive.trim()}`);

                await agentMemory.pushNudge(
                  `FORENSIC AUDIT FAILED:\n${directive}\n` +
                  `1. REMOVE all "Ghost Folders" or "Ghost Files" from your report. Only include what physically exists.\n` +
                  `2. ENSURE the Technology Stack is a 1:1 match with package.json (no extra, no missing).\n` +
                  `3. UPDATE ./agent_reports/system_analysis_walkthrough.md with the corrected, real-world data immediately via write_file.`,
                  `THOUGHT: My report failed the forensic guard. I must remove hallucinated folders/libraries and use the real data from my scan.`
                );

                agentState.reportSaved = false; // Force re-save
                if (onStep) onStep({ type: 'status', text: 'Audit failed: Hallucinations detected.' });
                continue;
              } else {
                agentState.hallucinationVerified = true;
                if (onStep) onStep({ type: 'status', text: 'Forensic Guard: Report Verified.' });
              }
            }
          } catch (err) {
            console.error('[DevAgent] Hallucination Guard failed:', err.message);
            agentState.hallucinationVerified = true; // Don't block on tool failure
          }
        }

        const verdict = (parsed.response || '').toUpperCase();
        if (!verdict.includes('[ANALYSIS: COMPLETE]')) {
          analysisNudgeCount++;
          if (analysisNudgeCount >= 3) return { success: false, response: 'Analysis aborted: refused to include verdict after 3 nudges.', history };

          await agentMemory.pushNudge(
            `Your finish response is missing the required verdict.\n\n` +
            `1. ACTION: finish\n` +
            `2. PARAMETERS: { "response": "...your summary... [ANALYSIS: COMPLETE]" }\n\n` +
            `You MUST include exactly [ANALYSIS: COMPLETE] at the end of your response.`,
            `THOUGHT: My finish response was missing the [ANALYSIS: COMPLETE] verdict. I will include it now.`
          );
          if (onStep) onStep({ type: 'status', text: 'Nudging: verdict missing in finish response.' });
          continue;
        }
      }

      // ── Walkthrough.md guard (GENERATE mode only) ─────────────────────────
      if (!isReview && !isAnalysis) {
        if (!agentState.planWritten) {
          // Double check history as agentState might have missed it if it was from a previous partial turn
          agentState.planWritten = history.some(m => {
            if (m.role !== 'user' || !m.content) return false;
            const c = m.content.toLowerCase();
            return (c.includes('./agent_reports/developer_walkthrough.md') || c.includes('developer_walkthrough.md') || c.includes('plan.md')) && (
              c.includes('file written') || c.includes('file updated') || c.includes('tool result (write_file)')
            );
          });
        }

        if (!agentState.planWritten) {
          planNudgeCount++;
          console.warn(`[DevAgent] Walkthrough missing (${planNudgeCount}/3)`);
          if (planNudgeCount >= 3) return { success: false, response: 'Generation aborted: refused to write developer_walkthrough.md after 3 nudges.', history };

          await agentMemory.pushNudge(
            `You must write a summary of your implementations to ./agent_reports/developer_walkthrough.md before finishing.\n\n` +
            `1. ACTION: write_file\n` +
            `2. PARAMETERS: { "path": "./agent_reports/developer_walkthrough.md", "content": "# Project Walkthrough\\n\\n## Changes\\n- Feature X\\n- Fix Y\\n..." }\n\n` +
            `This is mandatory for every task. Do it NOW.`,
            `THOUGHT: I must document my implemented changes in ./agent_reports/developer_walkthrough.md before I can finish.`
          );
          if (onStep) onStep({ type: 'status', text: 'Nudging: must write developer_walkthrough.md first.' });
          continue;
        }
      }

      // ── Auto review-request guard ─────────────────────────────────────────
      if (autoRequestReview && !isReview) {
        if (!agentState.reviewRequested) {
          agentState.reviewRequested = history.slice(history.findLastIndex(m => (m.content || '').includes('[CODE: NOT OK]')) + 1).some(m => {
            const c = (m.content || '').toLowerCase();
            return c.includes('request_review') && (c.includes('tool result') || c.includes('logged'));
          });
        }
        if (!agentState.reviewRequested) {
          reviewRequestNudgeCount++;
          console.warn(`[DevAgent] request_review nudge (${reviewRequestNudgeCount}/3)`);
          if (reviewRequestNudgeCount >= 3) return { success: false, response: 'Aborted: refused to call request_review after 3 nudges.', history };
          // ── BLOCK RESPONSE: smooth nudge pair ───────────────────────────
          await agentMemory.pushNudge(
            `You must call request_review before finishing.\n\n` +
            `1. ACTION: request_review\n` +
            `2. PARAMETERS: {}\n\n` +
            `Call this NOW. Then you may call finish on your NEXT response.`,
            `THOUGHT: I need to call request_review before I can finish. I will do that now.`
          );
          if (onStep) onStep({ type: 'status', text: 'Nudging: call request_review first.' });
          continue;
        }
      }

      // All guards passed — emit final response
      let finalMsg = parsed.response || '';

      if (isAnalysis && finalMsg.includes('[ANALYSIS: COMPLETE]')) {
        try {
          const reportPath = path.join(workspaceDir, './agent_reports/system_analysis_walkthrough.md');
          if (fs.existsSync(reportPath)) {
            const reportContent = fs.readFileSync(reportPath, 'utf8');
            finalMsg = `${finalMsg}\n\n---\n\n${reportContent}`;
          }
        } catch (e) {
          console.warn('[DevAgent] Failed to read analysis report for final response:', e.message);
        }
      }

      // Developer mode: append developer_walkthrough.md content if it was written
      if (!isReview && !isAnalysis) {
        try {
          const walkthroughPath = path.join(workspaceDir, './agent_reports/developer_walkthrough.md');
          if (fs.existsSync(walkthroughPath)) {
            const walkthroughContent = fs.readFileSync(walkthroughPath, 'utf8');
            finalMsg = walkthroughContent + (finalMsg ? `\n\n---\n\n${finalMsg}` : '');
          }
        } catch (e) {
          console.warn('[DevAgent] Failed to read developer walkthrough for final response:', e.message);
        }
      }

      // Save LangChain memory for session persistence
      const serializedMemory = await agentMemory.serialize();

      logInfo('agent_finish', `[step ${step}] finish — agent done`, {
        step,
        mode,
        totalSteps: step,
        success: true,
        thought: parsed.thought || undefined
      });

      // Log the final response to agent-infos.log
      logInfo('llm_final_response', `[step ${step}] Agent final response (${finalMsg.length} chars)`, {
        step, mode, _text: finalMsg.length > 8000 ? finalMsg.slice(0, 8000) + `\n…[truncated]` : finalMsg
      });

      if (onStep) onStep({ type: 'response', content: finalMsg });
      return { success: true, response: finalMsg, history, memory: serializedMemory };
    }

    // ── Execute tool ──────────────────────────────────────────────────────────
    action = (parsed.action || '').toLowerCase();
    const authorizedTools = getToolsForMode(mode);
    const allowedNames = authorizedTools.map(t => t.name.toLowerCase());

    if (!allowedNames.includes(action)) {
      const errMsg = `Tool "${action}" is NOT authorized in ${mode.toUpperCase()} mode. Available: ${allowedNames.join(', ')}`;
      console.error('[DevAgent]', errMsg);
      logInfo('tool_error', errMsg, { step, action });
      if (onStep) onStep({ type: 'tool_error', tool: action, error: errMsg });
      await agentMemory.pushNudge(
        `You attempted to use "${action}", but it is restricted in ${mode.toUpperCase()} mode.\n\n` +
        `Please ONLY use: ${allowedNames.join(', ')}`,
        `THOUGHT: I used a tool that I'm not allowed to use in this mode. I will switch to using an authorized tool.`
      );
      continue;
    }

    const toolFn = TOOLS[action];
    if (onStep) onStep({ type: 'tool_call', tool: action, parameters: parsed.parameters, step });

    // Build a readable log message — show target file for write operations
    const _p = parsed.parameters || {};
    const _file = _p.path || _p.file || _p.filename || _p.filepath || _p.target || '';
    const _toolMsg = _file
      ? `[step ${step}] ${action} → ${_file}`
      : `[step ${step}] ${action}`;
    logInfo('tool_call', _toolMsg, {
      step,
      action,
      file: _file || undefined,
      thought: parsed.thought || undefined,
      parameters: redactForInfoLog(_p, 2000)
    });

    // ── Review / Analysis mode write restrictions ─────────────────────────────
    const writeTools = ['write_file', 'replace_in_file', 'bulk_write', 'apply_blueprint', 'scaffold_project'];
    if ((isReview || isAnalysis) && writeTools.includes(action)) {
      const p = parsed.parameters || {};
      const ap = String(p.path || p.file || p.filename || p.filepath || p.target || '').toLowerCase();

      let ok = false;
      let allowedPath = '';
      let modeLabel = '';

      if (isReview) {
        ok = ['write_file', 'replace_in_file'].includes(action) && /reviewer_walkthrough\.md$/i.test(ap);
        allowedPath = 'reviewer_walkthrough.md';
        modeLabel = 'REVIEW';
      } else if (isAnalysis) {
        ok = ['write_file', 'replace_in_file'].includes(action) && /system_analysis_walkthrough\.md$/i.test(ap);
        allowedPath = 'system_analysis_walkthrough.md';
        modeLabel = 'ANALYSIS';
      }

      if (!ok) {
        reviewWriteBlockCount++;
        const blocked = `"${action}" to "${ap}" is blocked in ${modeLabel} mode.`;
        console.warn(`[DevAgent] BLOCKED (${reviewWriteBlockCount}/3)`);

        if (reviewWriteBlockCount >= 3) {
          const msg = `${modeLabel} aborted: repeated unauthorized writes.`;
          if (onStep) onStep({ type: 'error', message: msg });
          return { success: false, response: msg, history };
        }

        await agentMemory.pushNudge(
          `You have attempted an unauthorized write in ${modeLabel} mode.\n\n` +
          `1. You are ONLY allowed to write to "${allowedPath}".\n` +
          `2. Use ACTION: write_file ONLY for your report.\n` +
          `3. DO NOT attempt to modify source code.`,
          `THOUGHT: I tried to write to an unauthorized file. In ${modeLabel} mode, I must only write to ${allowedPath}.`
        );
        if (onStep) onStep({ type: 'status', text: `Blocked: unauthorized write in ${modeLabel} mode.` });
        continue;
      }
    }

    let result;
    try {
      const p = parsed.parameters || {};

      // Path prefix deduplication
      if (targetFolderName) {
        // Only force flat mode if we are scaffolding INTO the current focused directory
        if (action === 'scaffold_project' && p.name === targetFolderName) p.flat = true;
        const strip = (fp) => {
          if (!fp || typeof fp !== 'string') return fp;
          const np = fp.replace(/\\/g, '/'), nt = targetFolderName.replace(/\\/g, '/');
          if (np === nt) return '.';
          return np.startsWith(nt + '/') ? np.slice(nt.length + 1) : fp;
        };
        ['path', 'file', 'filepath', 'filename', 'target'].forEach(k => { if (p[k]) p[k] = strip(p[k]); });
        if ((action === 'bulk_write' || action === 'apply_blueprint') && Array.isArray(p.files))
          p.files.forEach(f => ['path', 'file'].forEach(k => { if (f[k]) f[k] = strip(f[k]); }));
      } else if (lastScaffoldedName && ['write_file', 'replace_in_file', 'bulk_write'].includes(action)) {
        const ap = String(p.path || p.file || '').replace(/\\/g, '/');
        if (ap.startsWith('src/') || ap.startsWith('middlewares/') || ap.startsWith('utils/')) {
          const expected = `${lastScaffoldedName}/${ap}`;
          await agentMemory.pushNudge(
            `You wrote to "${ap}" at workspace root but should write to "${expected}".\n\n` +
            `1. Rewrite to: ACTION: write_file -> PARAMETERS: { "path": "${expected}", ... }`,
            `THOUGHT: I used the wrong path. I must prefix with the project name.`
          );
          if (onStep) onStep({ type: 'tool_error', tool: action, error: `Wrong path: use ${expected}` });
          continue;
        }
      }

      if (action.includes('delete') || action.includes('remove')) {
        await agentMemory.addAIMessage(`Skipping ${action} — user handles deletions.`);
        history.push({ role: 'assistant', content: `Skipping ${action} — user handles deletions.` });
        continue;
      }

      if (action === 'scaffold_project' && p.name) lastScaffoldedName = p.name;

      const tp = p.path || p.file || (p.files ? `${p.files.length} files` : 'none');
      console.log(`[DevAgent] STEP ${step} | ${action} | ${tp}`);

      if (action === 'write_file' && typeof p.content === 'string') {
        const filePath = p.path || p.file || p.filename || p.filepath || '';
        const lp = String(filePath).toLowerCase();

        const sm = p.content.match(/^\s*(mkdir|cd|npm|node|git|rm|cp|mv|ls)\s+|^#!(\/usr\/bin\/env|\/bin\/bash)/i);
        if (sm) throw new Error(`write_file used as shell: "${sm[1] || 'shebang'}". Use scaffold_project.`);

        // REPAIR: Forensic reports often get written with escaped newlines (\\n) by certain models.
        // Ratio check: if escaped \n count exceeds real \n count, repair before writing.
        if (lp.includes('system_analysis_walkthrough.md') && p.content.includes('\\n')) {
          const wEscaped = (p.content.match(/\\n/g) || []).length;
          const wReal = (p.content.match(/\n/g) || []).length;
          if (wEscaped > wReal) {
            console.log(`[DevAgent] 🛠️ REPAIRING write: ${wEscaped} escaped vs ${wReal} real newlines.`);
            p.content = p.content.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '');
          }
        }
      }

      // Deciding base directory for tool execution
      // scaffold_project is a special case: if not 'flat', it should create a new folder in the root workspaceDir
      const toolBaseDir = (action === 'scaffold_project' && !p.flat) ? workspaceDir : effectiveWorkspaceDir;
      result = await toolFn(p, toolBaseDir, false, projectRoot || workspaceDir);

      if (action === 'list_files' && result.filesList) {
        console.log(`[DevAgent] listed ${result.filesList.length} files`);
        // console.log('  ' + result.filesList.slice(0, 30).join('\n  '));

        // Merge into discoveredFiles (deduplicated)
        const newFiles = result.filesList.map(f => String(f).toLowerCase());
        agentState.discoveredFiles = Array.from(new Set([...agentState.discoveredFiles, ...newFiles]));
      }

      // ── Update agentState immediately after confirmed success ─────────────
      if (!result?.error) {
        const lp = String(p.path || p.file || '').toLowerCase();
        if (action === 'request_review') {
          agentState.reviewRequested = true;
          console.log('[DevAgent] agentState.reviewRequested = true');
        } else if (action === 'read_file' || action === 'bulk_read') {
          const files = action === 'read_file' ? [lp] : (p.paths || []).map(ps => String(ps).toLowerCase());
          if (files.some(f => f.includes('package.json') || f.includes('requirements.txt') || f.includes('pom.xml') || f.includes('go.mod'))) {
            agentState.configRead = true;
            console.log('[DevAgent] agentState.configRead = true');
          }
        } else if (writeTools.includes(action)) {
          if (lp.includes('reviewer_walkthrough.md') || lp.includes('system_analysis_walkthrough.md')) {
            agentState.reportSaved = true;
            console.log('[DevAgent] agentState.reportSaved = true');
          } else if (lp.includes('developer_walkthrough.md')) {
            agentState.planWritten = true;
            console.log('[DevAgent] agentState.planWritten = true');
          } else {
            agentState.codeModified = true;
          }
        }
        if (action === 'bulk_write' || action === 'apply_blueprint') agentState.codeModified = true;
      }

      if (onStep) onStep({ type: 'tool_result', tool: action, result, step });
      const _resultMsg = _file
        ? `[step ${step}] ${action} ✓ ${_file}`
        : `[step ${step}] ${action} ✓`;
      logInfo('tool_result', _resultMsg, {
        step,
        action,
        file: _file || undefined,
        ok: true,
        result: redactForInfoLog(result, 2000)
      });

    } catch (toolErr) {
      console.error(`[DevAgent] ${action} failed:`, toolErr.message);
      logError('tool_execution_error', toolErr.message, { action, parameters: parsed.parameters }, parsed.thought);
      result = { error: toolErr.message };
      if (onStep) onStep({ type: 'tool_error', tool: action, error: toolErr.message });
      logInfo('tool_result', `[step ${step}] ${action} ✗ ${toolErr.message}`, { step, action, file: _file || undefined, ok: false, error: toolErr.message, parameters: redactForInfoLog(_p, 2000) });
    }

    if (signal?.aborted) {
      const s = summariseResult(action, parsed.parameters || {}, result, isReview, onStep);
      if (onStep) onStep({ type: 'response', content: s });
      return { success: true, response: s };
    }

    // Auto-log review feedback
    if (isReview && parsed.response) {
      const r = parsed.response;
      if (r.includes('[CODE: NOT OK]') || r.toLowerCase().includes('issue')) {
        agentState.reviewRequested = false; // RESET STATE ON REJECTION
        try {
          const lp = path.resolve(workspaceDir, 'agent-handoff.log');
          await fs.ensureDir(path.dirname(lp));
          await fs.appendFile(lp, `\n[${new Date().toLocaleString()}] REVIEWER:\n${r}\n${'-'.repeat(40)}\n`, 'utf-8');
        } catch (_) { }
      }
    }

    // replace_in_file failure: inject actual content AND discourage retry loops
    if (action === 'replace_in_file' && result?.error) {
      const tp = (parsed.parameters || {}).path || (parsed.parameters || {}).file;
      if (tp) {
        try {
          const absPath = path.resolve(effectiveWorkspaceDir, tp.replace(/^[/\\]+/, ''));
          const actual = await fs.readFile(absPath, 'utf-8');
          const MAX_CH = 6000;
          const content = actual.length > MAX_CH ? actual.slice(0, MAX_CH) + '\n...[TRUNCATED]' : actual;
          result.currentFileContent =
            `CURRENT "${tp}":\n\`\`\`\n${content}\n\`\`\`\n\nSearch block NOT found. Fix whitespace/match or rewrite with write_file.`;
        } catch (_) { }
      }

      const msgLower = String(result.error || '').toLowerCase();
      const isSearchMissing = msgLower.includes('search block was not found');
      if (isSearchMissing && tp) {
        const key = tp.toLowerCase();
        agentState.replaceFailCounts[key] = (agentState.replaceFailCounts[key] || 0) + 1;
        const failCount = agentState.replaceFailCounts[key];

        if (failCount >= 2) {
          console.warn(`[DevAgent] replace_in_file search-miss loop on "${tp}" (${failCount})`);
          // Nudge the model away from further replace_in_file attempts for this file.
          await agentMemory.pushNudge(
            `Your last replace_in_file call on "${tp}" failed because the search block was not found.\n\n` +
            `1. STOP calling replace_in_file on this file.\n` +
            `2. Instead, call ACTION: write_file with PARAMETERS: { "path": "${tp}", "content": "FULL UPDATED FILE CONTENT HERE" }.\n` +
            `3. Use the CURRENT file content shown in the latest tool result as a starting point and edit it directly.`,
            `THOUGHT: replace_in_file is not matching the target block. I must switch to write_file and provide the full updated file content instead of retrying.`
          );
        }
      }
    }

    // ── Append tool result to history ─────────────────────────────────────────
    const summary = summariseResult(action, parsed.parameters || {}, result, isReview, onStep);
    let content = `Tool result (${action}):\n${summary}`;

    if (['read_file', 'list_files', 'bulk_read'].includes(action)) {
      let raw = JSON.stringify(result, null, 2);
      // Analysis mode needs massive context for project-wide recursive scans
      const maxChars = (isAnalysis || unlimitedSteps) ? 150000 : 10000;
      if (raw.length > maxChars) raw = raw.slice(0, maxChars) + `\n...[TRUNCATED at ${maxChars} chars]...`;
      content += `\n\nRaw Data:\n\`\`\`json\n${raw}\n\`\`\``;

      // EMIT TO CHAT: Show results directly in the UI for user visibility
      // Safety: Truncate the UI display version to 5000 chars to prevent browser hang
      if (onStep) {
        let displayRaw = raw;
        if (displayRaw.length > 5000) displayRaw = displayRaw.slice(0, 5000) + '\n...[UI DISPLAY TRUNCATED - Full data sent to Agent Memory]...';
        onStep({
          type: 'text',
          text: `📊 **System Discovery (${action}):**\n\`\`\`json\n${displayRaw}\n\`\`\``
        });
      }
    } else if (result?.error) {
      content = `Tool result (${action}):\nError: ${result.error}`;
      if (result.currentFileContent) content += `\n\n${result.currentFileContent}`;
    }

    // Add tool result to LangChain memory
    await agentMemory.addUserMessage(content);
    history.push({ role: 'user', content });

    // ── Log tool result to agent-infos.log ────────────────────────────────────
    logInfo('tool_result_full', `[step ${step}] Tool result saved to memory`, {
      step, action, _text: content.length > 8000 ? content.slice(0, 8000) + `\n…[truncated ${content.length} chars total]` : content
    });

    // ── Incremental session save (fire-and-forget) ────────────────────────────
    // Preserves all LLM responses + tool results so far even if agent crashes.
    if (sessionId) {
      const snapshot = history.filter(m => m.role !== 'system');
      saveSessionFile(sessionId, snapshot, mode ? { mode } : {}).catch(() => {});
    }

    console.log(`[DevAgent] STEP ${step} DONE.`);
  }

  const timeout = `Agent reached MAX_STEPS (${MAX_STEPS}). Increase AGENT_MAX_STEPS or simplify the task.`;
  console.error('[DevAgent]', timeout);
  if (onStep) onStep({ type: 'error', message: timeout });
  const serializedMemory = await agentMemory.serialize();
  return { success: false, response: timeout, history, memory: serializedMemory };
}

/**
 * Alternative agent execution loop using LangGraph.
 */
async function runAgentGraph(opts) {
  const { messages, workspaceDir, onStep, signal, fastMode = false, autoRequestReview = false, stack = 'default', selectedModel = null, unlimitedSteps = false, sessionId = null, projectRoot = null } = opts;

  // Initialize flags and state (mostly copied from runAgent for parity)
  let isReview = false, isAnalysis = false;
  for (const m of messages) {
    if (m.role === 'user' && typeof m.content === 'string') {
      if (m.content.includes('[MODE: REVIEW]')) isReview = true;
      if (m.content.includes('[MODE: ANALYSIS]')) isAnalysis = true;
    }
  }
  const mode = isReview ? 'review' : (isAnalysis ? 'analysis' : 'developer');

  // Target folder resolution: scan history (from latest to oldest) for [TARGET FOLDER: XXX]
  let effectiveWorkspaceDir = workspaceDir, targetFolderName = '';
  let targetMatch = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user' && typeof m.content === 'string') {
      targetMatch = m.content.match(/\[TARGET FOLDER:\s*([^\]]+)\]/);
      if (targetMatch) break;
    }
  }

  if (targetMatch) {
    const tp = targetMatch[1].trim();
    const res = path.isAbsolute(tp) ? tp : path.resolve(workspaceDir, tp.replace(/^[\/\\]+/, ''));
    if (tp && tp !== '.') {
      effectiveWorkspaceDir = res; targetFolderName = tp;
      console.log(`[DevAgent-Graph] TARGET FOLDER (from history): "${tp}"`);
      if (onStep) onStep({ type: 'status', text: `📍 Target Folder Pinned: ${tp}` });
    }
  }

  // Project auto-detection if no target pinned
  if (!targetFolderName) {
    try {
      const PROJECT_SIGNALS = ['package.json', 'server.js', 'app.js', 'index.html', 'index.js'];
      const entries = fs.readdirSync(workspaceDir, { withFileTypes: true });
      const SKIP_DIRS = new Set(['.git', 'node_modules', '.cache', 'dist', 'build', 'coverage']);

      let candidate = null;
      for (const entry of entries) {
        if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
        const candidateDir = path.join(workspaceDir, entry.name);
        if (PROJECT_SIGNALS.some(sig => fs.existsSync(path.join(candidateDir, sig)))) {
          candidate = entry.name;
          break;
        }
      }

      if (candidate) {
        effectiveWorkspaceDir = path.join(workspaceDir, candidate);
        targetFolderName = candidate;
        console.log(`[DevAgent-Graph] AUTO-DETECT: Selected project folder: "${candidate}"`);
      }
    } catch (e) {
      console.warn('[DevAgent-Graph] Auto-detect failed:', e.message);
    }
  }

  // Model resolution
  let modelConfig = {};
  try {
    const mp = path.join(__dirname, 'models.json');
    if (fs.existsSync(mp)) modelConfig = JSON.parse(fs.readFileSync(mp, 'utf-8')).config || {};
  } catch (e) { }

  const resolvedModel = (isReview ? modelConfig.review : (isAnalysis ? (modelConfig.analysis || modelConfig.review) : modelConfig.dev))
    || selectedModel || process.env.LM_STUDIO_MODEL || modelConfig.global || 'openai/gpt-oss-20b';

  const BASE_MAX_STEPS = Number(process.env.AGENT_MAX_STEPS) || 50;
  let MAX_STEPS = BASE_MAX_STEPS;
  if (isAnalysis) MAX_STEPS = Math.max(BASE_MAX_STEPS, 200);
  else if (mode === 'developer') MAX_STEPS = Math.max(BASE_MAX_STEPS, 100);
  if (unlimitedSteps) MAX_STEPS = 10000;

  const systemPrompt = getSystemPrompt(mode, targetFolderName, fastMode, autoRequestReview, stack, false);

  const config = {
    mode,
    resolvedModel,
    systemPrompt,
    fastMode,
    targetFolderName,
    effectiveWorkspaceDir,
    workspaceDir,
    projectRoot,
    maxSteps: MAX_STEPS,
    allowedTools: getToolsForMode(mode).map(t => t.name),
    autoRequestReview,
    onStep // Pass streaming callback to graph nodes
  };

  // Sanitize incoming messages: strip nudge/recovery artifacts saved from previous runs
  const GRAPH_NUDGE_ACK = [
    /^\[SYSTEM:\s*Correction received/i,
    /^\[GARBLED OUTPUT — REJECTED BY SYSTEM\]/i,
    /^\[FORMAT RECOVERY\]/i,
    /^THOUGHT:\s*I need to follow the mandatory instruction/i,
  ];
  const GRAPH_NUDGE_USER = [
    /^\[SYSTEM DIRECTIVE\]/i,
    /^\[FORMAT RECOVERY\]/i,
  ];

  // Convert incoming messages to LangChain messages for LangGraph
  const lcMessages = messages.reduce((acc, m) => {
    const content = typeof m.content === 'string' ? m.content : String(m.content || '');
    if (m.role === 'assistant' && GRAPH_NUDGE_ACK.some(re => re.test(content.trimStart()))) return acc;
    if (m.role === 'user' && GRAPH_NUDGE_USER.some(re => re.test(content.trimStart()))) return acc;
    if (m.role === 'assistant') { acc.push(new AIMessage(content)); return acc; }
    // Map system messages to HumanMessage to ensure we always have a "user query" for picky prompt templates (like LM Studio)
    if (m.role === 'system') { acc.push(new HumanMessage(`[SYSTEM DIRECTIVE] ${content}`)); return acc; }
    acc.push(new HumanMessage(content));
    return acc;
  }, []);

  const app = createAgentGraph(TOOLS);

  console.log(`[DevAgent] Starting LangGraph Orchestration in: ${effectiveWorkspaceDir}`);
  if (onStep) onStep({ type: 'status', text: `🚀 Initializing LangGraph in: ${effectiveWorkspaceDir}` });

  // Initialize agent state by scanning history (standardizes behavior with classic loop)
  const historyContent = messages.map(m => (m.content || '').toLowerCase());
  const hasInHistory = (patterns, keywords = ['file written', 'file updated', 'tool result']) => {
    return historyContent.some(c =>
      patterns.some(p => c.includes(p)) && keywords.some(k => c.includes(k))
    );
  };

  const initialState = {
    messages: lcMessages,
    agentState: {
      reportSaved: hasInHistory(['reviewer_walkthrough.md', 'system_analysis_walkthrough.md']),
      configRead: hasInHistory(['package.json', 'requirements.txt'], ['tool result', 'content:', 'bytes:']),
      codeModified: hasInHistory(['.js', '.ts', '.html', '.css', '.vue']),
      planWritten: hasInHistory(['developer_walkthrough.md', 'plan.md']),
      reviewRequested: hasInHistory(['request_review'], ['tool result', 'logged', 'success']),
      reviewLoopCount: messages.filter(m => (m.content || '').includes('[CODE: NOT OK]')).length,
      discoveredFiles: [],
      replaceFailCounts: {},
      hallucinationVerified: false
    },
    config,
    step: 0
  };

  try {
    console.log(`[DevAgent] LangGraph recursion limit set to 1000. Max steps: ${config.maxSteps}`);
    let finalState = initialState;
    // Manually accumulate messages (LangGraph stream yields deltas, not full state)
    let accumulatedMessages = [...initialState.messages];

    // Use streaming mode to process graph transitions
    const stream = await app.stream(initialState, { signal, recursionLimit: 1000 });
    for await (const update of stream) {
      // Each update contains the state changes from a specific node
      for (const [nodeName, nodeOutput] of Object.entries(update)) {
        // Apply messages reducer manually: (x, y) => x.concat(y)
        if (nodeOutput.messages) {
          accumulatedMessages = accumulatedMessages.concat(nodeOutput.messages);
        }
        // Merge all other state fields (lastAction, agentState, etc.)
        finalState = { ...finalState, ...nodeOutput, messages: accumulatedMessages };
      }
    }

    // Extract final response
    const lastMsg = accumulatedMessages[accumulatedMessages.length - 1];
    let response = lastMsg instanceof AIMessage ? lastMsg.content : "Task completed.";

    if (isAnalysis && response.includes('[ANALYSIS: COMPLETE]')) {
      try {
        const reportPath = path.join(workspaceDir, './agent_reports/system_analysis_walkthrough.md');
        if (fs.existsSync(reportPath)) {
          const reportContent = fs.readFileSync(reportPath, 'utf8');
          response = `${response}\n\n---\n\n${reportContent}`;
        }
      } catch (e) {
        console.warn('[DevAgent-Graph] Failed to read analysis report for final response:', e.message);
      }
    }

    // Convert back to role/content history for the client
    const history = finalState.messages.map(m => ({
      role: m instanceof AIMessage ? 'assistant' : (m instanceof SystemMessage ? 'system' : 'user'),
      content: m.content
    }));

    if (onStep) onStep({ type: 'response', content: response });

    return {
      success: true,
      response,
      history,
      isLangGraph: true
    };
  } catch (err) {
    if (onStep) onStep({ type: 'error', message: err.message });
    throw err;
  }
}

module.exports = { runAgent, runAgentGraph };