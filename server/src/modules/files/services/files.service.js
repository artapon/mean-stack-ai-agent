const BaseService = require('../../../core/base.service');
const { readFile, writeFile, listFiles } = require('../../../tools/filesystem');
const config = require('../../../config');

/**
 * FilesService - Handles file operations business logic
 */
class FilesService extends BaseService {
  constructor() {
    super({ serviceName: 'FilesService' });
    this.workspaceDir = config.workspaceDir;
  }

  /**
   * List files in a directory
   */
  async listFiles(dirPath = '.') {
    this.log('info', 'Listing files', { path: dirPath });
    const result = await listFiles({ path: dirPath }, this.workspaceDir, true, config.projectRoot);
    return result;
  }

  /**
   * Read a file's contents
   */
  async readFile(filePath) {
    if (!filePath) {
      throw new Error('Path parameter is required');
    }
    this.log('info', 'Reading file', { path: filePath });
    const result = await readFile({ path: filePath }, this.workspaceDir, true, config.projectRoot);
    return result;
  }

  /**
   * Write content to a file
   */
  async writeFile(filePath, content) {
    if (!filePath || content === undefined) {
      throw new Error('Path and content are required');
    }
    this.log('info', 'Writing file', { path: filePath, size: content.length });
    const result = await writeFile({ path: filePath, content }, this.workspaceDir, true, config.projectRoot);
    return result;
  }
}

module.exports = new FilesService();
