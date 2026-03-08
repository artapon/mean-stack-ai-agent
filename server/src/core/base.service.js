/**
 * BaseService - Abstract base class for all HMVC services
 * Contains business logic, coordinates between controllers and models
 */
class BaseService {
  constructor(options = {}) {
    this.serviceName = options.serviceName || 'base';
    this.dependencies = options.dependencies || {};
  }

  /**
   * Log service activity
   */
  log(level, message, meta = {}) {
    const prefix = `[${this.serviceName}]`;
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, service: this.serviceName, message, ...meta };
    
    if (level === 'error') {
      console.error(prefix, message, meta);
    } else if (level === 'warn') {
      console.warn(prefix, message, meta);
    } else {
      console.log(prefix, message, meta);
    }
    return logEntry;
  }

  /**
   * Validate input data against schema
   */
  validate(data, rules) {
    const errors = [];
    for (const [field, rule] of Object.entries(rules)) {
      const value = data[field];
      
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
      }
      
      if (value !== undefined && rule.type) {
        if (rule.type === 'array' && !Array.isArray(value)) {
          errors.push(`${field} must be an array`);
        } else if (rule.type !== 'array' && typeof value !== rule.type) {
          errors.push(`${field} must be ${rule.type}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Execute operation with error handling
   */
  async execute(operation, context = {}) {
    try {
      this.log('info', `Executing ${operation}`, context);
      return await this[operation](context);
    } catch (error) {
      this.log('error', `Failed ${operation}`, { error: error.message, context });
      throw error;
    }
  }
}

module.exports = BaseService;
