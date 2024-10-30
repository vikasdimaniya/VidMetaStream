// read a video file from disk and fragment it into smaller files then store these into the gridfs
// 5 second videos each will be stored use ffmpeg to fragment the video

//connect with mongodb

//run a infinite loop to check for new videos to fragment and store in gridfs at a interval of 5 seconds

import core from './../core.js';
import db from './../db.js';
import ffmpeg from 'fluent-ffmpeg';
while (true){
    sleep(5000);
    let video = db.video.updateOne({status: 'analized'}, {status: 'fragmenting'}, {new: true});
    
    let command = ffmpeg(video.uploadTempLocation)
    .setStartTime(0)
    .setDuration(5)
    .output(`./temp/${video._id}-fragment-%d.mp4`)
    .on('end', async function(){
        let files = fs.readdirSync('./temp');
        for (let file of files){
            if (file.startsWith(video._id)){
                let readStream = fs.createReadStream(`./temp/${file}`);
                let writeStream = gridFSBucket.openUploadStream(file);
                await pump(readStream, writeStream);
                fs.unlinkSync(`./temp/${file}`);
            }
        }
        video.status = 'fragmented';
        await video.save();
    });
    command.run();
}