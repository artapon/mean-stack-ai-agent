const path = require('path');
const fs = require('fs-extra');
const { readFile, writeFile, listFiles, bulkWrite, applyBlueprint, bulkRead, replaceInFile } = require('../tools/filesystem');
const { scaffoldProject } = require('../tools/scaffolder');
const { callLangchain, LangchainWorkflow, DevAgentOutputParser, createLangchainTools } = require('./langchain');
const { logError, logInfo } = require('../utils/logger');


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

/**
 * Injects a properly structured assistant+user exchange to redirect the model.
 *
 * WHY: Bare user messages break the assistant→user rhythm the model expects.
 *      A naked "Error: Report not saved." causes the model to produce garbled
 *      output like "1. ACTIONARAMETERS:" on the next turn.
 *
 * @param {Array}  history     - The conversation history array (mutated in place).
 * @param {string} directive   - The instruction to give the model (imperative, numbered).
 * @param {string} [ackMsg]    - Optional custom acknowledgement for the assistant turn.
 *                               Defaults to a generic "understood" message.
 */
function pushNudge(history, directive, ackMsg) {
  // Step 1: Fake assistant acknowledgement — keeps the turn rhythm valid.
  // Must look like a real model response so the next user turn makes sense.
  history.push({
    role: 'assistant',
    content: ackMsg || 'THOUGHT: I need to follow the mandatory instruction before proceeding.\n\nACTION: (pending next instruction)\n\nPARAMETERS: {}'
  });

  // Step 2: User directive — clean numbered format, no raw "Error:" prefix.
  // Numbered format is less likely to trigger format confusion than prose.
  history.push({
    role: 'user',
    content: `[SYSTEM DIRECTIVE]\n\n${directive}\n\nRespond with the correct ACTION and PARAMETERS block immediately.`
  });
}

/**
 * Injects a format recovery block when the model produces garbled output.
 *
 * WHY: Injecting bare "Error: bad output" after garbled output makes the model
 *      panic further. Showing a concrete correct example re-anchors format understanding.
 *
 * @param {Array}  history      - The conversation history array (mutated in place).
 * @param {string} lastBadOutput - The garbled model output (for context).
 * @param {string} errorReason  - Human-readable reason the output was rejected.
 * @param {string} [exampleAction] - The action the model should take next (for the example).
 */
function pushFormatRecovery(history, lastBadOutput, errorReason, exampleAction) {
  const example = exampleAction || 'write_file';

  // Replace the garbled assistant entry if it's the last one
  if (history.length > 0 && history[history.length - 1].role === 'assistant') {
    history[history.length - 1].content = '[GARBLED OUTPUT — REJECTED BY SYSTEM]';
  }

  history.push({
    role: 'user',
    content: [
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
    ].join('\n')
  });
}


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
 * @returns {string}
 */
function getSystemPrompt(mode, targetFolder, fastMode = false, autoRequestReview = false, stack = 'default') {
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
      ? 'You are currently in REVIEW MODE. AUDIT the codebase. ONLY use write_file for walkthrough_review_report.md.'
      : mode === 'analysis'
        ? 'You are currently in ANALYSIS MODE. SCAN and ANALYZE the codebase. ONLY use write_file for walkthrough_system_analysis_report.md. DO NOT modify source code. 🛑 **STRICT REGULATION**: Do NOT include any folders or files in your report (especially the Tree View) that were not physically found in your scan. NO GHOST FOLDERS allowed.'
        : 'Your primary goal is to MODIFY THE FILESYSTEM using tools — never describe code.'}
${targetFolder ? `\nCURRENT WORKSPACE ROOT: "${targetFolder}"` : ''}

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
1. GENERATE mode: SCAN -> READ -> IMPLEMENT -> DOCUMENT (walkthrough.md) -> FINISH.
2. REVIEW mode: READ all files -> ANALYZE -> WRITE walkthrough_review_report.md -> FINISH with [CODE: OK] or [CODE: NOT OK].
3. ANALYSIS mode: SCAN -> IDENTIFY STACK -> MAP MODULES -> WRITE walkthrough_system_analysis_report.md -> FINISH with [ANALYSIS: COMPLETE].
4. ALWAYS use tools to write files. Never output code blocks in plain text.
5. JSDoc 3.0 on every method.
6. Adapt to the project's ACTUAL structure discovered via list_files. DO NOT assume a specific directory layout.
7. NO placeholders. Write full working code.
8. NO shell commands in write_file.
9. Single action per response — ONE THOUGHT + ONE ACTION + ONE PARAMETERS block.
${fastMode ? '10. FAST MODE: No THOUGHT block at all.' : ''}
${autoRequestReview && mode === 'developer' ? '11. Call "request_review" after EVERYTHING else (code, documentation) is done, and BEFORE "finish". This is MANDATORY.' : ''}
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
  if (end === -1) end = raw.length - 1;
  const candidate = raw.slice(i, end + 1);

  try { return JSON.parse(candidate); } catch (_) { }
  try {
    const r = require('vm').runInNewContext('(' + candidate + ')', Object.create(null));
    if (r && typeof r === 'object') return r;
  } catch (_) { }
  try { return JSON.parse(candidate.replace(/,(\s*[}\]])/g, '$1')); } catch (_) { }

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
    if (any) return result;
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
function summariseResult(action, params, result, isReview) {
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
    const isPlan = (params.path || '').endsWith('walkthrough.md');
    return `File written: ${params.path}\n\n` + (
      isReview ? 'Continue your review.' :
        isPlan ? 'DOCUMENTATION SAVED — YOU MAY NOW FINISH.' :
          'Continue to next file or FINISH with walkthrough.md.'
    );
  }
  if (action === 'replace_in_file') return `Edit applied: ${params.path}\n\n${isReview ? 'Continue.' : 'Continue or FINISH.'}`;
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
function redactForInfoLog(value, maxStrLen = 800) {
  const seen = new WeakSet();

  const redactString = (s) => {
    if (typeof s !== 'string') return s;
    if (s.length <= maxStrLen) return s;
    return `[omitted ${s.length} chars] ` + s.slice(0, Math.min(120, maxStrLen)) + '…';
  };

  const walk = (v, keyHint = '') => {
    if (v == null) return v;
    if (typeof v === 'string') return redactString(v);
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.slice(0, 50).map((x) => walk(x, keyHint));
    if (typeof v !== 'object') return String(v);

    if (seen.has(v)) return '[circular]';
    seen.add(v);

    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const lk = String(k).toLowerCase();
      const isLargeField = ['content', 'replace', 'search', 'text', 'blueprint', 'rawtext', 'rawbuffer'].includes(lk);
      const isNestedFiles = lk === 'files' && Array.isArray(val);

      if (isNestedFiles) {
        out[k] = val.slice(0, 50).map((f) => {
          if (!f || typeof f !== 'object') return walk(f, 'files');
          const fo = {};
          for (const [fk, fv] of Object.entries(f)) {
            const lfk = String(fk).toLowerCase();
            fo[fk] = (lfk === 'content' || lfk === 'replace' || lfk === 'search')
              ? `[omitted ${typeof fv === 'string' ? fv.length : 'n/a'}]`
              : walk(fv, fk);
          }
          return fo;
        });
        continue;
      }

      if (isLargeField) {
        out[k] = `[omitted ${typeof val === 'string' ? val.length : 'n/a'}]`;
      } else {
        out[k] = walk(val, k);
      }
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
  const { messages, workspaceDir, onStep, signal, fastMode = false, autoRequestReview = false, stack = 'default', selectedModel = null, unlimitedSteps = false } = opts;

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const lastContent = lastUserMsg?.content || '';

  // Mode detection: sticky via history scan
  let isReview = false, isAnalysis = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user' && typeof m.content === 'string') {
      if (m.content.includes('[MODE: REVIEW]')) { isReview = true; break; }
      if (m.content.includes('[MODE: ANALYSIS]')) { isAnalysis = true; break; }
      if (m.content.includes('[CONTINUE REVIEW]')) { isReview = true; break; }
      if (m.content.includes('[CONTINUE ANALYSIS]')) { isAnalysis = true; break; }
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
    const res = path.resolve(workspaceDir, tp.replace(/^[\/\\]+/, ''));
    if (tp && tp !== '.' && res.toLowerCase().startsWith(workspaceDir.toLowerCase())) {
      effectiveWorkspaceDir = res; targetFolderName = tp;
      console.log(`[DevAgent] TARGET FOLDER (from history): "${tp}"`);
    }
  }

  // ── Analysis mode: auto-detect project subfolder if no target pinned ──────
  // When the user launches Analysis without pinning a folder, list_files(".")
  // would scan workspace/ root and save the report there instead of the project.
  // We scan one level deep in workspaceDir for the first directory that looks
  // like a real project (has package.json, server.js, app.js, or index.html).
  if (isAnalysis && !targetFolderName) {
    try {
      const PROJECT_SIGNALS = ['package.json', 'server.js', 'app.js', 'index.html', 'index.js'];
      const entries = fs.readdirSync(workspaceDir, { withFileTypes: true });
      const SKIP_DIRS = new Set(['.git', 'node_modules', '.cache', 'dist', 'build', 'coverage']);
      for (const entry of entries) {
        if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
        const candidateDir = path.join(workspaceDir, entry.name);
        const hasSignal = PROJECT_SIGNALS.some(sig => fs.existsSync(path.join(candidateDir, sig)));
        if (hasSignal) {
          effectiveWorkspaceDir = candidateDir;
          targetFolderName = entry.name;
          console.log(`[DevAgent] ANALYSIS: Auto-detected project folder: "${entry.name}"`);
          break;
        }
      }
      if (!targetFolderName) {
        console.warn('[DevAgent] ANALYSIS: No project subfolder auto-detected — scanning workspace root.');
      }
    } catch (e) {
      console.warn('[DevAgent] ANALYSIS: Auto-detect failed:', e.message);
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
  let MAX_STEPS = isAnalysis ? Math.max(BASE_MAX_STEPS, 200) : BASE_MAX_STEPS;
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

  const systemPrompt = getSystemPrompt(mode, targetFolderName, fastMode, autoRequestReview, stack);

  let lastScaffoldedName = '';
  let step = 0, listFilesCount = 0, lastActionSig = null, lastActionRepeat = 0;

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

  let history = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : String(m.content) }))
  ];

  // ── POWERFUL WORKFLOW: Langchain Action Roadmap ─────────────────────────
  const isCreationPrompt = /create|new|scaffold|setup|generate/i.test(lastContent);
  const isResumingAnalysis = isAnalysis && fs.existsSync(path.resolve(effectiveWorkspaceDir, 'walkthrough_system_analysis_report.md'));
  const skipPlanner = isAnalysis || lastContent.includes('[FOLLOW REVIEW]') || lastContent.includes('[FOLLOW ANALYSIS]') || isResumingAnalysis;

  if (!isReview && !skipPlanner && (messages.length <= 2 || isCreationPrompt)) {
    try {
      if (onStep) onStep({ type: 'status', text: 'Langchain: Generating Action Roadmap...' });
      const planner = new LangchainPlanner(resolvedModel);
      const roadmap = await planner.plan(lastContent, "Workspace: " + (targetFolderName || 'root'));

      history.push({
        role: 'system',
        content: `[ACTION ROADMAP]\nThis roadmap was generated by the Langchain Planner. Follow it to ensure architectural integrity:\n\n${roadmap}`
      });

      console.log(`[DevAgent] Roadmap generated and injected.`);
      if (onStep) onStep({ type: 'status', text: 'Roadmap ready. Starting implementation...' });
    } catch (err) {
      console.error('[DevAgent] Planner failed:', err.message);
    }
  }

  // ── FOLLOW ANALYSIS Injection ───────────────────────────────────────────
  if (lastContent.includes('[FOLLOW ANALYSIS]') && !isReview) {
    try {
      const analysisPath = path.resolve(effectiveWorkspaceDir, 'walkthrough_system_analysis_report.md');
      if (fs.existsSync(analysisPath)) {
        const report = fs.readFileSync(analysisPath, 'utf-8');
        history.push({
          role: 'system',
          content: `[SYSTEM DIRECTIVE: ARCHITECTURAL ADHERENCE]\nYou MUST follow the architecture and module map defined in this System Analysis report:\n\n${report}`
        });
        console.log('[DevAgent] System Analysis Report injected into history.');
      }
    } catch (e) {
      console.warn('[DevAgent] Failed to inject analysis report:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  while (step < MAX_STEPS) {
    step++;
    console.log(`\n[DevAgent] STEP ${step} | History: ${history.length}`);

    // ── History pruning — retain report/review evidence entries ─────────────
    const defaultMax = fastMode ? 20 : 50;
    const MAX_HISTORY = isAnalysis ? 300 : defaultMax;
    if (history.length > MAX_HISTORY) {
      const essential = history.slice(0, 2);
      const recent = history.slice(fastMode ? -5 : -20);
      const toolResults = history.slice(2, fastMode ? -5 : -20).filter(m =>
        m.role === 'user' && m.content && (
          m.content.startsWith('Tool result') ||
          m.content.toLowerCase().includes('walkthrough_review_report') ||
          m.content.toLowerCase().includes('walkthrough_system_analysis_report') ||
          m.content.toLowerCase().includes('request_review') ||
          m.content.startsWith('[SYSTEM DIRECTIVE]') ||   // keep nudge context
          m.content.startsWith('[FORMAT RECOVERY]')       // keep recovery context
        )
      );
      history = [...essential, ...toolResults, ...recent];
      console.log(`[DevAgent] Pruned to ${history.length} items.`);
    }

    if (signal?.aborted) throw new Error('Agent stopped by user.');

    // ── LM Studio API call ───────────────────────────────────────────────────
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
      }, signal, resolvedModel);
    } catch (apiErr) {
      const msg = `API Error: ${apiErr.message}${apiErr.response?.data ? ' - ' + JSON.stringify(apiErr.response.data) : ''}`;
      console.error('[DevAgent]', msg);
      if (onStep) onStep({ type: 'error', message: msg });
      throw new Error(msg);
    }

    history.push({ role: 'assistant', content: rawText });
    const parsed = parseReply(rawText, isReview, fastMode);
    let action = (parsed.action || '').toLowerCase();

    console.log(`[DevAgent] STEP ${step} -> ${action || 'none'}`);
    console.log(rawText.length > 500 ? rawText.slice(0, 500) + '...' : rawText);
    if (parsed.thought && onStep) onStep({ type: 'thought', content: parsed.thought });

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
        pushNudge(history,
          `You have called "${action}" 3 times with identical parameters.\n\n` +
          `1. STOP repeating this action.\n` +
          `2. Either provide DIFFERENT parameters, or call ACTION: finish if the task is done.`,
          `THOUGHT: I have been repeating the same action. I must change my approach.`
        );
        if (lastActionRepeat >= 4) return { success: false, response: msg, history };
        continue;
      }
    } else { lastActionSig = sig; lastActionRepeat = 0; }

    // ── No-progress guard ────────────────────────────────────────────────────
    if (['list_files', 'read_file', 'bulk_read'].includes(action)) {
      listFilesCount++;
      if (listFilesCount >= 3 && step > 5) {
        console.warn('[DevAgent] No-progress loop.');
        pushNudge(history,
          `You have read/listed files ${listFilesCount} times with no writes.\n\n` +
          `1. STOP scanning.\n` +
          `2. Use ACTION: write_file NOW to implement the required code.`,
          `THOUGHT: I have been scanning without writing. I must start implementing.`
        );
        if (onStep) onStep({ type: 'status', text: 'Nudging: must write files now.' });
        logInfo('nudge', 'No-progress guard triggered', { step, action, listFilesCount });
        continue;
      }
    } else if (['write_file', 'replace_in_file', 'bulk_write', 'apply_blueprint', 'scaffold_project'].includes(action)) {
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
        formatRecoveryCount++;
        console.warn(`[DevAgent] FORMAT RECOVERY injected (${formatRecoveryCount})`);
        const nextAction = isReview ? 'write_file' : 'write_file';
        pushFormatRecovery(history, rawText, parsed.error, nextAction);
        logInfo('format_recovery', 'Injected format recovery block', { step, error: parsed.error });
        if (onStep) onStep({ type: 'status', text: 'Format recovery: re-anchoring model output format...' });
      } else {
        // Non-garbled chain error (orphaned code block, bad JSON) — use nudge
        pushNudge(history,
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
            !c.includes('walkthrough.md');
        });
      }
      if (!agentState.planWritten) {
        agentState.planWritten = history.some(m => {
          const c = (m.content || '').toLowerCase();
          return m.role === 'user' && c.includes('tool result') &&
            ['write_file', 'bulk_write', 'scaffold_project'].some(t => c.includes(t)) &&
            c.includes('walkthrough.md') && !c.includes('walkthrough_review_report');
        });
      }

      const isUpdateTask = history.some(m => {
        const c = (m.content || '').toLowerCase();
        return m.role === 'user' &&
          ['generate', 'update', 'modify', 'fix', 'add', '[workflow: update]'].some(kw => c.includes(kw));
      });

      // ── Premature finish guard ─────────────────────────────────────────────
      if (isUpdateTask && (!agentState.codeModified || !agentState.planWritten) && step < 10 && !isReview) {
        prematureFinishCount++;
        console.warn(`[DevAgent] Premature finish (${prematureFinishCount}/3)`);
        if (prematureFinishCount < 3) {
          const what = !agentState.codeModified ? 'write source code files' : 'write walkthrough.md';
          pushNudge(history,
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
      if (!isReview && isFollowReview && (!history.some(m => (m.content || '').toLowerCase().includes('read_file') && m.content.toLowerCase().includes('walkthrough_review_report.md')) || !agentState.codeModified)) {
        followReviewNudgeCount++;
        console.warn(`[DevAgent] Follow-review nudge (${followReviewNudgeCount}/3)`);
        if (followReviewNudgeCount >= 3) return { success: false, response: 'Aborted: refused to address [CODE: NOT OK] after 3 nudges.', history };
        pushNudge(history,
          `The reviewer issued [CODE: NOT OK].\n\n` +
          `1. Call ACTION: read_file with walkthrough_review_report.md\n` +
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
            return c.includes('walkthrough_review_report.md') && (
              c.includes('file written') || c.includes('file updated') || c.includes('written successfully') ||
              (c.includes('tool result') && !c.includes('error') && !c.includes('blocked'))
            );
          });
        }

        if (!agentState.reportSaved) {
          reviewNudgeCount++;
          console.warn(`[DevAgent] Report missing (${reviewNudgeCount}/3)`);
          if (reviewNudgeCount >= 3) return { success: false, response: 'Review aborted: refused to write report after 3 nudges.', history };
          // ── BLOCK RESPONSE: smooth nudge pair ───────────────────────────
          pushNudge(history,
            `You must write the review report before finishing.\n\n` +
            `1. ACTION: write_file\n` +
            `2. PARAMETERS: { "path": "walkthrough_review_report.md", "content": "## AGENT Reasoning\\n...\\n## Summary\\n..." }\n\n` +
            `Do this NOW. Include your full audit findings.`,
            `THOUGHT: I need to save my review findings to walkthrough_review_report.md before I can finish.`
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
          pushNudge(history,
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
          pushNudge(history,
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
              if (cUpper.includes('WRITE_FILE') && cUpper.includes('WALKTHROUGH_SYSTEM_ANALYSIS_REPORT.MD')) {
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

          pushNudge(history,
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
            const reportPath = path.resolve(effectiveWorkspaceDir, 'walkthrough_system_analysis_report.md');
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
                if (m.role === 'assistant' && (m.content || '').toUpperCase().includes('WALKTHROUGH_SYSTEM_ANALYSIS_REPORT.MD')) {
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

                pushNudge(history,
                  `FORENSIC AUDIT FAILED:\n${directive}\n` +
                  `1. REMOVE all "Ghost Folders" or "Ghost Files" from your report. Only include what physically exists.\n` +
                  `2. ENSURE the Technology Stack is a 1:1 match with package.json (no extra, no missing).\n` +
                  `3. UPDATE walkthrough_system_analysis_report.md with the corrected, real-world data immediately via write_file.`,
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

          pushNudge(history,
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
            return (c.includes('walkthrough.md') || c.includes('plan.md')) && (
              c.includes('file written') || c.includes('file updated') || c.includes('tool result (write_file)')
            );
          });
        }

        if (!agentState.planWritten) {
          planNudgeCount++;
          console.warn(`[DevAgent] Walkthrough missing (${planNudgeCount}/3)`);
          if (planNudgeCount >= 3) return { success: false, response: 'Generation aborted: refused to write walkthrough.md after 3 nudges.', history };

          pushNudge(history,
            `You must write a summary of your implementations to walkthrough.md before finishing.\n\n` +
            `1. ACTION: write_file\n` +
            `2. PARAMETERS: { "path": "walkthrough.md", "content": "# Project Walkthrough\\n\\n## Changes\\n- Feature X\\n- Fix Y\\n..." }\n\n` +
            `This is mandatory for every task. Do it NOW.`,
            `THOUGHT: I must document my implemented changes in walkthrough.md before I can finish.`
          );
          if (onStep) onStep({ type: 'status', text: 'Nudging: must write walkthrough.md first.' });
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
          pushNudge(history,
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
          const reportPath = path.join(effectiveWorkspaceDir, 'walkthrough_system_analysis_report.md');
          if (fs.existsSync(reportPath)) {
            const reportContent = fs.readFileSync(reportPath, 'utf8');
            finalMsg = `${finalMsg}\n\n---\n\n${reportContent}`;
          }
        } catch (e) {
          console.warn('[DevAgent] Failed to read analysis report for final response:', e.message);
        }
      }

      if (onStep) onStep({ type: 'response', content: finalMsg });
      return { success: true, response: finalMsg, history };
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
      pushNudge(history,
        `You attempted to use "${action}", but it is restricted in ${mode.toUpperCase()} mode.\n\n` +
        `Please ONLY use: ${allowedNames.join(', ')}`,
        `THOUGHT: I used a tool that I'm not allowed to use in this mode. I will switch to using an authorized tool.`
      );
      continue;
    }

    const toolFn = TOOLS[action];
    if (onStep) onStep({ type: 'tool_call', tool: action, parameters: parsed.parameters });
    logInfo('tool_call', `Calling tool "${action}"`, {
      step,
      action,
      parameters: redactForInfoLog(parsed.parameters || {})
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
        ok = ['write_file', 'replace_in_file'].includes(action) && /walkthrough_review_report\.md$/i.test(ap);
        allowedPath = 'walkthrough_review_report.md';
        modeLabel = 'REVIEW';
      } else if (isAnalysis) {
        ok = ['write_file', 'replace_in_file'].includes(action) && /walkthrough_system_analysis_report\.md$/i.test(ap);
        allowedPath = 'walkthrough_system_analysis_report.md';
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

        pushNudge(history,
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
          pushNudge(history,
            `You wrote to "${ap}" at workspace root but should write to "${expected}".\n\n` +
            `1. Rewrite to: ACTION: write_file -> PARAMETERS: { "path": "${expected}", ... }`,
            `THOUGHT: I used the wrong path. I must prefix with the project name.`
          );
          if (onStep) onStep({ type: 'tool_error', tool: action, error: `Wrong path: use ${expected}` });
          continue;
        }
      }

      if (action.includes('delete') || action.includes('remove')) {
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
        if (lp.includes('walkthrough_system_analysis_report.md') && p.content.includes('\\n')) {
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
      result = await toolFn(p, toolBaseDir);

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
          if (lp.includes('walkthrough_review_report.md') || lp.includes('walkthrough_system_analysis_report.md')) {
            agentState.reportSaved = true;
            console.log('[DevAgent] agentState.reportSaved = true');
          } else if (lp.includes('walkthrough.md')) {
            agentState.planWritten = true;
            console.log('[DevAgent] agentState.planWritten = true');
          } else {
            agentState.codeModified = true;
          }
        }
        if (action === 'bulk_write' || action === 'apply_blueprint') agentState.codeModified = true;
      }

      if (onStep) onStep({ type: 'tool_result', tool: action, result });
      logInfo('tool_result', `Tool "${action}" completed`, {
        step,
        action,
        ok: !result?.error,
        error: result?.error || null
      });

    } catch (toolErr) {
      console.error(`[DevAgent] ${action} failed:`, toolErr.message);
      logError('tool_execution_error', toolErr.message, { action, parameters: parsed.parameters }, parsed.thought);
      result = { error: toolErr.message };
      if (onStep) onStep({ type: 'tool_error', tool: action, error: toolErr.message });
      logInfo('tool_result', `Tool "${action}" failed`, { step, action, ok: false, error: toolErr.message });
    }

    if (signal?.aborted) {
      const s = summariseResult(action, parsed.parameters || {}, result, isReview);
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
          pushNudge(history,
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
    const summary = summariseResult(action, parsed.parameters || {}, result, isReview);
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

    history.push({ role: 'user', content });
    console.log(`[DevAgent] STEP ${step} DONE.`);
  }

  const timeout = `Agent reached MAX_STEPS (${MAX_STEPS}). Increase AGENT_MAX_STEPS or simplify the task.`;
  console.error('[DevAgent]', timeout);
  if (onStep) onStep({ type: 'error', message: timeout });
  return { success: false, response: timeout, history };
}

module.exports = { runAgent };