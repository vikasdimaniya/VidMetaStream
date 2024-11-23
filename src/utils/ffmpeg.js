const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

// Function to split video into 5-second chunks
async function splitVideoIntoChunks(inputFilePath, outputDir) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    const segmentDuration = 5; // Duration of each segment in seconds
    return new Promise((resolve, reject) => {
        ffmpeg(inputFilePath)
            .output(path.join(outputDir, 'output_%03d.mp4')) // Output format with numbering
            .videoCodec('copy') // Copy video codec (avoid re-encoding)
            .audioCodec('copy') // Copy audio codec (avoid re-encoding)
            .outputOptions([
                `-segment_time ${segmentDuration}`, // Set duration of each chunk
                '-f segment', // Use segment format
                '-reset_timestamps 1' // Reset timestamps for each segment
            ])
            .on('start', commandLine => {
                console.log('Started splitting video with command:', commandLine);
            })
            .on('end', () => {
                console.log('Video successfully split into 5-second chunks.');
                resolve();
            })
            .on('error', err => {
                console.error('Error splitting video:', err);
                reject(err);
            })
            .run();
    });
}

module.exports = { splitVideoIntoChunks };