const express = require('express');
const router = express.Router();
const { execFile } = require('child_process');
const nodePath = require('path');
const { readFile, writeFile, listFiles } = require('../tools/filesystem');

// ── List files ─────────────────────────────────────────────────────────────
router.get('/list', async (req, res) => {
  try {
    const result = await listFiles({ path: req.query.path || '.' }, req.app.locals.workspaceDir);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Read file ──────────────────────────────────────────────────────────────
router.get('/read', async (req, res) => {
  try {
    if (!req.query.path) return res.status(400).json({ error: '"path" query param required.' });
    const result = await readFile({ path: req.query.path }, req.app.locals.workspaceDir);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Write file ─────────────────────────────────────────────────────────────
router.post('/write', async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: '"path" and "content" are required.' });
    }
    const result = await writeFile({ path: filePath, content }, req.app.locals.workspaceDir);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Browse – Open a native OS folder picker dialog ─────────────────────────
router.get('/browse', (req, res) => {
  // PING LOG: confirm the server is running CURRENT code
  console.log('\n[DevAgent] 🔍 --- /api/files/browse ACCESS ---');

  try {
    const startDir = req.query.start
      ? nodePath.resolve(req.query.start)
      : (req.app.locals.workspaceDir || process.cwd());

    console.log(`[DevAgent] /browse StartDir: "${startDir}"`);

    const platform = process.platform;

    if (platform === 'win32') {
      // Robust PowerShell script with explicit variable for startPath
      const ps = [
        `$startPath = "${startDir.replace(/"/g, '`"').replace(/\\$/, '')}";`,
        'Add-Type -AssemblyName System.Windows.Forms;',
        '$d = New-Object System.Windows.Forms.FolderBrowserDialog;',
        '$d.SelectedPath = $startPath;',
        '$d.Description = "Select project folder";',
        '$d.ShowNewFolderButton = $true;',
        'if ($d.ShowDialog() -eq "OK") { Write-Output $d.SelectedPath }'
      ].join(' ');

      // Use -ExecutionPolicy Bypass to avoid permission issues
      execFile('powershell.exe', [
        '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Sta', '-Command', ps
      ], {
        windowsHide: false, timeout: 60000
      }, (err, stdout, stderr) => {
        if (stderr && stderr.trim()) {
          console.warn('[DevAgent] Browse PowerShell Stderr:', stderr.trim());
        }

        if (err) {
          console.error('[DevAgent] Browse PowerShell Fatal Error:', err.message);
          return res.status(500).json({ error: err.message });
        }

        const selected = (stdout || '').trim();
        console.log(`[DevAgent] /browse Result: "${selected || 'CANCELLED'}"`);

        if (!selected) {
          // If stdout is empty but stderr has content, it might be a real error
          if (stderr && stderr.trim()) {
            return res.status(500).json({ error: stderr.trim() });
          }
          return res.json({ cancelled: true });
        }

        res.json({ path: selected });
      });

    } else if (platform === 'darwin') {
      const script = `choose folder with prompt "Select project folder" default location "${startDir}"`;
      execFile('osascript', ['-e', script], { timeout: 60000 }, (err, stdout) => {
        if (err) {
          console.error('[DevAgent] Browse Mac Error:', err);
          return res.status(500).json({ error: err.message });
        }
        if (!stdout.trim()) return res.json({ cancelled: true });
        const alias = stdout.trim().replace(/^alias /, '');
        execFile('osascript', ['-e', `POSIX path of "${alias}"`], {}, (_e, posix) => {
          res.json({ path: (posix || '').trim().replace(/\/$/, '') });
        });
      });

    } else {
      // Linux
      execFile('zenity', ['--file-selection', '--directory', `--filename=${startDir}/`], {
        timeout: 60000
      }, (err, stdout) => {
        if (err) {
          console.error('[DevAgent] Browse Linux Error:', err);
          return res.status(500).json({ error: err.message });
        }
        const selected = (stdout || '').trim();
        if (!selected) return res.json({ cancelled: true });
        res.json({ path: selected.replace(/\/$/, '') });
      });
    }
  } catch (globalErr) {
    console.error('[DevAgent] /browse FATAL error:', globalErr);
    res.status(500).json({ error: globalErr.message });
  }
});

module.exports = router;
