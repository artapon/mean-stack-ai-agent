/**
 * BaseController - Abstract base class for all HMVC controllers
 * Provides common request/response handling and error management
 */
class BaseController {
  constructor(options = {}) {
    this.moduleName = options.moduleName || 'base';
  }

  /**
   * Log controller activity
   */
  log(level, message, meta = {}) {
    if (level === 'error') {
      console.error(`[${this.moduleName}] ${message}`, meta);
    } else if (level === 'warn') {
      console.warn(`[${this.moduleName}] ${message}`, meta);
    } else {
      console.log(`[${this.moduleName}] ${message}`, meta);
    }
  }

  /**
   * Standard success response
   */
  ok(res, data, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Standard error response
   */
  error(res, message, statusCode = 500, details = null) {
    const response = {
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    };
    if (details) response.details = details;
    return res.status(statusCode).json(response);
  }

  /**
   * Bad request response (400)
   */
  badRequest(res, message) {
    return this.error(res, message, 400);
  }

  /**
   * Not found response (404)
   */
  notFound(res, message = 'Resource not found') {
    return this.error(res, message, 404);
  }

  /**
   * Server error response (500)
   */
  serverError(res, message, error = null) {
    console.error(`[${this.moduleName}] Error:`, error || message);
    return this.error(res, message, 500, error?.message);
  }

  /**
   * Wrap async route handlers to catch errors
   */
  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}

module.exports = BaseController;
