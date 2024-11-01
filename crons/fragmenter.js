// read a video file = require(disk and fragment it into smaller files then store these into the gridfs
// 5 second videos each will be stored use ffmpeg to fragment the video

//connect with mongodb

//run a infinite loop to check for new videos to fragment and store in gridfs at a interval of 5 seconds

const core = require('./../core.js');
const db = require('./../db.js');
const ffmpeg = require('../src/utils/ffmpeg.js');

while (true){
    sleep(5000);
    let video = db.video.updateOne({status: 'analized'}, {status: 'fragmenting'}, {new: true});

    const inputFilePath = video.uploadTempLocation; // Path to the input video file
    const outputDir = 'fragmented/'+video._id+"/"; // Path to output directory for chunks

    // Split video into 5-second chunks
    splitVideoIntoChunks(inputFilePath, outputDir);

    // Update video status to 'fragmented'
    video.status = 'fragmented';
    video.save();

    // store the fragmented files in gridfs
    storeInGridFS(outputDir);



}

function storeInGridFS(outputDir){
    // Store fragmented video files in GridFS
    const files = fs.readdirSync(outputDir);
    for (const file of files) {
        const videoChunk = fs.readFileSync(path.join(outputDir, file));
        const writeStream = db.gfs.createWriteStream({
            filename: file
        });
        writeStream.write(videoChunk);
        writeStream.end();
    }
}