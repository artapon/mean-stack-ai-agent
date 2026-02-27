const fs = require('fs-extra');
const path = require('path');

// Safety: prevent path traversal outside workspace
function safePath(inputPath, workspaceDir) {
  const resolvedWorkspace = path.resolve(workspaceDir);
  // Remove leading slash/backslash before resolve, but handle absolute Windows paths correctly
  const normalizedInput = inputPath.replace(/^[/\\]+/, '');
  const abs = path.resolve(resolvedWorkspace, normalizedInput);

  const isWin = process.platform === 'win32';
  const checkAbs = isWin ? abs.toLowerCase() : abs;
  const checkWork = isWin ? resolvedWorkspace.toLowerCase() : resolvedWorkspace;

  if (!checkAbs.startsWith(checkWork)) {
    throw new Error(`Access denied: "${inputPath}" is outside workspace "${resolvedWorkspace}"`);
  }
  return abs;
}

// ── read_file ─────────────────────────────────────────────────────────────────
async function readFile({ path: filePath }, workspaceDir) {
  if (!filePath) return { error: '"path" parameter is required.' };
  const abs = safePath(filePath, workspaceDir);

  if (!await fs.pathExists(abs)) return { error: `File not found: ${filePath}` };

  const stat = await fs.stat(abs);
  if (stat.isDirectory()) return { error: `"${filePath}" is a directory — use list_files.` };

  const content = await fs.readFile(abs, 'utf-8');
  return { path: filePath, content, bytes: stat.size };
}

// ── write_file ────────────────────────────────────────────────────────────────
async function writeFile(params, workspaceDir) {
  const filePath = params.path || params.file || params.filepath || params.filename;
  const content = params.content !== undefined ? params.content : (params.text || params.data || '');
  const contentStr = String(content);

  console.log(`[DevAgent] write_file called - path: "${filePath}", contentLength: ${contentStr.length}`);

  if (!filePath) return { error: '"path" parameter is required.' };

  // Safety: Prevent writing suspicious placeholders or accidental empty files
  if (contentStr.length < 10 && (contentStr.includes('...') || contentStr.includes('/*') || contentStr.trim() === '')) {
    const msg = `Rejecting write to "${filePath}": Content is suspiciously empty or contains placeholders. Please provide the FULL file content.`;
    console.warn(`[DevAgent] ${msg}`);
    return { error: msg };
  }

  const abs = safePath(filePath, workspaceDir);
  await fs.ensureDir(path.dirname(abs));
  await fs.writeFile(abs, contentStr, 'utf-8');
  console.log(`[DevAgent] Write: ${abs}`);
  return { success: true, path: filePath, bytes: Buffer.byteLength(contentStr, 'utf-8') };
}

// ── list_files ────────────────────────────────────────────────────────────────
async function listFiles({ path: dirPath = '.' } = {}, workspaceDir) {
  const abs = safePath(dirPath, workspaceDir);
  if (!await fs.pathExists(abs)) return { error: `Directory not found: ${dirPath}` };

  const SKIP = new Set(['node_modules', '.git', 'dist', '.nuxt', '.output', '.vite', '.next', '.cache', 'build', 'coverage', 'bower_components']);

  async function walk(dir, depth = 0) {
    if (depth > 5) return { items: [], flat: [] };
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const items = [];
    let flat = [];

    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      const rel = path.relative(workspaceDir, full).replace(/\\/g, '/');

      if (e.isDirectory()) {
        const sub = await walk(full, depth + 1);
        items.push({ type: 'directory', name: e.name, path: rel, children: sub.items });
        flat = flat.concat(sub.flat);
      } else {
        const stat = await fs.stat(full);
        items.push({ type: 'file', name: e.name, path: rel, size: stat.size });
        flat.push(rel);
      }
    }
    return { items, flat };
  }

  const result = await walk(abs);
  console.log(`[DevAgent] list_files: found ${result.flat.length} files in "${dirPath}"`);
  return { path: dirPath, items: result.items, filesList: result.flat };
}

// ── bulk_write ────────────────────────────────────────────────────────────────
async function bulkWrite(params, workspaceDir) {
  let files;

  if (Array.isArray(params)) {
    files = params;
  } else if (params && Array.isArray(params.files)) {
    files = params.files;
  } else if (params && params.path && params.content !== undefined) {
    files = [{ path: params.path, content: params.content }];
  } else if (params && typeof params === 'object') {
    const entries = Object.entries(params).filter(([k]) => k !== 'files');
    if (entries.length > 0 && typeof entries[0][1] === 'string') {
      files = entries.map(([p, c]) => ({ path: p, content: c }));
    }
  }

  if (!Array.isArray(files) || files.length === 0) {
    return { error: '"files" parameter must be an array of {path, content} objects.' };
  }

  const results = [];
  for (const file of files) {
    const { path: filePath, content } = file;
    const contentStr = String(content || '');

    if (!filePath || content === undefined) {
      results.push({ path: filePath || 'unknown', error: 'Path and content are required.' });
      continue;
    }

    // Safety check for bulk write content
    if (contentStr.length < 10 && (contentStr.includes('...') || contentStr.includes('/*') || contentStr.trim() === '')) {
      results.push({ path: filePath, error: 'Suspiciously empty content or placeholders detected. Write aborted for this file.' });
      continue;
    }

    try {
      const abs = safePath(filePath, workspaceDir);
      await fs.ensureDir(path.dirname(abs));
      await fs.writeFile(abs, contentStr, 'utf-8');
      console.log(`[DevAgent] BulkWrite: ${abs}`);
      results.push({ path: filePath, success: true, bytes: Buffer.byteLength(contentStr, 'utf-8') });
    } catch (err) {
      results.push({ path: filePath, error: err.message });
    }
  }

  return { success: true, results };
}

// ── apply_blueprint ──────────────────────────────────────────────────────────
async function applyBlueprint(params, workspaceDir) {
  // Ultra-robust content extraction
  let content = '';

  if (typeof params === 'string') {
    content = params;
  } else if (params && typeof params === 'object') {
    // Try standard keys first
    content = params.content || params.text || params.blueprint || params.markdown || '';

    // If empty, look for any string that contains "## " (common blueprint header)
    if (!content.trim()) {
      for (const key in params) {
        if (typeof params[key] === 'string' && params[key].includes('## ')) {
          console.log(`[DevAgent] apply_blueprint: found content in non-standard key "${key}"`);
          content = params[key];
          break;
        }
      }
    }

    // Fallback: if they sent a files array (like bulk_write), convert it on the fly
    if (!content.trim() && Array.isArray(params.files)) {
      console.log('[DevAgent] apply_blueprint: converting files array to blueprint');
      content = params.files.map(f => `## ${f.path}\n${f.content || f.text || ''}`).join('\n\n');
    }
  }

  if (!content || (typeof content === 'string' && content.trim() === '')) {
    console.error('[DevAgent] apply_blueprint error: missing content. Params:', JSON.stringify(params));
    return { error: '"content" parameter is required and cannot be empty.' };
  }

  console.log(`[DevAgent] apply_blueprint: content length=${content.length} chars`);

  const files = [];
  const lines = content.split('\n');

  // Greedy file-path scanner:
  // Searches EVERY non-code line for anything that looks like a file path.
  // A "file path" here is: optional leading junk, then  word/word/word.ext  or  word.ext
  const FILE_PATH_RE = /([a-zA-Z0-9_\-][a-zA-Z0-9._\-/]*\/[a-zA-Z0-9._\-]+\.[a-zA-Z0-9]{1,8}|[a-zA-Z0-9._\-]+\.[a-zA-Z]{2,8}(?=\s*[`*\s]|$))/;

  // Extensions we do NOT want to treat as file paths (English words, etc.)
  const IGNORE_WORDS = new Set(['e.g', 'i.e', 'etc', 'vs', 'ie', 'eg']);

  let currentPath = null;
  let inCodeBlock = false;
  let blockLines = [];

  function scanForPath(line) {
    const stripped = line.replace(/^[#*_`\s>|]+/, '').trim(); // strip markdown decorators
    const m = stripped.match(FILE_PATH_RE);
    if (!m) return null;
    const candidate = m[1];
    const ext = candidate.split('.').pop().toLowerCase();
    // Filter out common non-file words
    if (IGNORE_WORDS.has(candidate.toLowerCase())) return null;
    // Must have a plausible extension (letters only, 1-8 chars)
    if (!/^[a-z]{1,8}$/.test(ext)) return null;
    return candidate;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        blockLines = [];
      } else {
        inCodeBlock = false;
        let blockContent = blockLines.join('\n');

        // --- SMART DISCOVERY FALLBACK ---
        // If we don't have a currentPath, look INSIDE the first 3 lines of the block for a comment path
        if (!currentPath && blockContent.trim().length > 0) {
          const firstLines = blockLines.slice(0, 3);
          for (const bl of firstLines) {
            const innerMatch = bl.match(/(?:\/\/|#|\/\*|<!--)\s*([a-zA-Z0-9_\-\./]+\.[a-z]{1,8})/i);
            if (innerMatch) {
              currentPath = innerMatch[1];
              break;
            }
          }
        }
        // ---------------------------------

        if (currentPath && blockContent.trim().length > 0) {
          console.log(`[DevAgent] Blueprint: ${currentPath} (${blockContent.length} bytes)`);
          files.push({ path: currentPath, content: blockContent });
          currentPath = null;
        } else if (!currentPath && blockContent.trim().length > 0) {
          // Orphan block — scan previous non-empty lines for a path
          for (let back = i - 1; back >= Math.max(0, i - 5); back--) {
            const backPath = scanForPath(lines[back]);
            if (backPath) {
              console.log(`[DevAgent] Blueprint (back-scan): ${backPath} (${blockContent.length} bytes)`);
              files.push({ path: backPath, content: blockContent });
              break;
            }
          }
        }
      }
      continue;
    }

    if (inCodeBlock) {
      blockLines.push(raw);
    } else {
      const found = scanForPath(trimmed);
      if (found) currentPath = found;
    }
  }

  if (files.length === 0) {
    const snippet = content.slice(0, 600).replace(/\n/g, '↵ ');
    console.warn('[DevAgent] apply_blueprint failed. Content snippet:', snippet);
    return {
      error: 'No files found in content. Format each file as:\n## project/src/file.js\n```js\n// code\n```'
    };
  }

  return await bulkWrite({ files }, workspaceDir);
}

// ── bulk_read ─────────────────────────────────────────────────────────────────
async function bulkRead(params, workspaceDir) {
  let paths = [];
  if (Array.isArray(params)) paths = params;
  else if (params && Array.isArray(params.paths)) paths = params.paths;
  else if (params && typeof params === 'object') {
    // accept many shapes
    paths = params.files || params.paths || [];
  }

  if (paths.length === 0) return { error: '"paths" array is required.' };
  if (paths.length > 20) {
    console.warn(`[DevAgent] bulk_read: capping ${paths.length} paths to 20`);
    paths = paths.slice(0, 20);
  }

  const results = [];
  for (const p of paths) {
    try {
      const abs = safePath(p, workspaceDir);
      if (!await fs.pathExists(abs)) {
        results.push({ path: p, error: 'File not found' });
        continue;
      }
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) {
        results.push({ path: p, error: 'Is a directory' });
        continue;
      }
      const content = await fs.readFile(abs, 'utf-8');
      results.push({ path: p, content, success: true });
    } catch (err) {
      results.push({ path: p, error: err.message });
    }
  }
  return { success: true, results };
}

// ── replace_in_file ──────────────────────────────────────────────────────────
async function replaceInFile(params, workspaceDir) {
  const filePath = params.path || params.file;
  const { search, replace } = params;

  if (!filePath || search === undefined || replace === undefined) {
    return { error: '"path", "search", and "replace" parameters are required.' };
  }

  try {
    const abs = safePath(filePath, workspaceDir);
    if (!await fs.pathExists(abs)) return { error: `File not found: ${filePath}` };

    const content = await fs.readFile(abs, 'utf-8');

    // Robustness: Help the LLM by normalising line endings and removing trailing spaces for comparison
    function normalize(str) {
      return str.replace(/\r/g, '').split('\n').map(line => line.trimEnd()).join('\n');
    }

    const normContent = normalize(content);
    const normSearch = normalize(search);

    if (!normSearch.trim()) {
      return { error: 'The search block is empty. Please provide a substantive portion of the code to replace.' };
    }

    const firstIdx = normContent.indexOf(normSearch);
    if (firstIdx === -1) {
      // Provide a helpful snippet of what the file actually contains to help the agent fix its search block
      const snippet = content.slice(0, 500) + (content.length > 500 ? '...' : '');
      return { error: `The search block was not found in "${filePath}". Ensure exact matching. File starts with:\n${snippet}` };
    }
    const lastIdx = normContent.lastIndexOf(normSearch);
    if (firstIdx !== lastIdx) {
      return { error: `The search block corresponds to multiple locations in "${filePath}". Please provide a more unique search block.` };
    }

    // Since we found the match in normalized content, we need to apply the replacement to the ORIGINAL content
    // This is tricky because indices might shift. 
    // Simplified approach: if it's a simple match in raw content, use it.
    const rawIdx = content.indexOf(search);
    let finalContent;

    if (rawIdx !== -1) {
      finalContent = content.substring(0, rawIdx) + replace + content.substring(rawIdx + search.length);
    } else {
      // If raw match fails but normalized match succeeds, it's a whitespace jitter.
      // We'll perform a line-by-line replacement to stay safe.
      const contentLines = content.replace(/\r/g, '').split('\n');
      const searchLines = search.replace(/\r/g, '').split('\n');
      const replaceLines = replace.replace(/\r/g, '').split('\n');

      let matchStart = -1;
      for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
        let match = true;
        for (let j = 0; j < searchLines.length; j++) {
          if (contentLines[i + j].trimEnd() !== searchLines[j].trimEnd()) {
            match = false;
            break;
          }
        }
        if (match) {
          matchStart = i;
          break;
        }
      }

      if (matchStart === -1) {
        return { error: `Surgical edit failed: Search block found with normalization but exact line match failed. Check indentation.` };
      }

      contentLines.splice(matchStart, searchLines.length, ...replaceLines);
      finalContent = contentLines.join('\n');
    }

    // Safety check for empty results
    if (finalContent.trim() === '' && content.trim() !== '') {
      return { error: "Update rejected: result would be an empty file." };
    }

    await fs.writeFile(abs, finalContent, 'utf-8');
    console.log(`[DevAgent] Surgical Update: ${abs}`);
    return { success: true, path: filePath, bytes: Buffer.byteLength(finalContent, 'utf-8') };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = {
  readFile,
  writeFile,
  listFiles,
  bulkWrite,
  applyBlueprint,
  bulkRead,
  replaceInFile
};




