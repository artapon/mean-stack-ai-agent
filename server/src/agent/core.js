const axios = require('axios');
const { StringDecoder } = require('string_decoder');
const path = require('path');
const fs = require('fs-extra');
const { readFile, writeFile, listFiles, bulkWrite, applyBlueprint, bulkRead, replaceInFile } = require('../tools/filesystem');
const { scaffoldProject } = require('../tools/scaffolder');
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
 * @param {boolean} isReview
 * @returns {string}
 */
function loadSkills(isReview) {
  const agentDir = __dirname;
  const read = (filename) => {
    try {
      const p = path.join(agentDir, filename);
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
    } catch (e) {
      console.warn(`[DevAgent] Could not load ${filename}:`, e.message);
      return '';
    }
  };
  return [read('skill.md'), isReview ? read('review.md') : read('developer.md')]
    .filter(Boolean).join('\n\n---\n\n');
}

/**
 * Builds the full system prompt.
 * @param {boolean} isReview
 * @param {string}  [targetFolder]
 * @param {boolean} [fastMode]
 * @param {boolean} [autoRequestReview]
 * @returns {string}
 */
function getSystemPrompt(isReview, targetFolder, fastMode = false, autoRequestReview = false) {
  const EXPERT_SKILLS = loadSkills(isReview);

  const toolsList = [
    { name: 'read_file', params: '{path}', safe: true },
    { name: 'write_file', params: '{path, content}', safe: false },
    { name: 'replace_in_file', params: '{path, search, replace}', safe: false },
    { name: 'bulk_write', params: '{files:[{path,content}]}', safe: false },
    { name: 'apply_blueprint', params: '{content}', safe: false },
    { name: 'list_files', params: '{path}', safe: true },
    { name: 'bulk_read', params: '{paths:[]}', safe: true },
    { name: 'scaffold_project', params: '{type, name}', safe: false },
    { name: 'order_fix', params: '{instructions}', safe: true },
    { name: 'request_review', params: '{}', safe: true }
  ];

  const availableTools = toolsList
    .filter(t => !isReview || t.safe || t.name === 'write_file')
    .map(t => `  ${t.name.padEnd(16)} ${t.params}`)
    .join('\n');

  return `${EXPERT_SKILLS && !fastMode ? EXPERT_SKILLS + '\n\n---\n\n' : ''}You are an expert MEAN Stack agentic AI developer.
${isReview
      ? 'You are currently in REVIEW MODE. AUDIT the codebase. ONLY use write_file for walkthrough_review_report.md.'
      : 'Your primary goal is to MODIFY THE FILESYSTEM using tools — never describe code.'}
${targetFolder ? `\nCURRENT WORKSPACE ROOT: "${targetFolder}"` : ''}

TOOLS:
${availableTools}

TOOL CALL FORMAT (MANDATORY & RIGID):
${fastMode
      ? `ACTION: (tool name)\n\nPARAMETERS: (JSON)\n\nDO NOT OUTPUT THOUGHT IN FAST MODE.`
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
3. ALWAYS use tools to write files. Never output code blocks in plain text.
4. JSDoc 3.0 on every method.
5. Modular Express: src/modules/<feature> / Route -> Controller -> Service -> Model.
6. NO placeholders. Write full working code.
7. NO shell commands in write_file.
8. Single action per response — ONE THOUGHT + ONE ACTION + ONE PARAMETERS block.
${fastMode ? '9. FAST MODE: No THOUGHT block at all.' : ''}
${autoRequestReview ? '9. Call request_review once after all code + walkthrough.md, before finish.' : ''}
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
    /ACTION[A-Z]{3,}ETERS/i.test(raw) ||                    // ACTIONARAMETERS, ACTIONMETERS etc.
    /(?:ACTION[A-Z]*METERS[:\s]*){2,}/i.test(raw) ||        // repeated merged markers
    /^(?:\d+\.\s*)?ACTION[A-Z]+METERS/im.test(raw) ||       // numbered ACTIONARAMETERS
    /^(ACTION[A-Z]*ETERS:[A-Z:]{10,})/i.test(raw.trim())    // pure garbage stream
  );
}


// ── Sanitize raw model reply ───────────────────────────────────────────────────
/** @param {string} raw @returns {string} */
function sanitizeRawReply(raw) {
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
    .replace(/(\n\nACTION:\s*\w+)\s*\n+(?=(?:```[a-z]*\s*)?\{)/gi, '$1\n\nPARAMETERS: ')
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
    return { action: 'finish', response: json ? (json.response || json.message || cleanResponse) : cleanResponse, thought };
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


// ── LM Studio streaming call ───────────────────────────────────────────────────
/**
 * @param {Array}       history
 * @param {Function}    onChunk
 * @param {AbortSignal} signal
 * @param {string}     [selectedModel]
 * @returns {Promise<string>}
 */
async function callLMStudio(history, onChunk, signal, selectedModel) {
  const baseUrl = (process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234').replace(/\/$/, '');
  const model = selectedModel || process.env.LM_STUDIO_MODEL || 'openai/gpt-oss-20b';
  console.log(`[DevAgent] API -> ${baseUrl} | model: "${model}"`);

  const messages = history.map(m => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
  }));

  try {
    const response = await axios.post(
      `${baseUrl}/v1/chat/completions`,
      { model, messages, stream: true, temperature: 0.1, max_tokens: 8192, stop: null },
      { headers: { 'Content-Type': 'application/json' }, responseType: 'stream', timeout: 120000, signal }
    );

    let fullText = '', buffer = '';
    const decoder = new StringDecoder('utf8');

    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('AbortSignal triggered'));

      // Rolling 90s stall timeout — resets on every chunk
      let stallTimer = setTimeout(() => {
        console.error('[DevAgent] Stream stalled 90s. Destroying.');
        response.data.destroy();
        reject(new Error('Stream stalled: no data for 90 seconds.'));
      }, 90000);
      const resetStall = () => {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          response.data.destroy();
          reject(new Error('Stream stalled mid-response: 90 seconds silence.'));
        }, 90000);
      };

      const onAbort = () => { clearTimeout(stallTimer); response.data.destroy(); reject(new Error('AbortSignal triggered')); };
      if (signal) signal.addEventListener('abort', onAbort);

      response.data.on('data', (chunk) => {
        if (signal?.aborted) return;
        resetStall();
        buffer += decoder.write(chunk);
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t || !t.startsWith('data: ')) continue;
          const ds = t.replace('data: ', '');
          if (ds.trim() === '[DONE]') continue;
          try {
            const content = extractReply(JSON.parse(ds));
            if (content) { fullText += content; onChunk?.(content); }
          } catch (_) { }
        }
      });

      response.data.on('end', () => {
        clearTimeout(stallTimer);
        if (signal) signal.removeEventListener('abort', onAbort);
        if (buffer.trim().startsWith('data: ')) {
          try {
            const ds = buffer.trim().replace('data: ', '');
            if (ds !== '[DONE]') { const c = extractReply(JSON.parse(ds)); if (c) fullText += c; }
          } catch (_) { }
        }
        resolve(fullText);
      });

      response.data.on('error', (err) => {
        clearTimeout(stallTimer);
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(err);
      });
    });
  } catch (err) {
    if (['AbortError', 'canceled', 'AbortSignal triggered'].some(s => err.name === s || err.message === s)) {
      throw new Error('Agent stopped by user.');
    }
    if (err.code === 'ECONNABORTED') throw new Error('LM Studio timed out (2m).');
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND')
      throw new Error(`Cannot reach LM Studio at ${baseUrl}.`);
    throw err;
  }
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
  if (action === 'list_files') return `Listed: ${result?.filesList?.length || 0} files. ${isReview ? 'Read relevant files.' : 'Read and implement.'}`;
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
  const { messages, workspaceDir, onStep, signal, fastMode = false, autoRequestReview = false } = opts;
  const selectedModel = opts.selectedModel || null;

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const lastContent = lastUserMsg?.content || '';
  const isReview = lastContent.includes('[MODE: REVIEW]');

  // Target folder resolution
  let effectiveWorkspaceDir = workspaceDir, targetFolderName = '';
  const targetMatch = lastContent.match(/\[TARGET FOLDER:\s*([^\]]+)\]/);
  if (targetMatch) {
    const tp = targetMatch[1].trim();
    const res = path.resolve(workspaceDir, tp.replace(/^[\/\\]+/, ''));
    if (tp && tp !== '.' && res.toLowerCase().startsWith(workspaceDir.toLowerCase())) {
      effectiveWorkspaceDir = res; targetFolderName = tp;
      console.log(`[DevAgent] TARGET FOLDER: "${tp}"`);
    }
  }

  // Model resolution
  let modelConfig = {};
  try {
    const mp = path.join(__dirname, 'models.json');
    if (fs.existsSync(mp)) modelConfig = JSON.parse(fs.readFileSync(mp, 'utf-8')).config || {};
  } catch (e) { console.warn('[DevAgent] models.json:', e.message); }

  const resolvedModel = (isReview ? modelConfig.review : modelConfig.dev)
    || selectedModel || process.env.LM_STUDIO_MODEL || modelConfig.global || 'openai/gpt-oss-20b';

  console.log(`[DevAgent] Model: "${resolvedModel}" | ${isReview ? 'REVIEW' : 'DEV'} | fast:${fastMode}`);
  // Fire-and-forget info log (logger is internally try/catch guarded).
  logInfo('agent_start', 'Agent run started', {
    model: resolvedModel,
    mode: isReview ? 'review' : 'dev',
    fastMode: !!fastMode,
    workspaceDir,
    targetFolder: targetFolderName || '',
    maxSteps: Number(process.env.AGENT_MAX_STEPS) || 50
  });

  const systemPrompt = getSystemPrompt(isReview, targetFolderName, fastMode, autoRequestReview);
  const MAX_STEPS = Number(process.env.AGENT_MAX_STEPS) || 50;

  let lastScaffoldedName = '';
  let step = 1, listFilesCount = 0, lastActionSig = null, lastActionRepeat = 0;

  // ── Escape counters — all nudge branches have hard abort limits ────────────
  let chainErrorCount = 0;
  let reviewNudgeCount = 0;
  let reviewRequestNudgeCount = 0;
  let prematureFinishCount = 0;
  let followReviewNudgeCount = 0;
  let reviewWriteBlockCount = 0;
  let formatRecoveryCount = 0;  // NEW: tracks pushFormatRecovery() calls

  // ── Persistent state — survives history pruning ────────────────────────────
  const agentState = {
    reportSaved: false,
    reviewRequested: false,
    codeModified: false,
    planWritten: false,
  };

  let history = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : String(m.content) }))
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  while (step < MAX_STEPS) {
    step++;
    console.log(`\n[DevAgent] STEP ${step} | History: ${history.length}`);

    // ── History pruning — retain report/review evidence entries ─────────────
    const MAX_HISTORY = fastMode ? 20 : 50;
    if (history.length > MAX_HISTORY) {
      const essential = history.slice(0, 2);
      const recent = history.slice(fastMode ? -5 : -20);
      const toolResults = history.slice(2, fastMode ? -5 : -20).filter(m =>
        m.role === 'user' && m.content && (
          m.content.startsWith('Tool result') ||
          m.content.toLowerCase().includes('walkthrough_review_report') ||
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
      rawText = await callLMStudio(history, (chunk) => {
        if (!onStep) return;
        stepFull += chunk;
        let clean = stepFull
          .replace(/ACTION:\s*[\w_]*/gi, '')
          .replace(/PARAMETERS:\s*\{[\s\S]*?\}/gi, '')
          .replace(/PARAMETERS:\s*\{[\s\S]*/gi, '');
        if (fastMode) clean = clean.replace(/THOUGHT:\s*[\s\S]*?(?=ACTION:|$)/gi, '');
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
      return { success: true, response: rawText };
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
        if (lastActionRepeat >= 4) return { success: false, response: msg };
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
        return { success: false, response: msg };
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
        if (followReviewNudgeCount >= 3) return { success: false, response: 'Aborted: refused to address [CODE: NOT OK] after 3 nudges.' };
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
          if (reviewNudgeCount >= 3) return { success: false, response: 'Review aborted: refused to write report after 3 nudges.' };
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
          if (reviewNudgeCount >= 3) return { success: false, response: 'Review aborted: refused to include verdict after 3 nudges.' };
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

      // ── Auto review-request guard ─────────────────────────────────────────
      if (autoRequestReview && !isReview) {
        if (!agentState.reviewRequested) {
          agentState.reviewRequested = history.some(m => {
            const c = (m.content || '').toLowerCase();
            return c.includes('request_review') && (c.includes('tool result') || c.includes('logged'));
          });
        }
        if (!agentState.reviewRequested) {
          reviewRequestNudgeCount++;
          console.warn(`[DevAgent] request_review nudge (${reviewRequestNudgeCount}/3)`);
          if (reviewRequestNudgeCount >= 3) return { success: false, response: 'Aborted: refused to call request_review after 3 nudges.' };
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
      const finalMsg = parsed.response || '';
      if (onStep) onStep({ type: 'response', content: finalMsg });
      return { success: true, response: finalMsg };
    }

    // ── Execute tool ──────────────────────────────────────────────────────────
    action = (parsed.action || '').toLowerCase();
    const toolFn = TOOLS[action];
    if (!toolFn) {
      const errMsg = `Unknown tool "${action}". Available: ${Object.keys(TOOLS).join(', ')}`;
      console.error('[DevAgent]', errMsg);
      logInfo('tool_error', errMsg, { step, action });
      if (onStep) onStep({ type: 'tool_error', tool: action, error: errMsg });
      pushNudge(history,
        `Tool "${action}" does not exist.\n\nAvailable tools: ${Object.keys(TOOLS).join(', ')}\n\nChoose a valid tool and try again.`,
        `THOUGHT: I used an invalid tool name. I must use one of the available tools.`
      );
      continue;
    }

    if (onStep) onStep({ type: 'tool_call', tool: action, parameters: parsed.parameters });
    logInfo('tool_call', `Calling tool "${action}"`, {
      step,
      action,
      parameters: redactForInfoLog(parsed.parameters || {})
    });

    // ── Review mode write restrictions ────────────────────────────────────────
    const writeTools = ['write_file', 'replace_in_file', 'bulk_write', 'apply_blueprint', 'scaffold_project'];
    if (isReview && writeTools.includes(action)) {
      const p = parsed.parameters || {};
      const ap = String(p.path || p.file || p.filename || p.filepath || p.target || '').toLowerCase();
      const ok = action === 'write_file' && /walkthrough_review_report\.md$/i.test(ap);
      if (!ok) {
        reviewWriteBlockCount++;
        const blocked = `"${action}" to "${ap}" is blocked in REVIEW mode.`;
        console.warn(`[DevAgent] BLOCKED (${reviewWriteBlockCount}/2)`);
        if (reviewWriteBlockCount >= 2) {
          pushNudge(history,
            `You have attempted unauthorized writes in REVIEW mode ${reviewWriteBlockCount} times.\n\n` +
            `1. STOP writing to source files.\n` +
            `2. Call ACTION: finish now.`,
            `THOUGHT: I have been trying to write files in review mode. I must stop and finish.`
          );
          continue;
        }
        pushNudge(history,
          `${blocked}\n\nIn REVIEW mode you may ONLY use write_file for walkthrough_review_report.md.\n\n` +
          `1. If you have not written the report yet: ACTION: write_file -> walkthrough_review_report.md\n` +
          `2. If you have written it: ACTION: finish`,
          `THOUGHT: I tried to write a file I'm not allowed to in review mode. I must write the report instead.`
        );
        if (onStep) onStep({ type: 'tool_error', tool: action, error: blocked });
        continue;
      }
    }

    let result;
    try {
      const p = parsed.parameters || {};

      // Path prefix deduplication
      if (targetFolderName) {
        if (action === 'scaffold_project') p.flat = true;
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
        const sm = p.content.match(/^\s*(mkdir|cd|npm|node|git|rm|cp|mv|ls)\s+|^#!(\/usr\/bin\/env|\/bin\/bash)/i);
        if (sm) throw new Error(`write_file used as shell: "${sm[1] || 'shebang'}". Use scaffold_project.`);
      }

      result = await toolFn(p, effectiveWorkspaceDir);

      if (action === 'list_files' && result.filesList) {
        console.log(`[DevAgent] listed ${result.filesList.length} files`);
        console.log('  ' + result.filesList.slice(0, 30).join('\n  '));
      }

      // ── Update agentState immediately after confirmed success ─────────────
      if (!result?.error) {
        const lp = String(p.path || p.file || '').toLowerCase();
        if (action === 'request_review') {
          agentState.reviewRequested = true;
          console.log('[DevAgent] agentState.reviewRequested = true');
        } else if (writeTools.includes(action)) {
          if (lp.includes('walkthrough_review_report.md')) {
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
        try {
          const lp = path.resolve(workspaceDir, 'agent-handoff.log');
          await fs.ensureDir(path.dirname(lp));
          await fs.appendFile(lp, `\n[${new Date().toLocaleString()}] REVIEWER:\n${r}\n${'-'.repeat(40)}\n`, 'utf-8');
        } catch (_) { }
      }
    }

    // replace_in_file failure: inject actual content to break retry loop
    if (action === 'replace_in_file' && result?.error) {
      const tp = (parsed.parameters || {}).path || (parsed.parameters || {}).file;
      if (tp) {
        try {
          const actual = await fs.readFile(path.resolve(effectiveWorkspaceDir, tp.replace(/^[/\\]+/, '')), 'utf-8');
          const MAX_CH = 6000;
          const content = actual.length > MAX_CH ? actual.slice(0, MAX_CH) + '\n...[TRUNCATED]' : actual;
          result.currentFileContent =
            `CURRENT "${tp}":\n\`\`\`\n${content}\n\`\`\`\n\nSearch block NOT found. Fix whitespace/match or rewrite with write_file.`;
        } catch (_) { }
      }
    }

    // ── Append tool result to history ─────────────────────────────────────────
    const summary = summariseResult(action, parsed.parameters || {}, result, isReview);
    let content = `Tool result (${action}):\n${summary}`;

    if (['read_file', 'list_files', 'bulk_read'].includes(action)) {
      let raw = JSON.stringify(result, null, 2);
      if (raw.length > 10000) raw = raw.slice(0, 10000) + '\n...[TRUNCATED]...';
      content += `\n\nRaw Data:\n\`\`\`json\n${raw}\n\`\`\``;
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
  return { success: false, response: timeout };
}

module.exports = { runAgent };