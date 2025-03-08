/**
 * Utility functions for spatial and time-related operations
 */

/**
 * Define relative regions for spatial queries
 * @param {string} region - The named region (e.g., "top-half", "bottom-right")
 * @returns {Array|null} - Array of coordinates [x1, y1, x2, y2] or null if invalid
 */
const interpretRelativeArea = (region) => {
    const regions = {
        // Halves
        "top-half": [0.0, 0.0, 1.0, 0.5],
        "bottom-half": [0.0, 0.5, 1.0, 1.0],
        "left-half": [0.0, 0.0, 0.5, 1.0],
        "right-half": [0.5, 0.0, 1.0, 1.0],

        // Thirds (horizontal)
        "top-third": [0.0, 0.0, 1.0, 1 / 3],
        "middle-third-horizontal": [0.0, 1 / 3, 1.0, 2 / 3],
        "bottom-third": [0.0, 2 / 3, 1.0, 1.0],

        // Thirds (vertical)
        "left-third": [0.0, 0.0, 1 / 3, 1.0],
        "middle-third-vertical": [1 / 3, 0.0, 2 / 3, 1.0],
        "right-third": [2 / 3, 0.0, 1.0, 1.0],

        // Quadrants
        "top-left": [0.0, 0.0, 0.5, 0.5],
        "top-right": [0.5, 0.0, 1.0, 0.5],
        "bottom-left": [0.0, 0.5, 0.5, 1.0],
        "bottom-right": [0.5, 0.5, 1.0, 1.0],
    };

    return regions[region] || null; // Return null if no match
};

/**
 * Validate and parse area input
 * @param {string|Array} area - Area as a string name or array of coordinates
 * @returns {Array} - Validated area as [x1, y1, x2, y2]
 * @throws {Error} - If area is invalid
 */
const validateArea = (area) => {
    if (typeof area === "string") {
        const parsedArea = interpretRelativeArea(area);
        if (!parsedArea) {
            throw new Error(`Invalid area description: ${area}`);
        }
        return parsedArea;
    }
    
    try {
        if (typeof area === "string" && area.startsWith("[")) {
            area = JSON.parse(area);
        }
    } catch {
        throw new Error("Invalid JSON for area");
    }
    
    if (!Array.isArray(area) || area.length !== 4 || area.some(coord => typeof coord !== "number")) {
        throw new Error("Area must be an array with exactly 4 numerical coordinates");
    }
    
    return area;
};

/**
 * Checks if a relative position is within a specified area
 * @param {Array} relativePosition - The [x, y] coordinates of the relative position
 * @param {Array} area - The area bounds as [x1, y1, x2, y2]
 * @returns {boolean} - True if the position is within the area
 */
const isPositionInArea = (relativePosition, area) => {
    if (!relativePosition || relativePosition.length !== 2 || !area || area.length !== 4) {
        throw new Error('Invalid relative position or area');
    }

    const [x, y] = relativePosition;
    const [x1, y1, x2, y2] = area;

    // Check if the position is within the bounds of the area
    return x >= x1 && x <= x2 && y >= y1 && y <= y2;
};

/**
 * Converts a time string in HH:MM:SS.SSS format to seconds
 * @param {string} timeStr - Time string (e.g., "00:00:11.733")
 * @returns {number} - Time in seconds
 */
const convertTimeToSeconds = (timeStr) => {
    const parts = timeStr.split(":");
    const hours = parseFloat(parts[0]) * 3600;
    const minutes = parseFloat(parts[1]) * 60;
    const seconds = parseFloat(parts[2]);
    return hours + minutes + seconds;
};

/**
 * Converts a time in seconds to HH:MM:SS.SSS format
 * @param {number} seconds - Time in seconds
 * @returns {string} - Formatted time string
 */
const secondsToTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`;
};

/**
 * Increments a timestamp by a frame duration (typically 33ms or 0.033s)
 * @param {number} currentTimestamp - Current timestamp in seconds
 * @returns {number} - Next timestamp in seconds
 */
const incrementTimestamp = (currentTimestamp) => {
    // Extract the whole number part and the fractional part
    const wholePart = Math.floor(currentTimestamp);
    let fractionalPart = parseFloat((currentTimestamp % 1).toFixed(3)); // e.g., 0.366

    // Convert fractional part to milliseconds for easier manipulation
    let milliseconds = Math.round(fractionalPart * 1000); // e.g., 366

    // Determine the last digit of the milliseconds
    const lastDigit = milliseconds % 10;

    // Define increment based on the last digit
    let increment;
    if (lastDigit === 0) {
        increment = 33; // from 0 to 3
    } else if (lastDigit === 3) {
        increment = 33; // from 3 to 6
    } else if (lastDigit === 6) {
        increment = 34; // from 6 to next second (0)
    } else {
        throw new Error(`Unexpected millisecond ending: ${milliseconds}`);
    }

    // Calculate the new milliseconds
    milliseconds += increment;

    // Handle overflow if milliseconds reach or exceed 1000
    if (milliseconds >= 1000) {
        milliseconds -= 1000;
        return wholePart + 1 + (milliseconds / 1000);
    }

    // Normalize to three decimal places
    const newFractionalPart = parseFloat((milliseconds / 1000).toFixed(3));

    // Combine the whole part with the new fractional part
    return wholePart + newFractionalPart;
};

module.exports = {
    interpretRelativeArea,
    validateArea,
    isPositionInArea,
    convertTimeToSeconds,
    secondsToTime,
    incrementTimestamp
}; 