'use strict';

const { createLogger } = require('../utils/logger');

/**
 * BaseService — abstract base class for all HMVC services.
 *
 * Provides:
 *  - Per-service logger (`this.logger` / `this.log()`)
 *  - Input validation helper
 *  - Dependency injection slot
 */
class BaseService {
  constructor(options = {}) {
    this.serviceName  = options.serviceName || 'Service';
    this.dependencies = options.dependencies || {};
    this.logger       = createLogger(this.serviceName);
  }

  // ── Logging ─────────────────────────────────────────────────────────────────

  /**
   * Convenience wrapper so subclasses can call `this.log('info', msg, meta)`.
   * Falls back to `info` for unknown levels.
   */
  log(level, message, meta = {}) {
    (this.logger[level] ?? this.logger.info).call(this.logger, message, meta);
  }

  // ── Validation ───────────────────────────────────────────────────────────────

  /**
   * Validate plain-object `data` against a `rules` map.
   *
   * Rule shape: `{ required?: boolean, type?: 'string'|'number'|'boolean'|'array'|'object' }`
   *
   * @param {object} data
   * @param {Record<string, {required?: boolean, type?: string}>} rules
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data, rules) {
    const errors = [];

    for (const [field, rule] of Object.entries(rules)) {
      const value = data[field];

      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`"${field}" is required`);
        continue; // skip type check when missing
      }

      if (value !== undefined && value !== null && rule.type) {
        const isArray = Array.isArray(value);
        const actual  = isArray ? 'array' : typeof value;
        if (actual !== rule.type) {
          errors.push(`"${field}" must be ${rule.type} (got ${actual})`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

module.exports = BaseService;
