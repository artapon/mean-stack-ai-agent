const fs = require('fs-extra');
const path = require('path');
console.log(`[DevAgent] FILESYSTEM MODULE LOADED - 2026-03-07 23:55`);

// Safety: prevent path traversal outside workspace
function safePath(inputPath, workspaceDir, allowTraversal = false, rootWorkspaceDir = null) {
  const resolvedWorkspace = path.resolve(workspaceDir);
  console.log(`[DevAgent] safePath: input="${inputPath}", workspace="${workspaceDir}"`);
  const reportsRoot = rootWorkspaceDir ? path.resolve(rootWorkspaceDir) : resolvedWorkspace;

  // 1. Force string and trim
  let p = String(inputPath || '').trim();

  // 2. Aggressively strip hallucinated "/root/", leading slashes, or "./"
  // Matches: "/root/", "root/", "/", "./" at the start
  p = p.replace(/^([/\\]+root[/\\]+|root[/\\]+|[/\\]+|\.[/\\]+)/i, '');

  // 3. Special case: allow centralized reports directory
  const reportsDir = (process.env.AGENT_REPORTS_DIR || 'agent_reports').replace(/^\.[/\\]+/, '');
  const cleanReportsDir = reportsDir.toLowerCase();
  const segments = p.toLowerCase().split(/[/\\]/);
  const reportsIdx = segments.indexOf(cleanReportsDir);

  if (reportsIdx !== -1) {
    // Resolve to the configured reports directory (relative to reportsRoot, which should be the root workspace)
    const agentReportsDir = path.resolve(reportsRoot, reportsDir);
    // Extract everything after the 'agent_reports' segment
    const originalSegments = p.split(/[/\\]/);
    const remainingPath = originalSegments.slice(reportsIdx + 1).join(path.sep);
    return remainingPath ? path.join(agentReportsDir, remainingPath) : agentReportsDir;
  }

  // 4. Resolve path. On Windows, a leading slash resolves to the drive root.
  // We want it to be relative to the workspace, so we ensure it's treated as such.
  const abs = path.resolve(resolvedWorkspace, p);

  const isWin = process.platform === 'win32';
  const checkAbs = isWin ? abs.toLowerCase() : abs;
  const checkWork = isWin ? resolvedWorkspace.toLowerCase() : resolvedWorkspace;

  // Security: ensure the resolved path is actually UNDER the workspace
  // We add a trailing separator to prevent "workspace-backup" bypass
  const workWithSep = checkWork.endsWith(path.sep) ? checkWork : checkWork + path.sep;

  if (!allowTraversal && checkAbs !== checkWork && !checkAbs.startsWith(workWithSep)) {
    console.error(`[DevAgent] Path validation failed:`);
    console.error(`  Input: "${inputPath}"`);
    console.error(`  Cleaned: "${p}"`);
    console.error(`  Resolved: ${abs}`);
    console.error(`  Workspace: ${resolvedWorkspace}`);
    throw new Error(`Access denied: "${inputPath}" is outside workspace "${resolvedWorkspace}"`);
  }
  return abs;
}

// ── read_file ─────────────────────────────────────────────────────────────────
async function readFile({ path: filePath }, workspaceDir, allowTraversal = false, rootWorkspaceDir = null) {
  if (!filePath) return { error: '"path" parameter is required.' };
  const abs = safePath(filePath, workspaceDir, allowTraversal, rootWorkspaceDir);

  if (!await fs.pathExists(abs)) return { error: `File not found: ${filePath}` };

  const stat = await fs.stat(abs);
  if (stat.isDirectory()) return { error: `"${filePath}" is a directory — use list_files.` };

  const content = await fs.readFile(abs, 'utf-8');
  return { path: filePath, content, bytes: stat.size };
}

// ── write_file ────────────────────────────────────────────────────────────────
async function writeFile(params, workspaceDir, allowTraversal = false, rootWorkspaceDir = null) {
  const filePath = params.path || params.file || params.filepath || params.filename;
  const content = params.content !== undefined ? params.content : (params.text || params.data || '');
  const contentStr = String(content);
  const lp = String(filePath).toLowerCase();

  if (!filePath) return { error: '"path" parameter is required.' };

  console.log(`[DevAgent] write_file called - path: "${filePath}", contentLength: ${contentStr.length}`);

  // Safety: Prevent "Template Hallucinations" (agent trying to use JS code in markdown)
  if (lp.includes('./agent_reports/system_analysis_walkthrough.md') &&
    (contentStr.includes('JSON.stringify') || contentStr.includes('list_files(') || contentStr.includes('"+'))) {
    const msg = `Rejecting write to "${filePath}": You are trying to use Javascript code or template syntax (like JSON.stringify) in a static report. YOU MUST write the report content (like the directory tree) as MANUAL PLAIN TEXT. Refer to the EXAMPLE FORMAT in your instructions.`;
    console.warn(`[DevAgent] ${msg}`);
    return { error: msg };
  }

  // Safety: Prevent writing suspicious placeholders or accidental empty files
  const isPlaceholder = contentStr.includes('// Implementation goes here') ||
    contentStr.includes('// TODO: Implement') ||
    (contentStr.length < 15 && (contentStr.includes('...') || contentStr.trim() === ''));

  if (isPlaceholder) {
    const msg = `Rejecting write to "${filePath}": Content is suspiciously empty or contains placeholder text. You MUST provide the FULL, valid implementation for this file.`;
    console.warn(`[DevAgent] ${msg}`);
    return { error: msg };
  }

  // Safety: Prevent AI from creating misnamed architectural logic files (e.g. literally "controller.js" instead of "user.controller.js")
  const basename = path.basename(filePath).toLowerCase();
  const genericNames = ['controller.js', 'model.js', 'service.js', 'routes.js', 'validation.js', 'repository.js'];
  if (genericNames.includes(basename)) {
    const msg = `Rejecting write to "${filePath}": Invalid filename. You CANNOT name a file exactly "${basename}". You MUST use feature-based dot-notation (e.g., "patient.${basename}").`;
    console.warn(`[DevAgent] ${msg}`);
    return { error: msg };
  }

  const abs = safePath(filePath, workspaceDir, allowTraversal, rootWorkspaceDir);
  const dir = path.dirname(abs);
  const dirStat = await fs.pathExists(dir) ? await fs.stat(dir) : null;
  if (dirStat && !dirStat.isDirectory()) {
    return { error: `Cannot create directory "${dir}": A file with the same name already exists. Please delete it first.` };
  }
  await fs.ensureDir(dir);
  await fs.writeFile(abs, contentStr, 'utf-8');
  console.log(`[DevAgent] Write: ${abs}`);
  return { success: true, path: filePath, bytes: Buffer.byteLength(contentStr, 'utf-8') };
}

// ── list_files ────────────────────────────────────────────────────────────────
const ignore = require('ignore');

async function listFiles({ path: dirPath = '.' } = {}, workspaceDir, allowTraversal = false, rootWorkspaceDir = null) {
  console.log(`[DevAgent] list_files: dirPath="${dirPath}", workspaceDir="${workspaceDir}"`);
  try {
    const abs = safePath(dirPath, workspaceDir, allowTraversal, rootWorkspaceDir);
    if (!await fs.pathExists(abs)) {
      console.error(`[DevAgent] list_files FAILED: Directory not found at "${abs}" (queried as "${dirPath}")`);
      return { error: `Directory not found: ${dirPath} (Resolved to: ${abs})` };
    }

    // If the model accidentally passes a FILE path to list_files, degrade gracefully:
    const rootStat = await fs.stat(abs);
    if (!rootStat.isDirectory()) {
      const rel = path.relative(workspaceDir, abs).replace(/\\/g, '/');
      return {
        path: dirPath,
        items: [{ type: 'file', name: path.basename(abs), path: rel, size: rootStat.size }],
        filesList: [rel],
        note: 'Provided path is a file; returned a single-item listing.'
      };
    }

    const SKIP = new Set(['node_modules', '.git', 'dist', '.nuxt', '.output', '.vite', '.next', '.cache', 'build', 'coverage', 'bower_components']);

    // Load .gitignore if it exists in the workspaceDir
    const ig = ignore();
    const gitignorePath = path.join(workspaceDir, '.gitignore');
    if (await fs.pathExists(gitignorePath)) {
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
      ig.add(gitignoreContent);
      console.log(`[DevAgent] list_files: Loaded .gitignore from ${workspaceDir}`);
    }

    async function walk(dir, depth = 0) {
      if (depth > 30) return { items: [], flat: [] }; // Increased depth for deep project structures
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (e) {
        return { items: [{ type: 'error', name: path.basename(dir), path: path.relative(workspaceDir, dir).replace(/\\/g, '/'), error: e.message }], flat: [] };
      }
      const items = [];
      let flat = [];

      for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = path.relative(workspaceDir, full).replace(/\\/g, '/');

        // Check hardcoded skip list
        if (SKIP.has(e.name)) continue;

        // Check .gitignore rules if the path is within the workspace
        if (!rel.startsWith('..') && ig.ignores(rel)) {
          // console.log(`[DevAgent] list_files: Ignored by .gitignore: ${rel}`);
          continue;
        }

        if (e.isDirectory()) {
          const sub = await walk(full, depth + 1);
          items.push({ type: 'directory', name: e.name, path: rel, children: sub.items });
          flat = flat.concat(sub.flat);
        } else {
          try {
            const stat = await fs.stat(full);
            items.push({ type: 'file', name: e.name, path: rel, size: stat.size });
            flat.push(rel);
          } catch (statErr) {
            console.warn(`[DevAgent] list_files: Could not stat "${rel}": ${statErr.message}`);
          }
        }
      }
      return { items, flat };
    }

    const result = await walk(abs);
    console.log(`[DevAgent] list_files: found ${result.flat.length} files in "${dirPath}" (after filtering)`);

    // Safety: If the tree is too massive, return a compact flat list instead of a Deep JSON tree
    if (result.flat.length > 1000) {
      return {
        path: dirPath,
        filesList: result.flat,
        note: `Project is large (${result.flat.length} files). Tree-view omitted for efficiency. Use bulk_read on the paths list.`
      };
    }

    return { path: dirPath, items: result.items, filesList: result.flat };
  } catch (err) {
    return { error: err.message };
  }
}

// ── bulk_write ────────────────────────────────────────────────────────────────
async function bulkWrite(params, workspaceDir, allowTraversal = false, rootWorkspaceDir = null) {
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
    const isPlaceholder = contentStr.includes('// Implementation goes here') ||
      contentStr.includes('// TODO: Implement') ||
      (contentStr.length < 15 && (contentStr.includes('...') || contentStr.trim() === ''));

    if (isPlaceholder) {
      results.push({ path: filePath, error: 'Suspiciously empty content or placeholder text detected. You MUST provide the FULL, valid implementation for this file. Write aborted.' });
      continue;
    }

    // Safety: Prevent AI from creating misnamed architectural logic files
    const basename = path.basename(filePath).toLowerCase();
    const genericNames = ['controller.js', 'model.js', 'service.js', 'routes.js', 'validation.js', 'repository.js'];
    if (genericNames.includes(basename)) {
      results.push({ path: filePath, error: `Invalid filename. You CANNOT name a file exactly "${basename}". You MUST use feature-based dot-notation (e.g., "patient.${basename}"). Write aborted.` });
      continue;
    }

    try {
      const abs = safePath(filePath, workspaceDir, allowTraversal, rootWorkspaceDir);
      const dir = path.dirname(abs);
      const dirStat = await fs.pathExists(dir) ? await fs.stat(dir) : null;
      if (dirStat && !dirStat.isDirectory()) {
        results.push({ path: filePath, error: `Cannot create directory "${dir}": A file with the same name already exists.` });
        continue;
      }
      await fs.ensureDir(dir);
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
async function applyBlueprint(params, workspaceDir, allowTraversal = false, rootWorkspaceDir = null) {
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

  return await bulkWrite({ files }, workspaceDir, allowTraversal, rootWorkspaceDir);
}

// ── bulk_read ─────────────────────────────────────────────────────────────────
async function bulkRead(params, workspaceDir, allowTraversal = false, rootWorkspaceDir = null) {
  let paths = [];
  if (Array.isArray(params)) paths = params;
  else if (params && Array.isArray(params.paths)) paths = params.paths;
  else if (params && typeof params === 'object') {
    // accept many shapes
    paths = params.files || params.paths || [];
  }

  if (paths.length === 0) return { error: '"paths" array is required.' };
  if (paths.length > 100) {
    console.warn(`[DevAgent] bulk_read: capping ${paths.length} paths to 100`);
    paths = paths.slice(0, 100);
  }

  const results = [];
  for (const p of paths) {
    try {
      const abs = safePath(p, workspaceDir, allowTraversal, rootWorkspaceDir);
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
async function replaceInFile(params, workspaceDir, allowTraversal = false, rootWorkspaceDir = null) {
  const filePath = params.path || params.file;
  const { search, replace } = params;

  if (!filePath || search === undefined || replace === undefined) {
    return { error: '"path", "search", and "replace" parameters are required.' };
  }

  try {
    const abs = safePath(filePath, workspaceDir, allowTraversal, rootWorkspaceDir);
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

// ── create_directory ───────────────────────────────────────────────────────────
/**
 * Create one or more directories (and any missing parents) under the workspace.
 * The model often wants this before writing nested files — providing it prevents
 * the create_directory → list_files → error → repeat loop.
 */
async function createDirectory({ path: dirPath } = {}, workspaceDir) {
  if (!dirPath || typeof dirPath !== 'string') {
    return { error: 'Parameter "path" (string) is required.' };
  }
  try {
    const abs = safePath(dirPath, workspaceDir);
    await fs.ensureDir(abs);
    console.log(`[DevAgent] create_directory: ${abs}`);
    return { success: true, path: dirPath, created: true };
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
  replaceInFile,
  createDirectory
};




