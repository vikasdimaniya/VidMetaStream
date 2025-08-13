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

# Configure root logger
logging.root.setLevel(logging.INFO)

# Create a FileHandler to write logs to a file
file_handler = logging.FileHandler('video_processing.log', mode='w')
file_handler.setLevel(logging.INFO)

# Create and set the custom formatter with valid logging format placeholders
formatter = CustomFormatter(fmt='%(asctime)s - %(levelname)s - %(message)s')  # Ensures milliseconds are included
file_handler.setFormatter(formatter)

# Add the FileHandler to the root logger
logging.getLogger().addHandler(file_handler)

# Add a console handler for terminal output
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(formatter)
logging.getLogger().addHandler(console_handler)

logging.info("Logging initialized for video processing")

def process_video(
    video_path,
    output_dir,
    detection_model,
    config,
    gpu_id=0,
    keyframe_interval=5
):
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
    ssim_threshold = 0.95
    prev_keyframe_gray = None
    prev_keyframe_num = 0
    prev_keyframe_boxes = None
    prev_keyframe_tracks = None
    prev_keyframe_timestamp = None

    # SORT tracker
    sort_tracker = Sort(max_age=5, min_hits=2, iou_threshold=0.3)
    max_track_id = -1
    existing_track_ids = set()
    tracks_per_frame = {}
    boxes_per_frame = {}
    frame_timestamps = {}

    # Define frame center (used later for optical flow calculations)
    frame_center = (frame_width // 2, frame_height // 2)

    with tqdm(total=total_frames, desc=f"Processing {video_name}", unit="frame") as pbar:
        print(f"Processing {video_name}")
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
                # Run the tracker
                tracked = sort_tracker.update(dets)
                track_ids = tracked[:, 4].astype(int).tolist() if tracked is not None and len(tracked) > 0 else []
                max_track_id = max(max_track_id, max(track_ids) if track_ids else -1)
                existing_track_ids.update(track_ids)
                
                # Log the tracking results
                logging.info(f"Frame {frame_number}, detected objects: {len(dets) if dets is not None else 0}")
                logging.info(f"Frame {frame_number}, tracked objects: {len(tracked) if tracked is not None else 0}")
                if tracked is not None and len(tracked) > 0:
                    logging.info(f"Track IDs: {track_ids}")
                else:
                    logging.info("No tracked objects in this frame")

                tracks_per_frame[frame_number] = tracked.copy() if tracked is not None else np.empty((0,5))
                boxes_per_frame[frame_number] = dets.copy() if dets is not None else np.empty((0,4))

                if frame_number % keyframe_interval == 0:
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
                        track_id = int(track_id)  # Ensure track_id is an integer
                        # Use consistent ID format for MongoDB documents
                        object_id = f"{video_id}_{track_id}"
                        
                        # Check if the object already exists before updating
                        existing_obj = objects_collection.find_one({"_id": object_id})
                        
                        if existing_obj:
                            # Object exists, update with $push to frames
                            logging.info(f"Updating existing object {object_id} with new frame {frame_number}")
                            objects_collection.update_one(
                                {"_id": object_id},
                                {"$push": {"frames": {
                                    "frame": frame_number,
                                    "timestamp": timestamp,
                                    "box": [x1, y1, x2, y2],
                                    "confidence": None,
                                    "interpolated": False
                                }}, "$set": {"end_time": timestamp}}
                            )
                        else:
                            # New object - check if it's similar to any recently disappeared object
                            box = [x1, y1, x2, y2]
                            similar_obj_id = find_similar_object(video_id, frame_number, box)
                            
                            if similar_obj_id:
                                # Use the existing object ID instead of creating a new one
                                logging.info(f"Reusing existing object ID {similar_obj_id} instead of creating {object_id}")
                                objects_collection.update_one(
                                    {"_id": similar_obj_id},
                                    {"$push": {"frames": {
                                        "frame": frame_number,
                                        "timestamp": timestamp,
                                        "box": [x1, y1, x2, y2],
                                        "confidence": None,
                                        "interpolated": False
                                    }}, "$set": {"end_time": timestamp}}
                                )
                                
                                # Store the mapping for future frames
                                # This part is important for interpolation and the rest of the processing
                                object_id = similar_obj_id
                            else:
                                # Object doesn't exist yet, create new document
                                logging.info(f"Creating new object document for {object_id}")
                                objects_collection.insert_one({
                                    "_id": object_id,
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
                    logging.info(f"Interpolating between frame {prev_keyframe_num} and {frame_number}")
                    
                    for skipped in range(prev_keyframe_num+1, frame_number):
                        prev_tracks = {int(t[4]): t[:4] for t in prev_keyframe_tracks}
                        curr_tracks = {int(t[4]): t[:4] for t in tracked}
                        # Interpolate only for tracks present in both keyframes
                        common_track_ids = set(prev_tracks.keys()) & set(curr_tracks.keys())
                        logging.info(f"Found {len(common_track_ids)} tracks to interpolate")
                        
                        for track_id in common_track_ids:
                            logging.info(f"Processing track ID: {track_id}")
                            
                            # Extract the bounding box coordinates
                            box_A = np.array(prev_tracks[track_id])
                            box_B = np.array(curr_tracks[track_id])
                            for i in range(1, frame_number - prev_keyframe_num):
                                interp_frame = prev_keyframe_num + i
                                ratio = i / (frame_number - prev_keyframe_num)
                                interp_box = box_A + (box_B - box_A) * ratio
                                interp_box = interp_box.tolist()
                                interp_timestamp = frame_timestamps.get(interp_frame, None)
                                
                                # Log the interpolation operation
                                logging.info(f"Interpolating track {track_id} at frame {interp_frame}, ratio: {ratio:.2f}")
                                
                                try:
                                    # Use consistent object_id format
                                    object_id = f"{video_id}_{track_id}"
                                    
                                    # Update using the same pattern as above
                                    result = objects_collection.update_one(
                                        {"_id": object_id},
                                        {"$push": {"frames": {
                                            "frame": interp_frame,
                                            "timestamp": interp_timestamp,
                                            "box": interp_box,
                                            "confidence": None,
                                            "interpolated": True
                                        }}, "$set": {"end_time": timestamp}}
                                    )
                                    logging.info(f"MongoDB update result for interpolation: matched={result.matched_count}, modified={result.modified_count}")
                                except Exception as e:
                                    logging.error(f"Error updating interpolated frame: {e}")
                else:
                    logging.info("No previous keyframe data available for interpolation")
                prev_keyframe_boxes = dets.copy() if dets is not None else np.empty((0,4))
                prev_keyframe_tracks = tracked.copy() if tracked is not None else np.empty((0,5))
                
                logging.info(f"Setting previous keyframe tracks. tracked is None: {tracked is None}")
                if tracked is not None:
                    logging.info(f"tracked shape: {tracked.shape}, data: {tracked}")
                    logging.info(f"prev_keyframe_tracks shape: {prev_keyframe_tracks.shape}, data: {prev_keyframe_tracks}")
                else:
                    logging.info("No tracked data available for keyframe")
            else:
                # Perform interpolation using optical flow
                if prev_keyframe_tracks is not None and len(prev_keyframe_tracks) > 0:
                    logging.info(f"Interpolating frame {frame_number} from keyframe {prev_keyframe_num}")
                    logging.info(f"Previous keyframe has {len(prev_keyframe_tracks)} tracks")
                    
                    # Find good features to track on the previous keyframe
                    prev_keyframe_points = cv2.goodFeaturesToTrack(prev_keyframe_gray, mask=None, maxCorners=1000, qualityLevel=0.01, minDistance=10)

                    if prev_keyframe_points is not None:
                        # Calculate optical flow
                        new_points, status, _ = cv2.calcOpticalFlowPyrLK(prev_keyframe_gray, gray, prev_keyframe_points, None)

                        # Process valid points
                        valid_indices = np.where(status == 1)[0]
                        valid_prev_points = prev_keyframe_points[valid_indices].reshape(-1, 2)
                        valid_new_points = new_points[valid_indices].reshape(-1, 2)

                        if len(valid_prev_points) > 0 and len(valid_new_points) > 0:
                            # Calculate how much points moved on average
                            shifts = valid_new_points - valid_prev_points
                            avg_shift = np.mean(shifts, axis=0)
                            scale_factors = []

                            for i, (px, py) in enumerate(valid_prev_points):
                                nx, ny = valid_new_points[i]
                                # Calculate distance from point to center in both frames
                                prev_dist = np.sqrt((px - frame_center[0])**2 + (py - frame_center[1])**2)
                                new_dist = np.sqrt((nx - frame_center[0])**2 + (ny - frame_center[1])**2)
                                if prev_dist > 0:  # Avoid division by zero
                                    scale_factors.append(new_dist / prev_dist)

                            # Median is more robust to outliers than mean
                            if scale_factors:
                                median_scale = np.median(scale_factors)
                                logging.info(f"Interpolation metrics - Avg shift: {avg_shift}, Scale: {median_scale}")
                            else:
                                median_scale = 1.0
                                logging.info("No valid scale factors found, using default scale of 1.0")

                            # Apply transformations to each bounding box from prev keyframe
                            interpolated_tracks = []
                            
                            for track in prev_keyframe_tracks:
                                track_id = track[4]
                                logging.info(f"Processing track ID: {track_id}")
                                
                                # Extract the bounding box coordinates
                                x1, y1, x2, y2 = track[0:4]
                                
                                # Calculate center of the bounding box
                                center_x = (x1 + x2) / 2
                                center_y = (y1 + y2) / 2
                                
                                # Calculate width and height
                                width = x2 - x1
                                height = y2 - y1
                                
                                # Apply shift
                                new_center_x = center_x + avg_shift[0]
                                new_center_y = center_y + avg_shift[1]
                                
                                # Apply scale (scaling from center)
                                new_width = width * median_scale
                                new_height = height * median_scale
                                
                                # Calculate new bounding box coordinates
                                new_x1 = new_center_x - new_width / 2
                                new_y1 = new_center_y - new_height / 2
                                new_x2 = new_center_x + new_width / 2
                                new_y2 = new_center_y + new_height / 2
                                
                                # Append the interpolated track
                                interpolated_track = np.array([new_x1, new_y1, new_x2, new_y2, track_id])
                                interpolated_tracks.append(interpolated_track)
                            
                            if interpolated_tracks:
                                logging.info(f"Successfully interpolated {len(interpolated_tracks)} tracks")
                                tracks_per_frame[frame_number] = np.array(interpolated_tracks)
                                
                                # Save optical flow interpolated tracks to MongoDB
                                timestamp = frame_timestamps.get(frame_number, None)
                                for track in interpolated_tracks:
                                    track_id = int(track[4])
                                    x1, y1, x2, y2 = track[0:4].tolist()
                                    try:
                                        # Use consistent object_id format
                                        object_id = f"{video_id}_{track_id}"
                                        
                                        # Update the MongoDB document
                                        result = objects_collection.update_one(
                                            {"_id": object_id},
                                            {"$push": {"frames": {
                                                "frame": frame_number,
                                                "timestamp": timestamp,
                                                "box": [x1, y1, x2, y2],
                                                "confidence": None,
                                                "interpolated": True
                                            }}, "$set": {"end_time": timestamp}}
                                        )
                                        logging.info(f"MongoDB optical flow update result: matched={result.matched_count}, modified={result.modified_count}")
                                    except Exception as e:
                                        logging.error(f"Error updating optical flow interpolated frame: {e}")
                            else:
                                logging.warning("Interpolation resulted in no tracks")
                                tracks_per_frame[frame_number] = np.empty((0, 5))
                        else:
                            logging.warning("No valid optical flow points found")
                            tracks_per_frame[frame_number] = np.empty((0, 5))
                    else:
                        logging.warning("No good features found in previous keyframe")
                        tracks_per_frame[frame_number] = np.empty((0, 5))
                else:
                    logging.warning(f"No tracks in previous keyframe {prev_keyframe_num}")
                    tracks_per_frame[frame_number] = np.empty((0, 5))
            frame_number += 1
            pbar.update(1)
    cap.release()
    out.release()
    
    # Apply jitter detection and correction
    logging.info("Applying jitter detection and correction to tracked objects...")
    handle_object_jitter(video_id, fps)
    logging.info("Jitter correction completed")
    
    # Delete the annotated video file since we don't need to store it
    logging.info(f"Cleaning up temporary file: {annotated_video_path}")
    try:
        os.remove(annotated_video_path)
        logging.info(f"Successfully deleted {annotated_video_path}")
    except Exception as e:
        logging.error(f"Error deleting temporary file: {e}")
    
    # Save video metadata to MongoDB
    metadata = {
        "frame_width": frame_width,
        "frame_height": frame_height,
        "fps": fps,
        "total_frames": total_frames,
        "track_count": len(existing_track_ids),
        "max_track_id": max_track_id
    }
    
    # Update the video document with metadata (don't store S3 URL)
    video_document = {
        "file_name": video_name,
        "metadata": metadata,
        "processed_at": datetime.now().isoformat()
    }
    
    collection.insert_one(video_document)
    
    logging.info(f"Completed processing video {video_path}")
    return metadata

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

def find_similar_object(video_id, current_frame, box, time_window_seconds=5.0, ssim_threshold=0.7):
    """
    Check if there are any similar objects that disappeared recently.
    
    Args:
        video_id: ID of the video being processed
        current_frame: Current frame number
        box: Bounding box of the new object [x1, y1, x2, y2]
        time_window_seconds: How far back in time to look for similar objects (in seconds)
        ssim_threshold: SSIM threshold to consider objects similar
        
    Returns:
        The object ID of a similar object if found, None otherwise
    """
    try:
        # Find all objects in this video
        objects = collection.find({"video_id": video_id})
        
        # Get video metadata to calculate time window in frames
        video_metadata = collection.find_one({"file_name": f"{video_id}.mp4"})
        if not video_metadata or "metadata" not in video_metadata:
            logging.warning(f"Could not find metadata for video {video_id}")
            return None
            
        fps = video_metadata["metadata"].get("fps", 30)  # Default to 30 if not found
        frame_window = int(time_window_seconds * fps)
        frame_threshold = current_frame - frame_window
        
        # If frame_threshold is negative, we're at the beginning of the video
        if frame_threshold < 0:
            return None
        
        best_match = None
        best_similarity = 0
        
        # Get the video path to extract patches for SSIM comparison
        video_path = None
        video_doc = db.videos.find_one({"_id": ObjectId(video_id)})
        if video_doc:
            video_path = os.path.join(os.getenv("TEMP_DIR", "/tmp"), f"{video_id}.mp4")
        
        if not video_path or not os.path.exists(video_path):
            logging.warning(f"Cannot find video path for SSIM comparison. Falling back to IoU.")
            # Fall back to IoU-based comparison
            for obj in objects:
                # Skip if this is not a tracked object doc
                if "_id" not in obj or not isinstance(obj["_id"], str) or "frames" not in obj:
                    continue
                    
                frames = obj["frames"]
                if not frames:
                    continue
                    
                # Sort frames by frame number (descending)
                frames.sort(key=lambda x: x["frame"], reverse=True)
                
                # Get the last frame where this object was tracked
                last_frame = frames[0]["frame"]
                
                # Check if this object disappeared recently
                if last_frame < frame_threshold or last_frame >= current_frame:
                    continue
                    
                # Get the bounding box of the last known position
                last_box = frames[0]["box"]
                
                # Calculate IoU between current box and last known box
                iou = compute_iou(box, last_box)
                
                # Use 0.5 as a fallback IoU threshold
                if iou > 0.5 and iou > best_similarity:
                    best_similarity = iou
                    best_match = obj["_id"]
        else:
            # Use SSIM-based comparison
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                logging.error(f"Could not open video {video_path}")
                return None
                
            # Extract patch from current frame
            cap.set(cv2.CAP_PROP_POS_FRAMES, current_frame)
            ret, current_frame_img = cap.read()
            if not ret:
                cap.release()
                return None
                
            # Extract the object patch using the bounding box
            x1, y1, x2, y2 = [int(coord) for coord in box]
            current_patch = current_frame_img[y1:y2, x1:x2]
            if current_patch.size == 0:
                logging.warning(f"Empty patch for current frame {current_frame}")
                cap.release()
                return None
                
            # Convert to grayscale for SSIM
            current_patch_gray = cv2.cvtColor(current_patch, cv2.COLOR_BGR2GRAY)
            
            for obj in objects:
                # Skip if this is not a tracked object doc
                if "_id" not in obj or not isinstance(obj["_id"], str) or "frames" not in obj:
                    continue
                    
                frames = obj["frames"]
                if not frames:
                    continue
                    
                # Sort frames by frame number (descending)
                frames.sort(key=lambda x: x["frame"], reverse=True)
                
                # Get the last frame where this object was tracked
                last_frame_data = frames[0]
                last_frame_num = last_frame_data["frame"]
                
                # Check if this object disappeared recently
                if last_frame_num < frame_threshold or last_frame_num >= current_frame:
                    continue
                    
                # Get the bounding box of the last known position
                last_box = last_frame_data["box"]
                
                # Extract patch from the last frame
                cap.set(cv2.CAP_PROP_POS_FRAMES, last_frame_num)
                ret, last_frame_img = cap.read()
                if not ret:
                    continue
                    
                # Extract the object patch using the bounding box
                x1, y1, x2, y2 = [int(coord) for coord in last_box]
                last_patch = last_frame_img[y1:y2, x1:x2]
                if last_patch.size == 0:
                    continue
                    
                # Convert to grayscale for SSIM
                last_patch_gray = cv2.cvtColor(last_patch, cv2.COLOR_BGR2GRAY)
                
                # Resize patches to match (required for SSIM)
                height = min(current_patch_gray.shape[0], last_patch_gray.shape[0])
                width = min(current_patch_gray.shape[1], last_patch_gray.shape[1])
                
                if height <= 0 or width <= 0:
                    continue
                    
                current_patch_resized = cv2.resize(current_patch_gray, (width, height))
                last_patch_resized = cv2.resize(last_patch_gray, (width, height))
                
                # Calculate SSIM between the patches
                try:
                    similarity, _ = ssim(current_patch_resized, last_patch_resized, full=True)
                    
                    if similarity > ssim_threshold and similarity > best_similarity:
                        best_similarity = similarity
                        best_match = obj["_id"]
                except Exception as e:
                    logging.error(f"Error calculating SSIM: {e}")
            
            cap.release()
                
        if best_match:
            logging.info(f"Found similar object {best_match} with similarity {best_similarity:.2f}")
            
        return best_match
    
    except Exception as e:
        logging.error(f"Error finding similar objects: {e}")
        return None

def handle_object_jitter(video_id, fps):
    """
    Post-process the object tracking data to handle jitter.
    - If an object disappears for less than 0.25 seconds, interpolate it
    - If an object disappears for more than 0.25 seconds, consider it a true disappearance
    
    Args:
        video_id: The ID of the video being processed
        fps: Frames per second of the video
    """
    # Calculate frame threshold for 0.25 seconds
    frame_threshold = int(0.25 * fps)
    logging.info(f"Jitter threshold: {frame_threshold} frames (0.25s at {fps} fps)")
    
    # Get all tracked objects for this video
    objects = collection.find({"video_id": video_id})
    
    for obj in objects:
        track_id = obj["track_id"]
        object_id = obj["_id"]
        frames = obj["frames"]
        
        # Sort frames by frame number
        frames.sort(key=lambda x: x["frame"])
        
        # Find gaps in frame sequences
        if len(frames) < 2:
            continue
            
        frame_numbers = [f["frame"] for f in frames]
        gaps = []
        
        for i in range(len(frame_numbers) - 1):
            if frame_numbers[i+1] - frame_numbers[i] > 1:
                gap_start = frame_numbers[i]
                gap_end = frame_numbers[i+1]
                gap_size = gap_end - gap_start - 1
                
                if gap_size <= frame_threshold:
                    # This is a jitter gap that needs interpolation
                    gaps.append((gap_start, gap_end, i))
        
        # Process each gap for interpolation
        new_frames = []
        for gap_start, gap_end, idx in gaps:
            logging.info(f"Handling jitter for object {object_id}: filling gap from frame {gap_start} to {gap_end}")
            
            # Get the frames before and after the gap
            before_frame = frames[idx]
            after_frame = frames[idx + 1]
            
            # Extract bounding boxes
            box_before = before_frame["box"]
            box_after = after_frame["box"]
            
            # Interpolate for each missing frame
            for i in range(1, gap_end - gap_start):
                frame_num = gap_start + i
                ratio = i / (gap_end - gap_start)
                
                # Linear interpolation of bounding box
                interp_box = [
                    box_before[0] + (box_after[0] - box_before[0]) * ratio,
                    box_before[1] + (box_after[1] - box_before[1]) * ratio,
                    box_before[2] + (box_after[2] - box_before[2]) * ratio,
                    box_before[3] + (box_after[3] - box_before[3]) * ratio
                ]
                
                # Create interpolated frame entry
                timestamp = None
                for f in frames:
                    if f["frame"] == frame_num:
                        timestamp = f["timestamp"]
                        break
                
                if timestamp is None:
                    # Linearly interpolate timestamp from surrounding frames
                    timestamp_before = timestamp_to_seconds(before_frame["timestamp"])
                    timestamp_after = timestamp_to_seconds(after_frame["timestamp"])
                    timestamp_interp = timestamp_before + (timestamp_after - timestamp_before) * ratio
                    timestamp = convert_seconds_to_timestamp(timestamp_interp)
                
                new_frame = {
                    "frame": frame_num,
                    "timestamp": timestamp,
                    "box": interp_box,
                    "confidence": None,
                    "interpolated": True,
                    "jitter_corrected": True
                }
                
                new_frames.append(new_frame)
        
        # Update MongoDB with the new interpolated frames
        for new_frame in new_frames:
            try:
                collection.update_one(
                    {"_id": object_id},
                    {"$push": {"frames": new_frame}}
                )
                logging.info(f"Added jitter-corrected frame {new_frame['frame']} for object {object_id}")
            except Exception as e:
                logging.error(f"Error updating jitter correction: {e}")

def convert_seconds_to_timestamp(seconds):
    """Convert seconds to timestamp format HH:MM:SS.mmm"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    seconds_remainder = seconds % 60
    milliseconds = int((seconds_remainder - int(seconds_remainder)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{int(seconds_remainder):02d}.{milliseconds:03d}"

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
                        process_video(
                            video_path=local_file_path,
                            output_dir=temp_dir,
                            detection_model=model,
                            config={
                                "conf_threshold": 0.25,
                                "iou_threshold": 0.45
                            }
                        )
                        
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
