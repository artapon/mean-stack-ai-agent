const BaseService = require('../../../core/base.service');
const { scaffoldProject } = require('../../../tools/scaffolder');
const config = require('../../../config');

/**
 * ScaffolderService - Project scaffolding operations
 */
class ScaffolderService extends BaseService {
  constructor() {
    super({ serviceName: 'ScaffolderService' });
    this.workspaceDir = config.workspaceDir;
  }

  /**
   * Scaffold a new project
   */
  async scaffoldProject(name, options = {}) {
    this.log('info', 'Scaffolding project', { name, options });
    return await scaffoldProject({ name, ...options }, this.workspaceDir);
  }

  /**
   * Get available project templates
   */
  getTemplates() {
    return {
      'mean_stack': {
        name: 'MEAN Stack',
        description: 'MongoDB, Express, Angular, Node.js full-stack application',
        files: ['server.js', 'package.json', 'models/', 'routes/', 'controllers/', 'services/']
      },
      'html_css': {
        name: 'HTML/CSS/Bootstrap',
        description: 'Static landing page with Bootstrap 5',
        files: ['index.html', 'css/style.css', 'js/main.js']
      },
      'default': {
        name: 'Default (Express.js)',
        description: 'Basic Express.js REST API',
        files: ['app.js', 'package.json', 'routes/', 'models/']
      }
    };
  }
}

module.exports = new ScaffolderService();
