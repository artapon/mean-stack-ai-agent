const path = require('path');

/**
 * Application Configuration
 * Centralized configuration for all modules
 */
const config = {
  // Server
  port: Number(process.env.PORT) || 3000,
  
  // Paths
  get projectRoot() {
    const serverSrcDir = __dirname; // .../server/src/config
    const serverDir = path.dirname(serverSrcDir); // .../server/src
    const serverRoot = path.dirname(serverDir); // .../server
    return path.dirname(serverRoot); // .../project-root
  },
  
  get serverDir() {
    return path.join(this.projectRoot, 'server');
  },
  
  // Workspace
  get workspaceDir() {
    const workspacePath = process.env.WORKSPACE_DIR || 'workspace';
    return path.isAbsolute(workspacePath) 
      ? workspacePath 
      : path.join(this.projectRoot, workspacePath);
  },
  
  // Reports
  get reportsDir() {
    return process.env.AGENT_REPORTS_DIR || './agent_reports';
  },
  
  get reportsPath() {
    return path.join(this.projectRoot, this.reportsDir);
  },
  
  // Client
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  
  // LM Studio
  lmStudio: {
    baseUrl: (process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234').replace(/\/$/, '') + '/v1',
    model: process.env.LM_STUDIO_MODEL || 'openai/gpt-oss-20b'
  },
  
  // Agent
  agent: {
    maxSteps: Number(process.env.AGENT_MAX_STEPS) || 50,
    maxLoops: Number(process.env.AGENT_MAX_LOOPS) || 3,
    maxReviewLoops: Number(process.env.MAX_AGENT_LOOPS) || 3
  },
  
  // Security
  bodyLimit: '10mb'
};

module.exports = config;
