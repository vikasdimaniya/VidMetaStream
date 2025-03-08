/**
 * Logging utility for consistent logging throughout the application
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

// Log levels
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4
};

// Default log level from environment or INFO
const DEFAULT_LOG_LEVEL = process.env.LOG_LEVEL 
    ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] 
    : LOG_LEVELS.INFO;

// Log directory
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '../../logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Log file paths
const LOG_FILES = {
    ERROR: path.join(LOG_DIR, 'error.log'),
    WARN: path.join(LOG_DIR, 'warn.log'),
    INFO: path.join(LOG_DIR, 'info.log'),
    DEBUG: path.join(LOG_DIR, 'debug.log'),
    TRACE: path.join(LOG_DIR, 'trace.log'),
    QUERY: path.join(LOG_DIR, 'query.log')
};

/**
 * Format a log message with timestamp and metadata
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 * @returns {string} - Formatted log message
 */
const formatLogMessage = (level, message, metadata = {}) => {
    const timestamp = new Date().toISOString();
    const metadataStr = Object.keys(metadata).length > 0 
        ? '\n' + util.inspect(metadata, { depth: 5, colors: false })
        : '';
    
    return `[${timestamp}] [${level}] ${message}${metadataStr}`;
};

/**
 * Write a log message to console and file
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 */
const log = (level, message, metadata = {}) => {
    const logLevel = LOG_LEVELS[level];
    
    // Skip if log level is higher than configured level
    if (logLevel > DEFAULT_LOG_LEVEL) {
        return;
    }
    
    const formattedMessage = formatLogMessage(level, message, metadata);
    
    // Log to console
    if (level === 'ERROR') {
        console.error(formattedMessage);
    } else if (level === 'WARN') {
        console.warn(formattedMessage);
    } else {
        console.log(formattedMessage);
    }
    
    // Log to file
    fs.appendFileSync(LOG_FILES[level], formattedMessage + '\n');
};

/**
 * Log a query-related message to the query log file
 * @param {string} message - Log message
 * @param {Object} queryData - Query data
 */
const logQuery = (message, queryData = {}) => {
    const timestamp = new Date().toISOString();
    const queryStr = util.inspect(queryData, { depth: 5, colors: false });
    const logMessage = `[${timestamp}] ${message}\n${queryStr}\n${'='.repeat(80)}\n`;
    
    // Log to query log file
    fs.appendFileSync(LOG_FILES.QUERY, logMessage);
};

// Create logger methods for each log level
const logger = {
    error: (message, metadata) => log('ERROR', message, metadata),
    warn: (message, metadata) => log('WARN', message, metadata),
    info: (message, metadata) => log('INFO', message, metadata),
    debug: (message, metadata) => log('DEBUG', message, metadata),
    trace: (message, metadata) => log('TRACE', message, metadata),
    query: logQuery
};

module.exports = logger; 