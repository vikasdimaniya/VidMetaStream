Divide mp4 into 5 sec sections   
ffmpeg -i input.mp4 -c copy -map 0 -segment_time 5 -f segment -reset_timestamps 1 output_%03d.mp4


# start minio
minio server --console-address ":9001" ~/vidmetastream-minio