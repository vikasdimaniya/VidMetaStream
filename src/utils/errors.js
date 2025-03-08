/**
 * Custom error classes for the application
 */

/**
 * API Error class for handling HTTP errors
 */
class ApiError extends Error {
    /**
     * Create a new API error
     * @param {string} message - Error message
     * @param {number} statusCode - HTTP status code
     */
    constructor(message, statusCode = 500) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
    }
}

/**
 * Database Error class for handling database-related errors
 */
class DatabaseError extends Error {
    /**
     * Create a new database error
     * @param {string} message - Error message
     * @param {string} operation - The database operation that failed
     */
    constructor(message, operation) {
        super(message);
        this.name = 'DatabaseError';
        this.operation = operation;
    }
}

/**
 * Video Processing Error class for handling video processing errors
 */
class VideoProcessingError extends Error {
    /**
     * Create a new video processing error
     * @param {string} message - Error message
     * @param {string} videoId - ID of the video being processed
     */
    constructor(message, videoId) {
        super(message);
        this.name = 'VideoProcessingError';
        this.videoId = videoId;
    }
}

module.exports = {
    ApiError,
    DatabaseError,
    VideoProcessingError
}; 