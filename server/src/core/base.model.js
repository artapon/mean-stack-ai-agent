/**
 * BaseModel - Abstract base class for all HMVC models
 * Handles data persistence and state management
 */
class BaseModel {
  constructor(options = {}) {
    this.modelName = options.modelName || 'base';
    this.schema = options.schema || {};
    this.data = {};
  }

  /**
   * Get data by key
   */
  get(key, defaultValue = null) {
    if (key) {
      return this.data[key] !== undefined ? this.data[key] : defaultValue;
    }
    return { ...this.data };
  }

  /**
   * Set data
   */
  set(key, value) {
    if (typeof key === 'object') {
      Object.assign(this.data, key);
    } else {
      this.data[key] = value;
    }
    return this;
  }

  /**
   * Clear data
   */
  clear() {
    this.data = {};
    return this;
  }

  /**
   * Validate data against schema
   */
  validate(data = this.data) {
    const errors = [];
    for (const [field, rules] of Object.entries(this.schema)) {
      const value = data[field];
      
      if (rules.required && (value === undefined || value === null)) {
        errors.push(`${field} is required`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Serialize model to JSON
   */
  toJSON() {
    return {
      model: this.modelName,
      data: { ...this.data },
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = BaseModel;
