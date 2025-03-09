"""
Video processor for object detection and tracking
"""
import os
import uuid
from typing import Dict, List, Tuple, Any, Optional, Union
import cv2
import logging
from datetime import datetime
from tqdm import tqdm
from ML.utils.connections import objects_collection
from ML.utils.logging_config import setup_logging, get_logger
from ML.models import get_model

# Set up logging
setup_logging(log_file='logs/video_processing.log')
logger = get_logger(__name__)

class VideoProcessor:
    """
    Video processor for object detection and tracking
    """
    
    def __init__(self, model_name: str = "yolo", model_path: Optional[str] = None, 
                 device: str = "cpu", **kwargs: Any) -> None:
        """
        Initialize the video processor
        
        Args:
            model_name: Name of the model to use
            model_path: Path to the model weights
            device: Device to run inference on ('cpu' or 'cuda')
            **kwargs: Additional model-specific parameters
        """
        self.model = get_model(model_name, model_path=model_path, device=device, **kwargs)
        
        # Tracking parameters
        self.timeout_threshold = kwargs.get('timeout_threshold', 2000)  # ms
        self.iou_threshold = kwargs.get('iou_threshold', 0.3)
    
    def process_video(self, video_path: str) -> str:
        """
        Process a video file for object detection and tracking
        
        Args:
            video_path: Path to the video file
            
        Returns:
            Path to the annotated video
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            error_msg = f"Could not open video file: {video_path}"
            logger.error(error_msg)
            raise ValueError(error_msg)
        
        frame_number = 0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # Get frame dimensions
        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Get Frames Per Second (FPS)
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps == 0:
            fps = 30  # Default to 30 if FPS is not available

        # Initialize VideoWriter to save the annotated video
        video_name = os.path.basename(video_path)
        annotated_video_name = f"annotated_{video_name}"
        annotated_video_path = os.path.join(os.path.dirname(video_path), annotated_video_name)

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')  # Codec for MP4
        out = cv2.VideoWriter(annotated_video_path, fourcc, fps, (frame_width, frame_height))
        logger.info(f"Initialized VideoWriter for annotated video at {annotated_video_path}")

        # Temporary in-memory tracker for active objects
        # Format: {object_name: [{"instance_id": str, "last_frame": int, "last_timestamp_ms": float, "last_box": list}, ...]}
        active_objects: Dict[str, List[Dict[str, Any]]] = {}

        with tqdm(total=total_frames, desc=f"Processing {video_name}", unit="frame") as pbar:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                # Run object detection
                results = self.model.predict(frame)
                
                # Extract frame timestamp
                timestamp_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
                timestamp = convert_ms_to_timestamp(timestamp_ms)

                # Extract detections
                detections = self.model.extract_detections(results, frame_width, frame_height)
                
                # Process each detection for tracking
                for detection in detections:
                    label = detection["class"]
                    confidence = detection["confidence"]
                    box_coordinates = detection["box"]
                    relative_position = detection["relative_position"]

                    logger.debug(
                        f"Frame {frame_number}: Detected {label} with confidence {confidence:.2f}, "
                        f"Box: {box_coordinates}, Relative Position: {relative_position}"
                    )

                    # Initialize the list for this label if not present
                    if label not in active_objects:
                        active_objects[label] = []

                    matched_instance = None
                    max_iou = 0

                    # Iterate over existing active instances of this label to find a match
                    for obj in active_objects[label]:
                        iou = compute_iou(box_coordinates, obj["last_box"])
                        if iou > self.iou_threshold and iou > max_iou:
                            max_iou = iou
                            matched_instance = obj

                    if matched_instance:
                        # Update existing instance
                        matched_instance["last_frame"] = frame_number
                        matched_instance["last_timestamp_ms"] = timestamp_ms
                        matched_instance["last_box"] = box_coordinates
                        matched_instance["end_time"] = timestamp_to_seconds(timestamp)  # Update end_time

                        # Add frame data to MongoDB
                        objects_collection.update_one(
                            {"_id": matched_instance["instance_id"]},
                            {"$push": {"frames": {
                                "frame": frame_number,
                                "timestamp": timestamp,
                                "box": box_coordinates,
                                "relative_position": relative_position,
                                "confidence": confidence
                            }},
                            "$set": {"end_time": timestamp_to_seconds(timestamp)}  # Update end_time
                            }
                        )
                    else:
                        # Create a new instance
                        instance_id = str(uuid.uuid4())  # Unique identifier for the new instance
                        new_instance = {
                            "instance_id": instance_id,
                            "last_frame": frame_number,
                            "start_time": timestamp_to_seconds(timestamp),  # Set start_time
                            "end_time": timestamp_to_seconds(timestamp),    # Initialize end_time
                            "last_timestamp_ms": timestamp_ms,
                            "last_box": box_coordinates
                        }
                        active_objects[label].append(new_instance)

                        # Create a new document in MongoDB for this instance
                        new_doc = {
                            "_id": instance_id,
                            "video_id": video_name,
                            "object_name": label,
                            "start_time": timestamp_to_seconds(timestamp), 
                            "end_time": timestamp_to_seconds(timestamp),    # Initialize end_time
                            "frames": [{
                                "frame": frame_number,
                                "timestamp": timestamp,
                                "box": box_coordinates,
                                "relative_position": relative_position,
                                "confidence": confidence
                            }]
                        }
                        objects_collection.insert_one(new_doc)

                        logger.info(f"Created new instance ID {instance_id} for label '{label}'")

                # Annotate the frame with bounding boxes and labels
                annotated_frame = self.model.annotate_frame(frame, results)

                # Write the annotated frame to the output video
                out.write(annotated_frame)

                # Remove expired objects (based on timeout threshold)
                for label, instances in list(active_objects.items()):
                    active_objects[label] = [
                        obj for obj in instances 
                        if (timestamp_ms - obj["last_timestamp_ms"]) <= self.timeout_threshold
                    ]
                    if not active_objects[label]:
                        del active_objects[label]

                # Increment frame number
                frame_number += 1

                # Update the progress bar
                pbar.update(1)

        # Release resources
        cap.release()
        out.release()
        logger.info(f"Annotated video saved at {annotated_video_path}")
        
        return annotated_video_path


# Helper functions
def timestamp_to_seconds(timestamp: str) -> float:
    """
    Convert a timestamp string to seconds
    
    Args:
        timestamp: Timestamp in format HH:MM:SS.mmm
        
    Returns:
        Timestamp in seconds
    """
    hours, minutes, seconds = map(float, timestamp.split(':'))
    total_seconds = hours * 3600 + minutes * 60 + seconds
    return total_seconds


def convert_ms_to_timestamp(ms: float) -> str:
    """
    Convert milliseconds to a timestamp string
    
    Args:
        ms: Milliseconds
        
    Returns:
        Timestamp in format HH:MM:SS.mmm
    """
    seconds = ms / 1000
    return datetime.utcfromtimestamp(seconds).strftime('%H:%M:%S.%f')[:-3]


def compute_iou(box1: List[float], box2: List[float]) -> float:
    """
    Compute the Intersection over Union (IoU) of two bounding boxes
    
    Args:
        box1: First box coordinates [x1, y1, x2, y2]
        box2: Second box coordinates [x1, y1, x2, y2]
        
    Returns:
        IoU value between 0 and 1
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