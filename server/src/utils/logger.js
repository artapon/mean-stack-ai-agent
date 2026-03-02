const fs = require('fs-extra');
const path = require('path');

const logsDir = path.join(__dirname, '../../logs');
const errorLogPath = path.join(logsDir, 'agent-errors.log');
const infoLogPath = path.join(logsDir, 'agent-infos.log');

async function ensureLogFiles() {
    await fs.ensureDir(logsDir);
    await fs.ensureFile(errorLogPath);
    await fs.ensureFile(infoLogPath);
}

async function logError(errorType, message, metadata = null, thought = null) {
    try {
        await ensureLogFiles();
        const timestamp = new Date().toISOString();
        let logEntry = `[${timestamp}] [${errorType.toUpperCase()}] ${message}\n`;

        if (metadata) {
            logEntry += `      Metadata: ${JSON.stringify(metadata, null, 2)}\n`;
        }

        if (thought) {
            logEntry += `\n### THOUGHT:\n${thought}\n`;
        }

        await fs.appendFile(errorLogPath, logEntry + '\n', 'utf-8');

    } catch (err) {
        console.error('[Logger] Failed to write to agent-errors.log:', err.message);
    }
}

async function logInfo(action, message, metadata = null) {
    try {
        await ensureLogFiles();
        const timestamp = new Date().toISOString();
        let logEntry = `[${timestamp}] [${action.toUpperCase()}] ${message}\n`;

        if (metadata) {
            logEntry += `      Metadata: ${JSON.stringify(metadata, null, 2)}\n`;
        }

        await fs.appendFile(infoLogPath, logEntry + '\n', 'utf-8');

    } catch (err) {
        console.error('[Logger] Failed to write to agent-infos.log:', err.message);
    }
}

module.exports = { logError, logInfo };
