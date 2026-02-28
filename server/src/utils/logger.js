const fs = require('fs-extra');
const path = require('path');

// Log file will be created in the root of the server directory
const logFilePath = path.join(__dirname, '../../agent-errors.log');

/**
 * Appends an error message to the persistent agent-errors.log file.
 * @param {string} errorType - The category of the error (e.g., 'PARSE_ERROR', 'LOOP_GUARD', 'TOOL_ERROR').
 * @param {string} message - The detailed error message or stack trace.
 * @param {Object} [metadata] - Optional extra data (e.g., raw payload, action name) to append.
 */
async function logError(errorType, message, metadata = null) {
    try {
        const timestamp = new Date().toISOString();
        let logEntry = `[${timestamp}] [${errorType.toUpperCase()}] ${message}\n`;

        if (metadata) {
            logEntry += `      Metadata: ${JSON.stringify(metadata, null, 2)}\n`;
        }

        // Append to file, ensuring the file exists
        await fs.ensureFile(logFilePath);
        await fs.appendFile(logFilePath, logEntry + '\n', 'utf-8');

    } catch (err) {
        console.error('[Logger] Failed to write to agent-errors.log:', err.message);
    }
}

module.exports = { logError };
