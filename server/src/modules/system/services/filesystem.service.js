const fs = require('fs-extra');
const path = require('path');
const { execFile } = require('child_process');
const BaseService = require('../../core/base.service');
const config = require('../../config');

/**
 * FileSystemService - Shared filesystem operations
 * Wrapper around tools/filesystem for use across modules
 */
class FileSystemService extends BaseService {
  constructor() {
    super({ serviceName: 'FileSystemService' });
    this.workspaceDir = config.workspaceDir;
    this.projectRoot = config.projectRoot;
  }

  /**
   * Read file contents
   */
  async readFile(filePath) {
    const { readFile } = require('../../tools/filesystem');
    return await readFile({ path: filePath }, this.workspaceDir, true, this.projectRoot);
  }

  /**
   * Write file contents
   */
  async writeFile(filePath, content) {
    const { writeFile } = require('../../tools/filesystem');
    return await writeFile({ path: filePath, content }, this.workspaceDir, true, this.projectRoot);
  }

  /**
   * List directory contents
   */
  async listFiles(dirPath = '.') {
    const { listFiles } = require('../../tools/filesystem');
    return await listFiles({ path: dirPath }, this.workspaceDir, true, this.projectRoot);
  }

  /**
   * Bulk write files
   */
  async bulkWrite(files) {
    const { bulkWrite } = require('../../tools/filesystem');
    return await bulkWrite({ files }, this.workspaceDir, true, this.projectRoot);
  }

  /**
   * Replace in file
   */
  async replaceInFile(filePath, search, replace) {
    const { replaceInFile } = require('../../tools/filesystem');
    return await replaceInFile({ path: filePath, search, replace }, this.workspaceDir, true, this.projectRoot);
  }

  /**
   * Bulk read files
   */
  async bulkRead(paths) {
    const { bulkRead } = require('../../tools/filesystem');
    return await bulkRead({ paths }, this.workspaceDir, true, this.projectRoot);
  }

  /**
   * Apply blueprint
   */
  async applyBlueprint(content) {
    const { applyBlueprint } = require('../../tools/filesystem');
    return await applyBlueprint({ content }, this.workspaceDir, true, this.projectRoot);
  }

  /**
   * Ensure directory exists
   */
  async ensureDir(dirPath) {
    const absPath = path.isAbsolute(dirPath) 
      ? dirPath 
      : path.join(this.workspaceDir, dirPath);
    await fs.ensureDir(absPath);
    return absPath;
  }

  /**
   * Check if path exists
   */
  async pathExists(filePath) {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.workspaceDir, filePath);
    return await fs.pathExists(absPath);
  }
}

module.exports = new FileSystemService();
