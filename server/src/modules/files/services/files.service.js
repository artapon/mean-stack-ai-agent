const path = require('path');
const fs   = require('fs-extra');
const BaseService    = require('../../../core/base.service');
const { readFile, writeFile, listFiles } = require('../../../tools/filesystem');
const config         = require('../../../config');
const settingsService = require('../../settings/services/settings.service');

/**
 * FilesService - Handles file operations business logic
 */
class FilesService extends BaseService {
  constructor() {
    super({ serviceName: 'FilesService' });
  }

  /** Resolve the effective workspace directory from settings (falls back to config). */
  async _getWorkspaceDir() {
    const settings = await settingsService.load();
    if (settings.workspacePath && settings.workspacePath.trim()) {
      const ws = settings.workspacePath.trim();
      const resolved = path.isAbsolute(ws) ? ws : path.join(config.projectRoot, ws);
      // Ensure the directory exists
      await fs.ensureDir(resolved);
      return resolved;
    }
    return config.workspaceDir;
  }

  /**
   * List files in a directory
   */
  async listFiles(dirPath = '.') {
    const workspaceDir = await this._getWorkspaceDir();
    this.log('info', 'Listing files', { path: dirPath, workspace: workspaceDir });
    const result = await listFiles({ path: dirPath }, workspaceDir, true, config.projectRoot);
    return result;
  }

  /**
   * Read a file's contents
   */
  async readFile(filePath) {
    if (!filePath) {
      throw new Error('Path parameter is required');
    }
    const workspaceDir = await this._getWorkspaceDir();
    this.log('info', 'Reading file', { path: filePath });
    const result = await readFile({ path: filePath }, workspaceDir, true, config.projectRoot);
    return result;
  }

  /**
   * Write content to a file
   */
  async writeFile(filePath, content) {
    if (!filePath || content === undefined) {
      throw new Error('Path and content are required');
    }
    const workspaceDir = await this._getWorkspaceDir();
    this.log('info', 'Writing file', { path: filePath, size: content.length });
    const result = await writeFile({ path: filePath, content }, workspaceDir, true, config.projectRoot);
    return result;
  }
}

module.exports = new FilesService();
