const axios = require('axios');
const { StringDecoder } = require('string_decoder');
const path = require('path');
const fs = require('fs-extra');
const { readFile, writeFile, listFiles, bulkWrite, applyBlueprint, bulkRead, replaceInFile } = require('../tools/filesystem');
const { scaffoldProject } = require('../tools/scaffolder');
const { logError } = require('../utils/logger');


// ── System prompt & Skills ─────────────────────────────────────────────────
/**
 * Loads the agent's skill files dynamically based on the current mode.
 * Combines global skill.md with developer.md (Generate) or review.md (Review).
 * @param {boolean} isReview - Whether the agent is in Review mode.
 * @returns {string} Combined skill content to inject into the system prompt.
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
  const global = read('skill.md');
  const modeSkill = isReview ? read('review.md') : read('developer.md');
  return [global, modeSkill].filter(Boolean).join('\n\n---\n\n');
}

// ── Generic prompt construction ─────────────────────────────────────────────
/**
 * Builds the system prompt, injecting mode-specific skills and tool list.
 * @param {boolean} isReview - Whether the agent is in Review mode.
 * @param {string} [targetFolder] - Optional target workspace subdirectory label.
 * @returns {string} Full system prompt string.
 */
function getSystemPrompt(isReview, targetFolder) {
  const EXPERT_SKILLS = loadSkills(isReview);

  const toolsList = [
    { name: 'read_file', params: '{path}', safe: true },
    { name: 'write_file', params: '{path, content}', safe: false },
    { name: 'replace_in_file', params: '{path, search, replace}', safe: false },
    { name: 'bulk_write', params: '{files:[{path,content}]}', safe: false },
    { name: 'apply_blueprint', params: '{content}', safe: false },
    { name: 'list_files', params: '{path}', safe: true },
    { name: 'bulk_read', params: '{paths:[]}', safe: true },
    { name: 'scaffold_project', params: '{type, name}', safe: false }
  ];

  const availableTools = toolsList
    .filter(t => !isReview || t.safe || t.name === 'write_file')
    .map(t => `  ${t.name.padEnd(16)} ${t.params}`)
    .join('\n');

  return `${EXPERT_SKILLS ? EXPERT_SKILLS + '\n\n---\n\n' : ''}You are an expert MEAN Stack agentic AI developer.
${isReview ? 'You are currently in REVIEW MODE. AUDIT the codebase. You are STRICTLY AUTHORIZED to use `write_file` ONLY for `review_report.md`. DO NOT modify any other files.' : 'Your primary goal is to MODIFY THE FILESYSTEM using tools — never just describe code.'}
${targetFolder ? `\nCURRENT WORKSPACE ROOT: "${targetFolder}" (Your tool calls will be relative to this folder)` : ''}

TOOLS:
${availableTools}

TOOL CALL FORMAT (MANDATORY & RIGID):
1. THOUGHT: (Your absolute reasoning first)

2. ACTION: (The exact valid tool name only)

3. PARAMETERS: (The valid JSON object for that tool)

**CRITICAL JSON RULE**: If a parameter value (like \`content\`) spans multiple lines, you MUST use backticks (\`) instead of double quotes for that value.
**CRITICAL: NEVER MERGE THESE MARKERS. ALWAYS USE DOUBLE NEWLINES BETWEEN THEM.**

FINISH FORMAT:
1. THOUGHT: (reasoning)

2. ACTION: finish

3. PARAMETERS: { "response": "A professional markdown summary (headers, bullet points, bold text). No technical clutter." }

RULES:
1. CONTINUITY: Never stop after list_files or read_file. 
   - If GENERATE mode (default or [MODE: GENERATE]): SCAN → READ → PLAN → IMPLEMENT (write files).
   - If REVIEW mode (detected via [MODE: REVIEW]): You are a senior code auditor.
     - DO NOT modify any files. Tool access for writes is DISABLED.
     - PERFORM file-by-file analysis of the workspace in **VERY DEEP DETAIL**.
     - For each file, EXPLAIN its purpose, logic, and PROVIDE EXPERT ADVICE on best practices.
     - **SHOW EXAMPLES**: For all best practices, provide clear code snippets.
     - FINISH by providing a **simple and highly readable summary**. Use ### headers, bullet points, and bold text. No technical clutter in the final wrap-up.
2. ALWAYS use tools to create/edit files in GENERATE mode. Never output code blocks in text.
3. STRUCTURE: Always use headers (###), lists (-), and double newlines (\\n\\n) to ensure your responses are readable and well-formatted. Avoid long walls of text.
4. PLAN-THEN-BUILD: In GENERATE mode, update implementation.md first, then IMPLEMENT.
5. **MANDATORY CHAINING**: In GENERATE mode, you MUST NOT call "finish" until implementation of ALL files in your plan is complete. Sequential writing (one file at a time) is required, but you **MUST NOT STOP** after just one file if more are listed in your plan.
6. COMPLETE FILES: write full file contents — no placeholders.
7. SECURITY: include helmet, cors, rate-limit, and JWT auth in all Express apps.
8. **JSDoc 3.0**: You MUST include JSDoc 3.0 documentation (descriptions and @param tags) for EVERY method you generate.
9. **WORKSPACE ADAPTATION**: Scan existing files to identify naming conventions (e.g., "kebab-case" vs "camelCase") and folder structures. Follow them exactly.
10. **FLAT GENERATION**: If a "TARGET FOLDER" is active, do NOT create a redundant project subfolder. Put files directly in the target directory (use "flat: true" for scaffold_project and STRIP folder prefixes from manual write_file paths).
11. **ERROR RECOVERY**: If a tool returns an ERROR, you MUST change your parameters or approach. NEVER repeat the same failed tool call.
12. **NO PLACEHOLDERS & NO EMPTY FILES**: Write FULL, working code. Never write files that only contain imports, comments, or "// Implementation goes here".
13. **NO MERGED MARKERS**: Never concatenate markers (e.g., ACTIONETERS). Strictly use individual lines for THOUGHT:, ACTION:, and PARAMETERS:.
14. **NO PLACEHOLDER COMMENTS**: Never write files that only contain "// Implementation goes here" or similar. You MUST write full, working code.
15. **MODULAR EXPRESS ARCHITECTURE**: For Express.js projects, ALWAYS use the feature-based modular structure (src/modules/<feature>) and follow the "Route -> Controller -> Service -> Repository" flow. 
    - **MANDATORY**: Use dot notation for ALL logic filenames (\`<feature>.controller.js\`, \`<feature>.model.js\`, \`<feature>.routes.js\`). NEVER create bare \`<feature>.js\` files for logic.
`;
}


// ── Tools ─────────────────────────────────────────────────────────────────────
const TOOLS = {
  read_file: readFile,
  write_file: writeFile,
  replace_in_file: replaceInFile,
  bulk_write: bulkWrite,
  apply_blueprint: applyBlueprint,
  list_files: listFiles,
  bulk_read: bulkRead,
  scaffold_project: scaffoldProject
};

// ── Extract message text from standard OpenAI and LM Studio responses ─────────
function extractReply(data) {
  if (!data) return null;
  if (data.choices && data.choices[0]) {
    const choice = data.choices[0];
    if (choice.delta && choice.delta.content) return choice.delta.content;
    if (choice.message && choice.message.content) return choice.message.content;
  }
  if (Array.isArray(data.output)) {
    const msg = data.output.find(b => b.type === 'message');
    if (msg && msg.content) return msg.content;
    return data.output.map(b => b.content || '').join('').trim();
  }
  return data.output || data.response || data.text || data.content || (typeof data === 'string' ? data : null);
}

// ── Extract brace-balanced JSON from raw string ───────────────────────────────
// Uses a string-aware brace counter so that } inside quoted content values
// doesn't prematurely end extraction. Then tries three parse strategies:
//   1. Strict JSON.parse
//   2. vm.runInNewContext – handles JS object literals with unquoted keys,
//      single-quoted strings, trailing commas (qwen2.5 style output)
//   3. Trailing-comma fixup + JSON.parse
// ── Extract brace-balanced JSON from raw string ───────────────────────────────
// Uses a string-aware brace counter (supports " and ') so that } inside strings
// doesn't prematurely end extraction. Handles escaped quotes.
function extractJSON(raw) {
  if (!raw) return null;

  var i = raw.indexOf('{');
  if (i === -1) return null;

  // ── String-aware brace balancing ─────────────────────────────────────────
  var depth = 0, end = -1, inQuote = null; // null, '"', "'" or '`'
  for (var j = i; j < raw.length; j++) {
    var c = raw[j];

    // Handle Escapes
    if (c === '\\') { j++; continue; }

    // Handle Strings (Both ", ', and `)
    if (inQuote) {
      if (c === inQuote) inQuote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inQuote = c;
      continue;
    }

    // Handle Braces
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) { end = j; break; }
    }
  }

  if (end === -1) return null;
  var candidate = raw.slice(i, end + 1);

  // Strategy 1: strict JSON
  try { return JSON.parse(candidate); } catch (_) { }

  // Strategy 2: relaxed JS object literal via vm sandbox
  // Handles unquoted keys, single-quoted strings, trailing commas.
  try {
    var vm = require('vm');
    var result = vm.runInNewContext('(' + candidate + ')', Object.create(null));
    if (result && typeof result === 'object') return result;
  } catch (_) { }

  // Strategy 3: strip trailing commas or other minor junk then retry JSON.parse
  try {
    var fixed = candidate.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(fixed);
  } catch (_) { }

  // Strategy 4: Safely extract multiline `content` fields. The AI often fails to escape 
  // newlines or embeds markdown \`\`\` wrappers inside the JSON string.
  try {
    const pathMatch = candidate.match(/"?path"?\s*:\s*['"]([^'"]+)['"]/);
    if (pathMatch) {
      const contentIndex = candidate.indexOf('"content"');
      if (contentIndex !== -1) {
        const colonIndex = candidate.indexOf(':', contentIndex);
        if (colonIndex !== -1) {
          let contentStr = candidate.slice(colonIndex + 1).trim();
          let extractedContent = null;

          // Case A: content: ```javascript \n code \n ```
          const mdMatch = contentStr.match(/^```(?:[a-z]*)\n([\s\S]*?)```/i);
          if (mdMatch) {
            extractedContent = mdMatch[1];
          } else {
            // Case B: content: " \n raw unescaped code \n " or ` \n code \n `
            // Match anything inside the first quote/backtick until the last quote/backtick before a } or ,
            const rawMatch = contentStr.match(/^["'`][\s\S]*?["'`]\s*(?:,|})/);
            if (rawMatch) {
              // Extract the inner content by stripping the first and last quote-like character
              const matchedStr = rawMatch[0].trim().replace(/,$/, '').replace(/}$/, '').trim();
              extractedContent = matchedStr.slice(1, -1);
            }
          }

          if (extractedContent !== null) {
            return {
              path: pathMatch[1],
              content: extractedContent
            };
          }
        }
      }
    }
  } catch (_) { }

  return null;
}

// ── Sanitize raw model reply BEFORE parsing ───────────────────────────────
// Fixes "ACTIONETERS" and other merged marker hallucinations.
function sanitizeRawReply(raw) {
  if (!raw) return '';
  return raw
    // 1. Force markers to own lines to help regex discovery. 
    // We enforce that they start at the beginning of a line (or string) to avoid
    // hitting the word inside user string blocks (like Swagger docs).
    .replace(/(?:^|\n)(ACTION|PARAMETERS|THOUGHT):\s*/gi, (m, p1) => `\n\n${p1.toUpperCase()} `)

    // Handle Markdown Header variants: ### Action:, ### Parameters:, etc.
    .replace(/(?:^|\n)###\s*(ACTION|PARAMETERS|THOUGHT)[:\s]*/gi, (m, p1) => `\n\n${p1.toUpperCase()} `)

    // 2. Fix variants of merged markers (ACTIONMETERS, ACTIONETERS, etc.)
    .replace(/(?:^|\n)ACTION[A-Z]*METERS:[A-Z:]*/gi, '\n\nACTION: \n\nPARAMETERS:')
    .replace(/(?:^|\n)ACTION[A-Z]*AMETERS:[A-Z:]*/gi, '\n\nACTION: \n\nPARAMETERS:')
    .replace(/(?:^|\n)ACTION[A-Z]*ETERS:[A-Z:]*/gi, '\n\nACTION: \n\nPARAMETERS:')
    .replace(/(?:^|\n)ACTIONPARAMETERS:/gi, '\n\nACTION: \n\nPARAMETERS:')
    .replace(/(?:^|\n)THOUGHTACTION:/gi, 'THOUGHT: \n\nACTION:')
    .replace(/(?:^|\n)THOUGHTPARAMETERS:/gi, 'THOUGHT: \n\nPARAMETERS:')

    // 3. Cleanup spacing
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

// ── Parse full reply → { action, parameters, response, thought } ─────────────
function parseReply(rawText, isReview) {
  const raw = sanitizeRawReply(rawText);
  if (!raw) return { action: 'finish', response: '' };

  // New Stable Format: ACTION: name \n PARAMETERS: {json}
  // We use a more specific regex to avoid matching "PARAMETERS" if it appeared too close
  var actionMatch = raw.match(/(?:^|\n)ACTION:\s*([a-z_][\w_]*)/i);
  var thoughtMatch = raw.match(/(?:^|\n)THOUGHT:\s*([\s\S]*?)(?=(?:\nACTION:)|(?:^ACTION:)|\nPARAMETERS:|(?:\n$|$))/i);

  // FIX 1: Scope JSON extraction to the PARAMETERS: block that belongs to the
  // FIRST action only. Models like qwen2.5-coder output multiple ACTION blocks
  // in one response; extracting from the full string hits the wrong brace pair.
  // IMPROVED: Now also handles cases where models wrap parameters in markdown code blocks.
  // Enforced beginning-of-line matching to prevent splitting inside string content.
  var paramSection = raw;
  var paramIdx = raw.search(/(?:^|\n)PARAMETERS:\s*(?:```json\s*)?\{/i);
  if (paramIdx !== -1) {
    paramSection = raw.slice(paramIdx);
  }
  var json = extractJSON(paramSection);

  var rawAction = actionMatch ? actionMatch[1].toLowerCase() : null;
  var thought = thoughtMatch ? thoughtMatch[1].trim() : '';

  // 🔴 Hallucination Guard: If the sanitized text suggests merged markers were found
  // but there's no meaningful JSON payload, the model output was garbage.
  // We detect this by checking if the input was mostly made of repeated patterns.
  const isGarbageOutput = rawText && /^(ACTION[A-Z]*ETERS:[A-Z:]{10,}|ACTION[A-Z]*METERS:[A-Z:]{10,})/i.test(rawText.trim());
  if (isGarbageOutput) {
    return {
      action: 'chain_error',
      error: 'Your output was malformed (merged or repeated markers with no valid content). RESET and try again with the correct format: THOUGHT then ACTION then PARAMETERS.',
      thought: 'Detected hallucination/garbage output, rejecting.'
    };
  }

  // Whitelist check
  function getSafeAction(name) {
    if (!name) return null;
    var n = name.toLowerCase();
    if (n === 'finish' || n === 'final') return 'finish';
    if (TOOLS[n]) return n;
    return null;
  }

  var action = getSafeAction(rawAction);

  // Fallback: Check if it's a <|channel|> legacy token (for transition period)
  if (!action) {
    var legacyMatch = raw.match(/<\|channel\|>\s*([\w]+)(?:\s+to=([\w:_]+))?/i);
    if (legacyMatch) {
      var marker = legacyMatch[1].toLowerCase();
      var target = (legacyMatch[2] || '').toLowerCase().replace(/^tool:/, '');
      if (marker === 'final') action = 'finish';
      else if (target && TOOLS[target]) action = target;
      else if (TOOLS[marker]) action = marker;
    }
  }

  // Fallback: check raw JSON if no ACTION: tag found
  if (!action && json && json.action) {
    action = getSafeAction(json.action);
  }

  if (action === 'finish') {
    let cleanResponse = raw;
    if (!json || (!json.response && !json.message)) {
      // Strip tags to get the clean text if the model didn't use a JSON response field
      // We use a more robust global search to clean up all potential tags
      // Special: ALWAYS Preserve THOUGHTs for transparency (formerly review-only)
      cleanResponse = raw
        .replace(/ACTION:\s*[\w_]+/gi, '')
        .replace(/PARAMETERS:\s*\{[\s\S]*?\}?/gi, '')
        .replace(/THOUGHT:\s*[\s\S]*?(?=ACTION:|$)/gi, '') // This line stays for THE FINISHED MSG, but thoughts were already extracted
        .replace(/\n\s*\n\s*\n+/g, '\n\n') // Collapse excessive newlines
        .trim();
      // If we stripped everything, fall back to the raw text
      if (!cleanResponse) cleanResponse = raw;
    }

    return {
      action: 'finish',
      response: json ? (json.response || json.message || cleanResponse) : cleanResponse,
      thought: thought || (json ? json.thought : '')
    };
  }

  if (action) {
    if (!json && raw.toLowerCase().includes('parameters:')) {
      console.warn(`[DevAgent] ⚠️ ACTION "${action}" detected but PARAMETERS: JSON is unparseable.`);
      logError('parse_error', `JSON is unparseable for action "${action}"`, { rawBuffer: raw });
      return {
        action: 'chain_error',
        error: `I found ACTION: "${action}" but your PARAMETERS: block is not valid JSON. Please provide valid JSON using double quotes for keys and strings. Example: PARAMETERS: { "path": "index.js", "content": "..." }`,
        thought: thought || 'Detected unparseable parameters.'
      };
    }
    return { action, parameters: json || {}, thought };
  }

  // Final Fallback: if we have JSON but no clear tag, and it has an action, use it
  if (json && (json.action || json.tool)) {
    var fallbackAction = getSafeAction(json.action || json.tool);
    if (fallbackAction) {
      return { action: fallbackAction, parameters: json.parameters || json.params || json, thought: json.thought || '' };
    }
  }

  // 🔴 Detect Orphaned Code Blocks (laziness protection)
  // Skip this check in Review mode, where the model is encouraged to show snippets.
  // Also only trigger if there's NO action (if model said ACTION: it's not orphaned)
  if (raw.includes('```') && !action && !isReview && !raw.includes('ACTION:')) {
    logError('chain_error', 'Orphaned code block detected without tool call', { rawBuffer: raw });
    return {
      action: 'chain_error',
      error: 'You output a markdown code block but DID NOT use a tool (write_file/replace_in_file). STRICTLY use tools to modify the filesystem. Never just output code in text.',
      thought: thought || 'Detected orphaned code block.'
    };
  }

  // If we have a response/message but no tool call, treat as finish
  if (json && (json.response || json.message)) {
    return { action: 'finish', response: json.response || json.message, thought: json.thought || '' };
  }

  // No tool call detected at all → Plain text finish
  return { action: 'finish', response: raw, thought: '' };
}

// ── LM Studio API call (Streaming) ──────────────────────────────────────────
/**
 * Calls the LM Studio API with streaming, sending history and receiving chunks.
 * @param {Array} history - The conversation history to send.
 * @param {Function} onChunk - Callback invoked with each streamed text chunk.
 * @param {AbortSignal} signal - AbortSignal to cancel the request.
 * @param {string} [selectedModel] - Optional model ID to override the .env default.
 * @returns {Promise<string>} Full completed text response.
 */
async function callLMStudio(history, onChunk, signal, selectedModel) {
  const baseUrl = (process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234').replace(/\/$/, '');
  const model = selectedModel || process.env.LM_STUDIO_MODEL || 'openai/gpt-oss-20b';

  // Standard OpenAI messages format
  const messages = history.map(m => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
  }));

  try {
    const response = await axios.post(
      baseUrl + '/v1/chat/completions',
      {
        model: model,
        messages: messages,
        stream: true
      },
      {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'stream',
        timeout: 120000, // 2 minute timeout
        signal: signal   // 🟢 CRITICAL: Link axios to abort signal
      }
    );

    let fullText = '';
    let buffer = '';
    const decoder = new StringDecoder('utf8');

    return new Promise((resolve, reject) => {
      // If signal already aborted, reject immediately
      if (signal && signal.aborted) return reject(new Error('AbortSignal triggered'));

      const onAbort = () => {
        response.data.destroy(); // Stop the stream
        reject(new Error('AbortSignal triggered'));
      };
      if (signal) signal.addEventListener('abort', onAbort);

      response.data.on('data', (chunk) => {
        if (signal && signal.aborted) return; // Guard

        // Simple SSE line buffer logic
        // Use StringDecoder to safely handle multi-byte characters split across chunks
        buffer += decoder.write(chunk);
        const lines = buffer.split('\n');

        // Keep the last partial line in buffer
        buffer = lines.pop();

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          if (trimmedLine.startsWith('data: ')) {
            const dataStr = trimmedLine.replace('data: ', '');
            if (dataStr.trim() === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              const content = extractReply(data);
              if (content) {
                fullText += content;
                if (onChunk) onChunk(content);
              }
            } catch (e) {
              // Partial JSON might happen if a line is extremely long
            }
          }
        }
      });

      response.data.on('end', () => {
        if (signal) signal.removeEventListener('abort', onAbort);
        // Process any remaining text in buffer if it doesn't end with \n
        if (buffer.trim().startsWith('data: ')) {
          try {
            const dataStr = buffer.trim().replace('data: ', '');
            if (dataStr !== '[DONE]') {
              const data = JSON.parse(dataStr);
              const content = extractReply(data);
              if (content) fullText += content;
            }
          } catch (e) { }
        }
        resolve(fullText);
      });

      response.data.on('error', (err) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(err);
      });
    });

  } catch (err) {
    if (err.name === 'AbortError' || err.message === 'canceled' || err.message === 'AbortSignal triggered') {
      console.warn('[DevAgent] LM Studio call cancelled via AbortSignal.');
      throw new Error('Agent stopped by user.');
    }
    if (err.code === 'ECONNABORTED') {
      throw new Error('LM Studio request timed out (2m limit).');
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      throw new Error('Cannot reach LM Studio at ' + baseUrl + '. Make sure it is running.');
    }
    throw err;
  }
}




// ── Build a human-readable summary of tool result for finish message ──────────
function summariseResult(action, params, result, isReview) {
  if (result && result.error) {
    let advice = 'Check your parameters and try a different approach.';
    if (result.error.toLowerCase().includes('is a directory')) {
      advice = 'The path you provided is a DIRECTORY. You must provide a specific FILENAME (e.g. index.js) inside that directory.';
    } else if (result.error.toLowerCase().includes('not found')) {
      advice = 'Check the path carefully. Use list_files to verify the directory structure.';
    }
    return `⚠️ **Error**: ${result.error}\n\n**ADVICE**: ${advice}`;
  }

  if (action === 'scaffold_project') {
    var files = (result && result.filesCreated) ? result.filesCreated : [];
    var steps = (result && result.nextSteps) ? result.nextSteps : [];
    return '### ✅ Project Scaffolding Complete\n\n' +
      'Project **' + (params.name || '') + '** created successfully.\n\n' +
      '| File | Status |\n| :--- | :--- |\n' +
      files.map(function (f) { return '| ' + f + ' | Created |'; }).join('\n') +
      (steps.length ? '\n\n**Next Steps:**\n' + steps.map(function (s) { return '- `' + s + '`'; }).join('\n') : '');
  }

  if (action === 'bulk_write' || action === 'apply_blueprint') {
    var results = (result && result.results) ? result.results : [];
    var count = results.filter(function (r) { return r.success; }).length;
    return '### ⚡ Bulk Updates Complete\n\n' +
      'Successfully processed **' + count + '** files.\n\n' +
      '| File | Result |\n| :--- | :--- |\n' +
      results.map(function (r) { return '| ' + r.path + ' | ' + (r.success ? '✅ Success' : '❌ ' + r.error) + ' |'; }).join('\n');
  }

  if (action === 'write_file') {
    var isPlan = (params.path || '').endsWith('implementation.md');
    var nudge = isReview ? 'Analyze the changes and continue your review.' :
      (isPlan ? '🟢 **DOCUMENTATION SAVED. YOU MAY NOW FINISH.**' : 'CONTINUE to next file or FINISH by writing implementation.md to the project root.');
    return '### ✍️ File Updated\n' +
      'File **' + (params.path || '') + '** written successfully.\n\n' + nudge;
  }

  if (action === 'replace_in_file') {
    var nudge = isReview ? 'Analyze the modification and continue your review.' : 'CONTINUE to next modification or FINISH if task is complete.';
    return '### ✂️ Surgical Edit Complete\n' +
      'File **' + (params.path || '') + '** modified successfully.\n\n' + nudge;
  }

  if (action === 'read_file') {
    var nudge = isReview ? 'Content retrieved. ANALYZE and provide feedback/advice.' : 'Content retrieved. ANALYZE and proceed to PLAN or IMPLEMENT.';
    return '### 📖 File Read\n' + nudge;
  }

  if (action === 'bulk_read') {
    var results = (result && result.results) ? result.results : [];
    var count = results.filter(function (r) { return r.success; }).length;
    var nudge = isReview ? 'Retrieved **' + count + '** files. ANALYZE context and PROVIDE ADVICE now.' : 'Retrieved **' + count + '** files. ANALYZE context and UPDATE implementation.md now.';
    return '### 📚 Bulk Read Complete\n' + nudge;
  }

  if (action === 'list_files') {
    var count = (result && result.filesList) ? result.filesList.length : 0;
    var nudge = isReview ? 'Found **' + count + '** files. READ relevant files now to begin your audit.' : 'Found **' + count + '** files. READ relevant files now to build context.';
    return '### 📂 Folders Scanned\n' + nudge;
  }

  return '### ✅ Task Complete\n' +
    'All requested operations finished successfully.\n\n' +
    '**SUMMARY**: ' + (isReview ? 'Your audit is ready. Review the findings below.' : 'Your changes are live. Verify the files in the sidebar and project files panel.') + '\n\n' +
    'FINISH if everything is done.';
}

// ── ReAct agent loop ──────────────────────────────────────────────────────────
/**
 * Main agent execution loop. Drives the ReAct cycle (plan, act, observe, repeat).
 * @param {Object} opts - Agent options.
 * @param {Array} opts.messages - Conversation history.
 * @param {string} opts.workspaceDir - Root workspace directory path.
 * @param {Function} opts.onStep - Callback for streaming step events.
 * @param {AbortSignal} opts.signal - Signal to cancel the agent mid-run.
 * @param {string} [opts.selectedModel] - Optional model ID to use for this run.
 * @returns {Promise<{success: boolean, response: string}>} Final agent result.
 */
async function runAgent(opts) {
  var messages = opts.messages;
  var workspaceDir = opts.workspaceDir;
  var onStep = opts.onStep;
  var signal = opts.signal;
  var selectedModel = opts.selectedModel || null;

  // Determine mode and TARGET FOLDER from the LATEST user instruction
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const lastContent = lastUserMsg ? (lastUserMsg.content || '') : '';
  const isReview = lastContent.includes('[MODE: REVIEW]');

  // Dynamic Workspace Support: If the user pinned a folder, the UI sends [TARGET FOLDER: path]
  let effectiveWorkspaceDir = workspaceDir;
  let targetFolderName = '';
  const targetMatch = lastContent.match(/\[TARGET FOLDER:\s*([^\]]+)\]/);
  if (targetMatch) {
    const targetPath = targetMatch[1].trim();
    if (targetPath && targetPath !== '.') {
      const resolved = path.resolve(workspaceDir, targetPath.replace(/^[/\\]+/, ''));
      // Safety: Only allow targeting subfolders of the original workspace
      if (resolved.toLowerCase().startsWith(workspaceDir.toLowerCase())) {
        effectiveWorkspaceDir = resolved;
        targetFolderName = targetPath;
        console.log('\n' + '━'.repeat(60));
        console.log(`[DevAgent] 📍 TARGET FOLDER DETECTED: "${targetPath}"`);
        console.log('━'.repeat(60) + '\n');
      }
    }
  }

  const systemPrompt = getSystemPrompt(isReview, targetFolderName);

  var MAX_STEPS = Number(process.env.AGENT_MAX_STEPS) || 50;
  var step = 0;

  // FIX 3: Consecutive-duplicate-action guard. If the agent outputs the exact
  // same action+parameters 3 times in a row, it is stuck. Abort early.
  var lastActionSig = null;
  var lastActionRepeat = 0;

  // REVIEW mode write-block counter: if the model keeps trying to write files
  // even after being told it can't, force a finish after 2 blocked attempts.
  var reviewWriteBlockCount = 0;

  var history = [{ role: 'system', content: systemPrompt }].concat(messages.map(function (m) {
    return {
      role: m.role,
      content: typeof m.content === 'string' ? m.content : String(m.content)
    };
  }));

  while (step < MAX_STEPS) {
    step++;
    console.log(`\n[DevAgent] 🚀 STEP ${step} START ─── (History: ${history.length} items)`);

    // Prune history ONLY if it gets extremely long (avoid context window blowup)
    // We keep the system prompt, the original user request, and the last 30 turns
    if (history.length > 50) {
      console.log(' [DevAgent] ✂️  Pruning history for context efficiency...');
      history = history.slice(0, 2).concat(history.slice(-30));
    }

    // Only abort BEFORE an LM Studio call — never mid-execution
    if (signal && signal.aborted) {
      throw new Error('Agent stopped by user.');
    }

    var rawText;
    try {
      let stepFullText = '';
      let sentCleanTextLength = 0;

      rawText = await callLMStudio(history, function (chunk) {
        if (!onStep) return;
        stepFullText += chunk;

        // STATEFUL DELTA FILTERING:
        // We clean the ENTIRE text generated so far, then only send the "new" clean part.
        // This prevents partial tags (like "ACTI") from leaking to the UI when split across chunks.
        // IMPROVED: ALWAYS preserve thoughts for transparency (never strip them in chunks)
        let cleanAll = stepFullText
          .replace(/ACTION:\s*[\w_]*/gi, '')
          .replace(/PARAMETERS:\s*\{[\s\S]*?\}/gi, '')
          .replace(/PARAMETERS:\s*\{[\s\S]*/gi, ''); // Hide partial parameters

        let newClean = cleanAll.slice(sentCleanTextLength);
        if (newClean.length > 0) {
          onStep({ type: 'chunk', content: newClean });
          sentCleanTextLength = cleanAll.length;
        }

        // Send status updates when we are filtering out internal work
        const isInternal = stepFullText.toLowerCase().includes('action:') || stepFullText.toLowerCase().includes('parameters:') || stepFullText.toLowerCase().includes('thought:');
        if (isInternal && newClean.length === 0) {
          const type = stepFullText.toLowerCase().includes('action:') ? 'acting' : 'thinking';
          onStep({ type: 'status', text: `Agent is ${type}...` });
        }
      }, signal, selectedModel);
    } catch (apiErr) {
      var msg = 'API Error: ' + apiErr.message;
      if (apiErr.response && apiErr.response.data) {
        msg += ' - ' + JSON.stringify(apiErr.response.data);
      }
      console.error('[DevAgent] LM Studio failed:', msg);
      if (onStep) onStep({ type: 'error', message: msg });
      throw new Error(msg);
    }
    history.push({ role: 'assistant', content: rawText });

    var parsed = parseReply(rawText, isReview);
    var action = (parsed.action || '').toLowerCase();

    console.log('[DevAgent] STEP', step, 'RESPONSE ─── action:', action || 'none');
    if (rawText.length > 500) {
      console.log(rawText.slice(0, 500) + '... [TRUNCATED LOG]');
    } else {
      console.log(rawText);
    }

    if (parsed.thought && onStep) {
      onStep({ type: 'thought', content: parsed.thought });
    }

    // ── No action ─────────────────────────────────────────────────────────────
    if (!action) {
      console.warn('[DevAgent] No action detected. Forcing finish to avoid loop.');
      if (onStep) onStep({ type: 'response', content: rawText });
      return { success: true, response: rawText };
    }

    // FIX 3: Robust loop guard — detect tight loops by comparing normalized parameters.
    // We collapse whitespace and remove comments for the signature comparison to prevent
    // the model from evading the guard with minor formatting changes.
    const normalizeParams = (p) => {
      const copy = JSON.parse(JSON.stringify(p || {}));
      const textKeys = ['content', 'replace', 'search', 'text', 'blueprint'];
      textKeys.forEach(k => {
        if (typeof copy[k] === 'string') {
          // Aggressive normalization: remove all whitespace/newlines for comparison only
          copy[k] = copy[k].replace(/\s+/g, '').slice(0, 5000);
        }
      });
      return JSON.stringify(copy);
    };

    var actionSig = action + '|' + normalizeParams(parsed.parameters);
    if (actionSig === lastActionSig && action !== 'chain_error') {
      lastActionRepeat++;
      console.warn(`[DevAgent] ⚠️ Duplicate action detected (${lastActionRepeat}/3): ${action}`);
      if (lastActionRepeat >= 3) {
        var loopErr = `Agent stuck in a loop: "${action}" repeated 3 times with functionally identical parameters.`;
        var advice = `You are repeating the same ${action} call with identical content. This usually happens if you are using placeholders or waiting for a state change that hasn't happened. CHANGE your approach, provide ACTUAL content, or call finish if you are stuck.`;
        console.error('[DevAgent] 🔴 Loop guard triggered:', loopErr);
        logError('loop_guard', loopErr, { action, actionSig });
        if (onStep) onStep({ type: 'error', message: loopErr });
        history.push({ role: 'user', content: `⚠️ **Error: Loop Detected**\n\n${loopErr}\n\n**ADVICE**: ${advice}` });
        // We give it one LAST chance with the advice nudge before hard-crashing if it repeats a 4th time
        if (lastActionRepeat >= 4) return { success: false, response: loopErr };
        continue;
      }
    } else {
      lastActionSig = actionSig;
      lastActionRepeat = 0;
    }

    // ── Chain Error (Orphaned Code Block) ────────────────────────────────────
    if (action === 'chain_error') {
      console.warn('[DevAgent] ⚠️ Orphaned code block detected. Nudging agent.');
      history.push({ role: 'user', content: `Error: ${parsed.error}` });
      if (onStep) onStep({ type: 'error', message: parsed.error });
      continue;
    }

    // ── Finish ────────────────────────────────────────────────────────────────
    if (action === 'finish') {
      // 🟢 CHAINING GUARD: Prevent finishing too early in Update mode
      // FIX 2: Tightened — only fires when the finish response is nearly empty
      // AND no tool has run yet AND we're very early in the loop (step < 3).
      // The old guard (step < 8 with broad isUpdateTask) almost always fired,
      // blocking legitimate finishes and creating a secondary loop.
      const isUpdateTask = history.some(function (m) {
        var c = (m.content || '').toLowerCase();
        return m.role === 'user' && (
          c.includes('generate') || c.includes('update') || c.includes('modify') ||
          c.includes('fix') || c.includes('add') || c.includes('[workflow: update]')
        );
      });

      const hasModifiedCode = history.some(function (m) {
        var c = (m.content || '').toLowerCase();
        return m.role === 'user' && c.includes('tool result') &&
          (c.includes('write_file') || c.includes('replace_in_file') || c.includes('bulk_write') || c.includes('apply_blueprint')) &&
          !c.includes('implementation.md');
      });

      const hasWrittenPlan = history.some(function (m) {
        var c = (m.content || '').toLowerCase();
        return m.role === 'user' && c.includes('tool result') &&
          c.includes('write_file') && c.includes('implementation.md');
      });

      const isEmptyFinish = (parsed.response || '').trim().length <= 50;

      // Prevent finishing if they haven't written code OR if they forgot to document it (if early in loop)
      if (isUpdateTask && (!hasModifiedCode || !hasWrittenPlan) && step < 10 && !isReview) {
        console.warn('[DevAgent] ⚠️ Premature finish detected. Nudging agent to CONTINUE.');
        let nudge = '';
        if (!hasModifiedCode) {
          nudge = "You haven't modified any source code files yet. PROCEED TO IMPLEMENTATION (surgical edits). DO NOT FINISH yet.";
        } else if (!hasWrittenPlan) {
          nudge = "You haven't written the `implementation.md` summary to the project root yet. DO THIS NOW before finishing.";
        }

        if (nudge) {
          history.push({ role: 'user', content: nudge });
          if (onStep) onStep({ type: 'error', message: `Premature finish detected. Nudging: ${nudge}` });
          continue;
        }
      }

      // 🟢 REVIEW PERSISTENCE GUARD: Force report writing before finishing
      if (isReview) {
        const hasSavedReport = history.some(m => {
          const c = (m.content || '').toLowerCase();
          return c.includes('tool result (write_file)') && c.includes('review_report.md') && c.includes('"success": true');
        });

        if (!hasSavedReport) {
          console.warn('[DevAgent] ⚠️ Review report not found in history. Nudging agent to PERSIST.');
          const nudge = "MANDATORY: You must save your audit findings to `review_report.md` using `write_file` BEFORE calling finish. Include two sections: `## AGENT Reasoning` and `## Summary`. Do this now.";
          history.push({ role: 'user', content: nudge });
          if (onStep) onStep({ type: 'error', message: "Review report not saved yet. Persist Reasoning and Summary first." });
          continue;
        }
      }

      var finalMsg = parsed.response || '';
      if (onStep) onStep({ type: 'response', content: finalMsg });
      return { success: true, response: finalMsg };
    }

    // ── Execute tool ──────────────────────────────────────────────────────────
    action = (parsed.action || '').toLowerCase();
    var toolFn = TOOLS[action];
    if (!toolFn) {
      var errMsg = `Unknown tool "${action}". Available: ${Object.keys(TOOLS).join(', ')}`;
      console.error('[DevAgent] Tool error:', errMsg);
      logError('tool_error', errMsg, { action, parameters: parsed.parameters });
      if (onStep) onStep({ type: 'tool_error', tool: action, error: errMsg });
      history.push({ role: 'user', content: 'Error: ' + errMsg });
      continue;
    }

    if (onStep) onStep({ type: 'tool_call', tool: action, parameters: parsed.parameters });

    // ── Enforce REVIEW mode restrictions ─────────────────────────────────────
    const writeTools = ['write_file', 'replace_in_file', 'bulk_write', 'apply_blueprint', 'scaffold_project'];
    if (isReview && writeTools.includes(action)) {
      const p = parsed.parameters || {};
      const attemptedPath = String(p.path || p.file || p.filename || p.filepath || p.target || '').toLowerCase();

      // We ONLY allow write_file for review_report.md. 
      // bulk_write/replace_in_file/etc are ALWAYS blocked in Review mode.
      const isAllowedReport = action === 'write_file' && /review_report\.md$/i.test(attemptedPath);

      if (!isAllowedReport) {
        reviewWriteBlockCount++;
        const blockedMsg = `Tool "${action}" to "${attemptedPath}" is disabled in REVIEW mode inside "${effectiveWorkspaceDir}". You can ONLY use write_file for "review_report.md".`;
        console.warn(`[DevAgent] ⛔ BLOCKED: ${blockedMsg} (Attempt ${reviewWriteBlockCount}/2)`);

        if (reviewWriteBlockCount >= 2) {
          const forceMsg = `You have attempted to write to unauthorized files multiple times in REVIEW mode. You MUST call finish now.`;
          if (onStep) onStep({ type: 'tool_error', tool: action, error: forceMsg });
          history.push({ role: 'user', content: 'Error: ' + forceMsg });
          continue;
        }

        if (onStep) onStep({ type: 'tool_error', tool: action, error: blockedMsg });
        history.push({ role: 'user', content: 'Error: ' + blockedMsg });
        continue;
      }
    }

    var result;
    try {
      const p = parsed.parameters || {};

      // ── DUPLICATION PREVENTION INTERCEPT ───────────────────────────────────
      // If a specific target folder is pinned, we forcefully strip its name 
      // from any paths the AI tries to write to, preventing redundant subfolders.
      if (targetFolderName) {
        if (action === 'scaffold_project') {
          p.flat = true;
        }

        const stripPrefix = (filePath) => {
          if (!filePath || typeof filePath !== 'string') return filePath;
          const normalizedPath = filePath.replace(/\\/g, '/');
          const normalizedTarget = targetFolderName.replace(/\\/g, '/');

          if (normalizedPath === normalizedTarget) return '.';
          const prefix = normalizedTarget + '/';
          if (normalizedPath.startsWith(prefix)) {
            return normalizedPath.substring(prefix.length);
          }
          return filePath;
        };

        ['path', 'file', 'filepath', 'filename', 'target'].forEach(key => {
          if (p[key]) p[key] = stripPrefix(p[key]);
        });

        if ((action === 'bulk_write' || action === 'apply_blueprint') && Array.isArray(p.files)) {
          p.files.forEach(f => {
            ['path', 'file'].forEach(key => {
              if (f[key]) f[key] = stripPrefix(f[key]);
            });
          });
        }

        if (action === 'apply_blueprint' && typeof p.content === 'string') {
          const normalizedTarget = targetFolderName.replace(/\\/g, '/');
          const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(##\\s*)${escapeRegExp(normalizedTarget)}[/\\\\]`, 'g');
          p.content = p.content.replace(regex, '$1');
        }
      }
      // ───────────────────────────────────────────────────────────────────────

      const targetPath = p.path || p.file || (p.files ? `${p.files.length} files` : 'none');
      console.log(`[DevAgent] STEP ${step} | Executing: ${action} | Target: ${targetPath}`);

      if (action === 'write_file' && (targetPath.toLowerCase().includes('review_report.md'))) {
        const reportPath = path.resolve(effectiveWorkspaceDir, (p.path || p.file).replace(/^[/\\]+/, ''));
        console.log(`[DevAgent] 📝 SAVING REVIEW REPORT TO: ${reportPath}`);
      }
      result = await toolFn(p, effectiveWorkspaceDir);

      // ── Specific Debug Logging for list_files ──────────────────────────────
      if (action === 'list_files' && result.filesList) {
        console.log(`[DevAgent] list_files results (${result.filesList.length} files):`);
        console.log('  ' + result.filesList.slice(0, 30).join('\n  '));
        if (result.filesList.length > 30) console.log(`  ... and ${result.filesList.length - 30} more.`);
      }

      if (onStep) onStep({ type: 'tool_result', tool: action, result: result });
    } catch (toolErr) {
      console.error(`[DevAgent] ${action} failed:`, toolErr.message);
      logError('tool_execution_error', toolErr.message, { action, parameters: parsed.parameters });
      result = { error: toolErr.message };
      if (onStep) onStep({ type: 'tool_error', tool: action, error: toolErr.message });
    }

    // ── After tool: check if signal already aborted (SSE closed) ─────────────
    if (signal && signal.aborted) {
      var summary = summariseResult(action, parsed.parameters || {}, result, isReview);
      if (onStep) onStep({ type: 'response', content: summary });
      return { success: true, response: summary };
    }

    // ── replace_in_file failure: inject actual file content to break retry loop ─
    // When the search block isn't found, qwen tends to retry the same thing.
    // Showing the real file content gives it exactly what it needs to adapt.
    // NOTE: This must run BEFORE resultStr is serialised below.
    if (action === 'replace_in_file' && result && result.error) {
      const targetPath = (parsed.parameters || {}).path || (parsed.parameters || {}).file;
      if (targetPath) {
        try {
          const actualContent = await fs.readFile(
            require('path').resolve(effectiveWorkspaceDir, targetPath.replace(/^[/\\]+/, '')),
            'utf-8'
          );
          const MAX_FILE_CHARS = 6000;
          const truncated = actualContent.length > MAX_FILE_CHARS
            ? actualContent.slice(0, MAX_FILE_CHARS) + '\n... [TRUNCATED]'
            : actualContent;
          result.currentFileContent =
            `CURRENT FILE CONTENT OF "${targetPath}":\n\`\`\`\n${truncated}\n\`\`\`` +
            `\n\nINSTRUCTION: Your search block was NOT found. ` +
            `Use the current file content above and either:\n` +
            `  1. Fix your search block to match exactly, OR\n` +
            `  2. Use write_file with the COMPLETE corrected file content instead.`;
          console.log(`[DevAgent] Injected current content of "${targetPath}" into replace_in_file error feedback.`);
        } catch (_) { /* file may not exist yet — that's fine */ }
      }
    }

    // ── Safety Truncation: Prevent context window overflow ────────────────────
    var resultStr = JSON.stringify(result, null, 2);
    const MAX_RESULT_CHARS = 10000;
    if (resultStr.length > MAX_RESULT_CHARS) {
      console.log(`[DevAgent] STEP ${step} | Truncating ${action} result (${resultStr.length} chars)`);
      resultStr = resultStr.slice(0, MAX_RESULT_CHARS) +
        '\n\n... [TRUNCATED - output too large] ...';
    }

    history.push({
      role: 'user',
      content: `Tool result (${action}):\n${resultStr}`
    });
    console.log(`[DevAgent] STEP ${step} | DONE. Result sent to LLM context.`);

  }
}

module.exports = { runAgent };
