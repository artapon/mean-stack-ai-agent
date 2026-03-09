'use strict';

/**
 * Logger — unified logging for all server modules.
 *
 * Features:
 *  - Level filtering via LOG_LEVEL env var (debug|info|warn|error, default: info)
 *  - Colored console output (per level)
 *  - Async fire-and-forget file writes (never blocks the event loop)
 *  - Per-module prefix via createLogger(module)
 *  - Safe: logging errors are swallowed so they never crash the app
 */

const fs   = require('fs-extra');
const path = require('path');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const RESET  = '\x1b[0m';
const COLOR  = { debug: '\x1b[36m', info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m' };
const PAD    = { debug: 'DEBUG', info: 'INFO ', warn: 'WARN ', error: 'ERROR' };

const logsDir   = path.resolve(__dirname, '../../logs');
const minLevel  = LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

// Ensure logs directory exists synchronously at module load (once per process)
try { fs.ensureDirSync(logsDir); } catch (_) {}

// ── Logger class ──────────────────────────────────────────────────────────────

class Logger {
  /** @param {string} module  Short label shown in every log line. */
  constructor(module = 'Server') {
    this.module = module;
  }

  /**
   * Core write — formats the entry then outputs to console + file.
   * @param {'debug'|'info'|'warn'|'error'} level
   * @param {string} message
   * @param {object} [meta]
   */
  _write(level, message, meta) {
    if ((LEVELS[level] ?? 0) < minLevel) return;

    const ts   = new Date().toISOString();
    const line = `[${ts}] [${PAD[level]}] [${this.module}] ${message}`;

    // If meta contains _text, render it as a readable block instead of JSON
    const rawText  = meta?._text ?? null;
    const cleanMeta = meta ? Object.fromEntries(Object.entries(meta).filter(([k]) => k !== '_text')) : null;
    const metaStr  = cleanMeta && Object.keys(cleanMeta).length ? ' ' + JSON.stringify(cleanMeta) : '';
    // Separator block for multi-line raw content (LLM responses, tool results)
    const textBlock = rawText != null ? `\n${rawText}\n` : '';

    // ── Console (colored) ────────────────────────────────────────────────────
    process.stdout.write(`${COLOR[level] ?? ''}${line}${metaStr}${textBlock}${RESET}\n`);

    // ── File (async, fire-and-forget) ─────────────────────────────────────────
    const file = level === 'error' ? 'agent-errors.log' : 'agent-infos.log';
    fs.appendFile(
      path.join(logsDir, file),
      line + metaStr + textBlock + '\n',
      'utf8'
    ).catch(() => {});
  }

  debug(msg, meta) { this._write('debug', msg, meta); }
  info (msg, meta) { this._write('info',  msg, meta); }
  warn (msg, meta) { this._write('warn',  msg, meta); }
  error(msg, meta) { this._write('error', msg, meta); }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a logger tagged with a module name.
 * @param {string} module
 * @returns {Logger}
 */
function createLogger(module) {
  return new Logger(module);
}

/** Default server-level logger. */
const logger = createLogger('Server');

/** Legacy shims used by core.js — delegate to the default logger. */
function logInfo(event, message, meta)  { logger.info (`[${event}] ${message}`, meta); }
function logError(event, message, meta) { logger.error(`[${event}] ${message}`, meta); }

module.exports = { logger, createLogger, logInfo, logError };
