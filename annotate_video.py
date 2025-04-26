import os
import cv2
import numpy as np
import tempfile
import uuid
from pymongo import MongoClient
import gridfs
from bson.objectid import ObjectId
from tqdm import tqdm
from datetime import datetime
import logging
from dotenv import load_dotenv
import subprocess
import json

# Load environment variables
load_dotenv()

# MongoDB configuration
mongodb_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/vidmetastream")
db_name = "vidmetastream"

# Ensure output directory exists
if not os.path.exists("output"):
    os.makedirs("output")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('annotation.log'),
        logging.StreamHandler()
    ]
)

def timestamp_to_seconds(timestamp):
    """Convert timestamp string to seconds."""
    try:
        # Handle format like "HH:MM:SS.mmm"
        if isinstance(timestamp, str):
            parts = timestamp.split(":")
            if len(parts) == 3:
                hours, minutes, seconds = parts
                seconds_float = float(seconds)
                return int(hours) * 3600 + int(minutes) * 60 + seconds_float
        # Handle if it's already a number
        elif isinstance(timestamp, (int, float)):
            return timestamp
        return 0
    except Exception as e:
        logging.error(f"Error converting timestamp: {e}")
        return 0

def get_latest_video(db):
    """Get the latest video document from MongoDB."""
    try:
        # Find the latest video by creation date (assuming _id contains a timestamp)
        latest_video = db.videos.find_one(
            {"status": "ready"},  # Look for videos with "ready" status
            sort=[("_id", -1)]  # Sort by _id descending to get the latest
        )
        
        if not latest_video:
            logging.warning("No ready videos found")
            latest_video = db.videos.find_one(sort=[("_id", -1)])
            if latest_video:
                logging.info(f"Found latest video (status: {latest_video.get('status')}): {latest_video['_id']}")
            else:
                logging.error("No videos found in the database")
            
        return latest_video
    except Exception as e:
        logging.error(f"Error getting latest video: {e}")
        return None

def download_and_merge_chunks(db, video_id, temp_dir):
    """Download all chunks for the given video from GridFS and merge them using FFmpeg."""
    try:
        # Initialize GridFS
        fs = gridfs.GridFS(db, 'filesBucket')  # Use 'filesBucket' as the bucket name
        
        # Find all chunks belonging to this video, ordered by start time
        query = {"metadata.videoID": ObjectId(video_id)}
        chunks = list(db.filesBucket.files.find(query).sort("metadata.startTime", 1))
        
        if not chunks:
            logging.error(f"No chunks found for video_id: {video_id}")
            return None
        
        logging.info(f"Found {len(chunks)} chunks for video_id: {video_id}")
        
        # List to hold paths to temporary chunk files
        chunk_files = []
        
        # Download each chunk to a temporary file
        for i, chunk in enumerate(tqdm(chunks, desc="Downloading chunks")):
            chunk_id = chunk["_id"]
            temp_file_path = os.path.join(temp_dir, f"chunk_{i:03d}.mp4")
            
            with open(temp_file_path, "wb") as f:
                f.write(fs.get(chunk_id).read())
            
            chunk_files.append(temp_file_path)
        
        if not chunk_files:
            logging.error("Failed to download any chunk files")
            return None
            
        # Create a file list for FFmpeg concat
        concat_file_path = os.path.join(temp_dir, "concat_list.txt")
        with open(concat_file_path, "w") as f:
            for chunk_file in chunk_files:
                f.write(f"file '{chunk_file}'\n")
        
        # Merge the chunks into a single video file using FFmpeg
        merged_video_path = os.path.join(temp_dir, "merged.mp4")
        
        # Run FFmpeg to concatenate the files
        cmd = [
            "ffmpeg",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file_path,
            "-c", "copy",  # Copy streams without re-encoding
            "-y",  # Overwrite output file if it exists
            merged_video_path
        ]
        
        logging.info(f"Running FFmpeg command: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logging.error(f"FFmpeg error: {result.stderr}")
            
            # Fallback to OpenCV method if FFmpeg fails
            logging.info("Falling back to OpenCV for video merging")
            
            # Get info from the first chunk to set up the output video
            first_chunk = cv2.VideoCapture(chunk_files[0])
            fps = first_chunk.get(cv2.CAP_PROP_FPS)
            if fps == 0:
                fps = 30  # Default fps if it can't be determined
            width = int(first_chunk.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(first_chunk.get(cv2.CAP_PROP_FRAME_HEIGHT))
            first_chunk.release()
            
            # Create a VideoWriter for the merged output
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(merged_video_path, fourcc, fps, (width, height))
            
            # Read each chunk and write its frames to the merged video
            for chunk_file in tqdm(chunk_files, desc="Merging chunks"):
                cap = cv2.VideoCapture(chunk_file)
                while True:
                    ret, frame = cap.read()
                    if not ret:
                        break
                    out.write(frame)
                cap.release()
            
            out.release()
        else:
            logging.info("FFmpeg successfully merged video chunks")
        
        # Get video properties using FFmpeg
        cmd = [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate",
            "-of", "json",
            merged_video_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            logging.error(f"FFprobe error: {result.stderr}")
            
            # Fallback to OpenCV for getting video properties
            cap = cv2.VideoCapture(merged_video_path)
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            if fps == 0:
                fps = 30
            cap.release()
        else:
            # Parse the JSON output from FFprobe
            try:
                info = json.loads(result.stdout)
                stream = info.get("streams", [{}])[0]
                width = stream.get("width", 0)
                height = stream.get("height", 0)
                
                # Parse the frame rate fraction
                r_frame_rate = stream.get("r_frame_rate", "30/1")
                if "/" in r_frame_rate:
                    num, den = map(int, r_frame_rate.split("/"))
                    fps = num / den if den != 0 else 30
                else:
                    fps = float(r_frame_rate)
            except Exception as e:
                logging.error(f"Error parsing FFprobe output: {e}")
                # Fallback values
                cap = cv2.VideoCapture(merged_video_path)
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                fps = cap.get(cv2.CAP_PROP_FPS) or 30
                cap.release()
        
        logging.info(f"Merged video saved to {merged_video_path}")
        
        return {
            "path": merged_video_path,
            "fps": fps,
            "width": width,
            "height": height
        }
    
    except Exception as e:
        logging.error(f"Error downloading and merging chunks: {e}")
        return None

def get_objects_for_video(db, video_name):
    """Get all object tracking data for the video."""
    try:
        # Extract the base video ID without extension
        video_id = os.path.splitext(video_name)[0]
        
        objects = list(db.objects.find({"video_id": video_id}))
        logging.info(f"Found {len(objects)} tracked objects for video: {video_id}")
        return objects
    except Exception as e:
        logging.error(f"Error getting objects for video: {e}")
        return []

def annotate_video(video_info, objects, output_path):
    """Annotate the video with bounding boxes from tracked objects."""
    try:
        if not video_info:
            logging.error("No video info provided for annotation")
            return False
        
        # Open the merged video
        cap = cv2.VideoCapture(video_info["path"])
        
        # Create output video writer
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, video_info["fps"], 
                              (video_info["width"], video_info["height"]))
        
        # Process each frame
        frame_number = 0
        frame_objects = {}
        
        # Prepare frame-indexed object data for faster lookup
        for obj in objects:
            for frame_data in obj.get("frames", []):
                frame_idx = frame_data.get("frame")
                if frame_idx is not None:
                    if frame_idx not in frame_objects:
                        frame_objects[frame_idx] = []
                    frame_objects[frame_idx].append({
                        "track_id": obj.get("track_id"),
                        "box": frame_data.get("box"),
                        "interpolated": frame_data.get("interpolated", False)
                    })
        
        # Process each frame of the video
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        for _ in tqdm(range(total_frames), desc="Annotating video"):
            ret, frame = cap.read()
            if not ret:
                break
            
            # Annotate with objects for this frame
            if frame_number in frame_objects:
                for obj_data in frame_objects[frame_number]:
                    box = obj_data.get("box")
                    track_id = obj_data.get("track_id")
                    interpolated = obj_data.get("interpolated")
                    
                    if box and len(box) == 4:
                        # Convert box coordinates to integers
                        x1, y1, x2, y2 = map(int, box)
                        
                        # Draw rectangle with different color based on interpolation
                        color = (0, 0, 255) if interpolated else (0, 255, 0)
                        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                        
                        # Draw track ID label
                        if track_id is not None:
                            label = f"ID:{track_id}"
                            cv2.putText(frame, label, (x1, y1-10), 
                                      cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)
            
            # Write the annotated frame
            out.write(frame)
            frame_number += 1
        
        # Release resources
        cap.release()
        out.release()
        
        logging.info(f"Annotated video saved to {output_path}")
        return True
    
    except Exception as e:
        logging.error(f"Error annotating video: {e}")
        return False

def main():
    """Main function to orchestrate the process."""
    try:
        # Connect to MongoDB
        logging.info(f"Connecting to MongoDB at: {mongodb_uri}")
        client = MongoClient(mongodb_uri)
        db = client[db_name]
        
        # Get the latest video
        latest_video = get_latest_video(db)
        if not latest_video:
            logging.error("Failed to find latest video in database")
            return
        
        video_id = str(latest_video["_id"])
        video_name = latest_video.get("filename", video_id)
        logging.info(f"Processing video: {video_name} (ID: {video_id})")
        
        # Create temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            # Download and merge video chunks
            video_info = download_and_merge_chunks(db, video_id, temp_dir)
            if not video_info:
                logging.error("Failed to download and merge video chunks")
                return
            
            # Get objects for this video
            objects = get_objects_for_video(db, video_name)
            
            # Annotate the video
            output_filename = f"annotated_{video_name.split('.')[0]}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
            output_path = os.path.join("output", output_filename)
            
            success = annotate_video(video_info, objects, output_path)
            
            if success:
                logging.info("Process completed successfully")
                print(f"Annotated video saved to: {output_path}")
            else:
                logging.error("Failed to complete annotation process")
    
    except Exception as e:
        logging.error(f"Error in main process: {e}")

if __name__ == "__main__":
    main() 