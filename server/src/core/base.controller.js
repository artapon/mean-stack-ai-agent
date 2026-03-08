'use strict';

const { createLogger } = require('../utils/logger');

/**
 * BaseController — abstract base class for all HMVC controllers.
 *
 * Provides:
 *  - Per-module logger (`this.logger` / `this.log()`)
 *  - Standardised HTTP response helpers (ok, error, badRequest, notFound, serverError)
 *  - Static asyncHandler for Express route wrapping
 */
class BaseController {
  constructor(options = {}) {
    this.moduleName = options.moduleName || 'Controller';
    this.logger     = createLogger(this.moduleName);
  }

  // ── Logging ─────────────────────────────────────────────────────────────────

  log(level, message, meta = {}) {
    (this.logger[level] ?? this.logger.info).call(this.logger, message, meta);
  }

  // ── Response helpers ─────────────────────────────────────────────────────────

  /** 200 OK with data payload. */
  ok(res, data, statusCode = 200) {
    return res.status(statusCode).json({
      success:   true,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /** 201 Created with data payload. */
  created(res, data) {
    return this.ok(res, data, 201);
  }

  /** Generic error response. */
  error(res, message, statusCode = 500, details = null) {
    const body = {
      success:   false,
      error:     message,
      timestamp: new Date().toISOString()
    };
    if (details != null) body.details = details;
    return res.status(statusCode).json(body);
  }

  /** 400 Bad Request. */
  badRequest(res, message) {
    return this.error(res, message, 400);
  }

  /** 404 Not Found. */
  notFound(res, message = 'Resource not found') {
    return this.error(res, message, 404);
  }

  /**
   * 500 Internal Server Error.
   * Logs the full error server-side; only exposes the message to the client.
   */
  serverError(res, message, err = null) {
    this.logger.error(message, err ? { error: err.message } : undefined);
    return this.error(res, message, 500, err?.message);
  }

  // ── Route utility ─────────────────────────────────────────────────────────────

  /**
   * Wrap an async route handler so unhandled rejections are forwarded to
   * Express's `next(err)` rather than leaving dangling promises.
   */
  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}

module.exports = BaseController;
