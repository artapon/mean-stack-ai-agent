const BaseController = require('../../core/base.controller');
const FilesService = require('../services/files.service');

/**
 * FilesController - Handles file-related HTTP requests
 */
class FilesController extends BaseController {
  constructor() {
    super({ moduleName: 'Files' });
  }

  /**
   * GET /api/files/list - List files in directory
   */
  async list(req, res) {
    try {
      const dirPath = req.query.path || '.';
      const result = await FilesService.listFiles(dirPath);
      
      if (result.error) {
        return this.error(res, result.error, 400);
      }
      
      return this.ok(res, result);
    } catch (err) {
      return this.serverError(res, 'Failed to list files', err);
    }
  }

  /**
   * GET /api/files/read - Read file contents
   */
  async read(req, res) {
    try {
      const filePath = req.query.path;
      
      if (!filePath) {
        return this.badRequest(res, '"path" query param required.');
      }
      
      const result = await FilesService.readFile(filePath);
      
      if (result.error) {
        return this.notFound(res, result.error);
      }
      
      return this.ok(res, result);
    } catch (err) {
      return this.serverError(res, 'Failed to read file', err);
    }
  }

  /**
   * POST /api/files/write - Write file contents
   */
  async write(req, res) {
    try {
      const { path: filePath, content } = req.body;
      
      if (!filePath || content === undefined) {
        return this.badRequest(res, '"path" and "content" are required.');
      }
      
      const result = await FilesService.writeFile(filePath, content);
      
      if (result.error) {
        return this.error(res, result.error, 400);
      }
      
      return this.ok(res, result);
    } catch (err) {
      return this.serverError(res, 'Failed to write file', err);
    }
  }
}

module.exports = new FilesController();
