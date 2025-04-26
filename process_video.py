##TODO 
#get annotatewd video straight from process_video
#filter by confidence ex avg >50
#query engine 


import uuid  # For generating unique instance IDs
import os
import hashlib
import cv2
from tqdm import tqdm  # Import tqdm for the progress bar
from ultralytics import YOLO
from dotenv import load_dotenv
import boto3
import logging
from pymongo.mongo_client import MongoClient
from datetime import datetime
from skimage.metrics import structural_similarity as ssim
import numpy as np
from sort_tracker import Sort
import time
import signal
import sys
import tempfile
from bson.objectid import ObjectId
import threading

# Load environment variables
load_dotenv()

# MongoDB and S3 configuration
mongodb_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/vidmetastream")
AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION")
BUCKET_NAME = os.getenv("AWS_STORAGE_BUCKET_NAME", "vidmetastream")
db_name = "vidmetastream"

# Connect to MongoDB
print(f"Connecting to MongoDB at: {mongodb_uri}")
client = MongoClient(mongodb_uri)
db = client[db_name]
collection = db["objects"]

s3_client = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
    region_name=AWS_REGION,
    endpoint_url=os.getenv("AWS_S3_ENDPOINT_URL")
)

model = YOLO('yolo11n.pt')
print(model.names)

def timestamp_to_seconds(timestamp):
    # Split the timestamp into hours, minutes, seconds, and milliseconds
    hours, minutes, seconds = map(float, timestamp.split(':'))
    # Convert everything into seconds
    total_seconds = hours * 3600 + minutes * 60 + seconds
    return total_seconds

class CustomFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        # Format time with milliseconds
        ct = self.converter(record.created)
        if datefmt:
            s = datetime.fromtimestamp(record.created).strftime(datefmt)
            return s
        else:
            # Default format with milliseconds
            return datetime.fromtimestamp(record.created).strftime('%Y-%m-%d %H:%M:%S,%f')[:-3]

# Remove all existing handlers to prevent logging to the console
for handler in logging.root.handlers[:]:
    logging.root.removeHandler(handler)

# Create a FileHandler to write logs to a file
file_handler = logging.FileHandler('video_processing.log')
file_handler.setLevel(logging.INFO)

# Create and set the custom formatter with valid logging format placeholders
formatter = CustomFormatter(fmt='%(asctime)s - %(levelname)s - %(message)s')  # Ensures milliseconds are included
file_handler.setFormatter(formatter)

# Add the FileHandler to the root logger
logging.getLogger().addHandler(file_handler)

def process_video(video_path):
    cap = cv2.VideoCapture(video_path)
    frame_number = 0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps == 0:
        fps = 30
        
    # Extract the base video name without extension
    video_name = os.path.basename(video_path)
    # Remove the file extension if present
    video_id = os.path.splitext(video_name)[0]
    
    annotated_video_name = f"annotated_{video_name}"
    annotated_video_path = os.path.join(os.path.dirname(video_path), annotated_video_name)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(annotated_video_path, fourcc, fps, (frame_width, frame_height))
    logging.info(f"Initialized VideoWriter for annotated video at {annotated_video_path}")
    objects_collection = collection

    # SSIM-based keyframe extraction
    ssim_threshold = 0.90
    prev_keyframe_gray = None
    prev_keyframe_num = 0
    prev_keyframe_boxes = None
    prev_keyframe_tracks = None
    prev_keyframe_timestamp = None

    # SORT tracker
    sort_tracker = Sort()
    tracks_per_frame = {}
    boxes_per_frame = {}
    frame_timestamps = {}

    with tqdm(total=total_frames, desc=f"Processing {video_name}", unit="frame") as pbar:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            timestamp_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            timestamp = convert_ms_to_timestamp(timestamp_ms)
            frame_timestamps[frame_number] = timestamp

            if prev_keyframe_gray is None:
                is_keyframe = True
            else:
                score, _ = ssim(prev_keyframe_gray, gray, full=True)
                is_keyframe = score < ssim_threshold

            if is_keyframe:
                prev_keyframe_gray = gray
                prev_keyframe_num = frame_number
                prev_keyframe_timestamp = timestamp
                # Run detection
                results = model.predict(frame, device="cpu", verbose=False)
                dets = []
                for result in results:
                    for box in result.boxes:
                        box_coordinates = box.xyxy[0].tolist()
                        dets.append(box_coordinates)
                dets = np.array(dets) if len(dets) > 0 else np.empty((0,4))
                # Update SORT
                tracked = sort_tracker.update(dets)
                tracks_per_frame[frame_number] = tracked.copy() if tracked is not None else np.empty((0,5))
                boxes_per_frame[frame_number] = dets.copy() if dets is not None else np.empty((0,4))
                # Annotate and write
                annotated_frame = frame.copy()
                for trk in tracked:
                    x1, y1, x2, y2, track_id = trk.astype(int)
                    cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0,255,0), 2)
                    cv2.putText(annotated_frame, f'ID:{track_id}', (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,0,0), 2)
                out.write(annotated_frame)
                # Save to MongoDB
                for trk in tracked:
                    x1, y1, x2, y2, track_id = trk.tolist()
                    # Check if the object already exists before updating
                    existing_obj = objects_collection.find_one({"_id": f"{video_id}_{track_id}"})
                    
                    if existing_obj:
                        # Object exists, update with $push to frames
                        objects_collection.update_one(
                            {"_id": f"{video_id}_{track_id}"},
                            {"$push": {"frames": {
                                "frame": frame_number,
                                "timestamp": timestamp,
                                "box": [x1, y1, x2, y2],
                                "confidence": None,
                                "interpolated": False
                            }}, "$set": {"end_time": timestamp}}
                        )
                    else:
                        # Object doesn't exist yet, create new document
                        objects_collection.insert_one({
                            "_id": f"{video_id}_{track_id}",
                            "video_id": video_id,
                            "track_id": track_id,
                            "start_time": timestamp,
                            "end_time": timestamp,
                            "frames": [{
                                "frame": frame_number,
                                "timestamp": timestamp,
                                "box": [x1, y1, x2, y2],
                                "confidence": None,
                                "interpolated": False
                            }]
                        })
                
                # Interpolate skipped frames
                if prev_keyframe_boxes is not None and prev_keyframe_tracks is not None:
                    for skipped in range(prev_keyframe_num+1, frame_number):
                        prev_tracks = {int(t[4]): t[:4] for t in prev_keyframe_tracks}
                        curr_tracks = {int(t[4]): t[:4] for t in tracked}
                        # Interpolate only for tracks present in both keyframes
                        for track_id in set(prev_tracks.keys()) & set(curr_tracks.keys()):
                            box_A = np.array(prev_tracks[track_id])
                            box_B = np.array(curr_tracks[track_id])
                            for i in range(1, frame_number - prev_keyframe_num):
                                interp_frame = prev_keyframe_num + i
                                ratio = i / (frame_number - prev_keyframe_num)
                                interp_box = box_A + (box_B - box_A) * ratio
                                interp_box = interp_box.tolist()
                                interp_timestamp = frame_timestamps.get(interp_frame, None)
                                
                                # Update using the same pattern as above
                                objects_collection.update_one(
                                    {"_id": f"{video_id}_{track_id}"},
                                    {"$push": {"frames": {
                                        "frame": interp_frame,
                                        "timestamp": interp_timestamp,
                                        "box": interp_box,
                                        "confidence": None,
                                        "interpolated": True
                                    }}, "$set": {"end_time": timestamp}}
                                )
                prev_keyframe_boxes = dets.copy() if dets is not None else np.empty((0,4))
                prev_keyframe_tracks = tracked.copy() if tracked is not None else np.empty((0,5))
            frame_number += 1
            pbar.update(1)
    cap.release()
    out.release()
    logging.info(f"Annotated video saved at {annotated_video_path}")
    return annotated_video_path

def compute_iou(box1, box2):
    """
    Compute the Intersection over Union (IoU) of two bounding boxes.
    Each box is represented by a list of four coordinates: [x1, y1, x2, y2]
    """
    x_left = max(box1[0], box2[0])
    y_top = max(box1[1], box2[1])
    x_right = min(box1[2], box2[2])
    y_bottom = min(box1[3], box2[3])

    if x_right < x_left or y_bottom < y_top:
        return 0.0

    intersection_area = (x_right - x_left) * (y_bottom - y_top)

    box1_area = (box1[2] - box1[0]) * (box1[3] - box1[1])
    box2_area = (box2[2] - box2[0]) * (box2[3] - box2[1])

    iou = intersection_area / float(box1_area + box2_area - intersection_area)
    return iou

# def save_video_objects(file_name, metadata, s3_url):
#     video_document = {
#         "file_name": file_name,
#         "s3_url": s3_url,
#         "metadata": metadata
#     }
#     collection.insert_one(video_document)

def calculate_relative_position(box, frame_width, frame_height):
    """
    Calculate the relative position of the object in the frame.
    Returns [x_center_relative, y_center_relative]
    """
    x1, y1, x2, y2 = box
    x_center = (x1 + x2) / 2 / frame_width
    y_center = (y1 + y2) / 2 / frame_height
    return [x_center, y_center]

def convert_ms_to_timestamp(ms):
    """
    Convert milliseconds to a timestamp string in the format "HH:MM:SS.mmm".
    """
    seconds = ms / 1000
    return datetime.utcfromtimestamp(seconds).strftime('%H:%M:%S.%f')[:-3]

def annotate_frame(frame, results, frame_width, frame_height):
    """
    Draw bounding boxes and labels on the frame based on detection results.
    """
    for result in results:
        for box in result.boxes:
            # Extract object data
            box_coordinates = box.xyxy[0].tolist()
            label = model.names[int(box.cls[0])]
            confidence = float(box.conf[0])

            x1, y1, x2, y2 = map(int, box_coordinates)

            # Draw bounding box
            cv2.rectangle(frame, (x1, y1), (x2, y2), color=(0, 255, 0), thickness=2)

            # Prepare label with confidence
            label_text = f"{label} {confidence:.2f}"

            # Calculate position for label
            (text_width, text_height), baseline = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(frame, (x1, y1 - text_height - baseline), (x1 + text_width, y1), color=(0, 255, 0), thickness=-1)
            cv2.putText(frame, label_text, (x1, y1 - baseline), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
    
    return frame

# Video monitoring loop
if __name__ == "__main__":
    print("Starting video monitoring service. Press Ctrl+C to stop.")
    
    try:
        # Register signal handlers for graceful shutdown
        def signal_handler(sig, frame):
            print(f"Received signal {sig}, shutting down...")
            sys.exit(0)
            
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Simple monitoring loop
        while True:
            try:
                # Find and update a video with 'uploaded' status atomically - similar to fragmenter.js
                video = db.videos.find_one_and_update(
                    {"status": "uploaded"},
                    {"$set": {"status": "analyzing"}},
                    return_document=True
                )
                
                # If no video is found, sleep and continue
                if not video:
                    print("No videos to process")
                    time.sleep(2)
                    continue
                
                video_id = str(video["_id"])
                print(f"Processing video: {video_id}")
                
                try:
                    # Create a temporary directory for the video
                    with tempfile.TemporaryDirectory() as temp_dir:
                        # Define the local file path
                        local_file_path = os.path.join(temp_dir, f"{video_id}.mp4")
                        
                        # Download the video from S3
                        print(f"Downloading video {video_id} from S3")
                        s3_client.download_file(BUCKET_NAME, video_id, local_file_path)
                        
                        # Process the video
                        print(f"Processing video {video_id}")
                        process_video(local_file_path)
                        
                        # Update status to 'analyzed'
                        db.videos.update_one(
                            {"_id": ObjectId(video_id)},
                            {"$set": {"status": "analyzed"}}
                        )
                        print(f"Video {video_id} processed successfully")
                        
                except Exception as e:
                    print(f"Error processing video {video_id}: {e}")
                    # Update status to 'error'
                    db.videos.update_one(
                        {"_id": ObjectId(video_id)},
                        {"$set": {"status": "error", "error": str(e)}}
                    )
                
            except Exception as e:
                print(f"Error in monitoring loop: {e}")
                # Sleep a bit longer if there was an error
                time.sleep(5)
                
    except KeyboardInterrupt:
        print("Shutting down...")
