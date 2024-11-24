const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

// Function to get the duration of a video file using ffprobe
function getVideoDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                return reject(err);
            }
            const duration = metadata.format.duration; // Duration in seconds
            resolve(duration);
        });
    });
}

// Function to get durations of all files in a directory
async function getFragmentDurations(dirPath) {
    const files = fs.readdirSync(dirPath); // Get all files in the directory
    const durations = [];
    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const duration = await getVideoDuration(filePath); // Get duration of each file
        durations.push({ fileName: file, duration });
    }
    return durations;
}

// Function to split video into 5-second chunks and get their durations
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
            .on('end', async () => {
                console.log('Video successfully split into chunks.');

                // Get the durations of all fragments
                try {
                    const durations = await getFragmentDurations(outputDir);
                    console.log('Fragment durations:', durations);
                    resolve(durations); // Resolve with the fragment durations
                } catch (err) {
                    console.error('Error getting fragment durations:', err);
                    reject(err);
                }
            })
            .on('error', err => {
                console.error('Error splitting video:', err);
                reject(err);
            })
            .run();
    });
}

module.exports = { splitVideoIntoChunks };
