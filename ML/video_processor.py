"""
Video processor for object detection and tracking
"""
import os
import sys
import uuid
import time
from typing import Dict, List, Tuple, Any, Optional, Union
import cv2
import logging
from datetime import datetime
from tqdm import tqdm
import boto3
from botocore.config import Config as BotoCoreConfig
from dotenv import load_dotenv
import supervision as sv
from inference.models.yolo_world.yolo_world import YOLOWorld

# Add the project root to Python path when running directly
if __name__ == "__main__":
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, project_root)

from ML.utils.connections import objects_collection, get_database, get_s3_client
from ML.utils.logging_config import setup_logging, get_logger

# Set up logging
setup_logging(log_file='logs/video_processing.log')
logger = get_logger(__name__)

# Load environment variables if running directly
if __name__ == "__main__":
    load_dotenv()
    # AWS configuration
    AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY")
    AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_REGION = os.getenv("AWS_REGION")
    BUCKET_NAME = os.getenv("AWS_STORAGE_BUCKET_NAME", "adtbucket")

    # Initialize S3 client if credentials are available
    if AWS_ACCESS_KEY and AWS_SECRET_KEY:
        # Create boto3 config
        boto_config = BotoCoreConfig(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"}
        )
        
        s3_client = boto3.client(
            "s3",
            aws_access_key_id=AWS_ACCESS_KEY,
            aws_secret_access_key=AWS_SECRET_KEY,
            region_name=AWS_REGION,
            config=boto_config
        )
    else:
        # Try to use the S3 client from connections.py
        try:
            s3_client = get_s3_client()
        except Exception as e:
            s3_client = None
            logger.warning(f"Failed to get S3 client: {str(e)}. S3 functionality disabled.")

class VideoProcessor:
    """
    Video processor for object detection and tracking
    """
    
    def __init__(self, model_name: str = "yolo_world", model_path: Optional[str] = None, 
                 device: str = "cpu", confidence_threshold: float = 0.25, 
                 timeout_threshold: int = 2000, iou_threshold: float = 0.3,
                 **kwargs: Any) -> None:
        """
        Initialize the video processor
        
        Args:
            model_name: Name of the model to use
            model_path: Path to the model weights
            device: Device to run inference on ('cpu' or 'cuda')
            confidence_threshold: Minimum confidence threshold for detections
            timeout_threshold: Timeout threshold for tracking in milliseconds
            iou_threshold: IoU threshold for tracking
            **kwargs: Additional model-specific parameters
        """
        # Initialize YOLO-World model
        self.model = YOLOWorld(model_id="yolo_world/l")
        
        # Load custom classes
        classes_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "classes.csv")
        try:
            with open(classes_path, "r") as f:
                self.class_list = [line.strip() for line in f if line.strip()]
            
            # Set custom classes
            self.model.set_classes(self.class_list)
            logger.info(f"Loaded {len(self.class_list)} custom classes for YOLO-World model")
        except Exception as e:
            logger.error(f"Failed to load custom classes: {str(e)}")
            
        # Initialize annotators
        self.box_annotator = sv.BoxAnnotator(thickness=2)
        self.label_annotator = sv.LabelAnnotator()
        
        self.device = device
        self.confidence_threshold = confidence_threshold
        
        # Tracking parameters
        self.timeout_threshold = timeout_threshold
        self.iou_threshold = iou_threshold
    
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
        if not annotated_video_name.endswith('.mp4') and not annotated_video_name.endswith('.mp4v'):
            # Add .mp4 extension if missing
            annotated_video_name += '.mp4'
        annotated_video_path = os.path.join(os.path.dirname(video_path), annotated_video_name)

        # Use MP4V codec for compatibility
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

                # Run object detection with YOLO-World
                results = self.model.infer(frame)
                
                # Convert results to supervision Detections
                detections = sv.Detections.from_inference(results)
                
                # Extract frame timestamp
                timestamp_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
                timestamp = convert_ms_to_timestamp(timestamp_ms)

                # Process detections
                if len(detections) > 0:
                    for i in range(len(detections)):
                        # Extract object data
                        confidence = float(detections.confidence[i])
                        
                        # Skip low confidence detections
                        if confidence < self.confidence_threshold:
                            continue
                            
                        box_coordinates = detections.xyxy[i].tolist()
                        label = detections.data.get('class_name', [])[i] if 'class_name' in detections.data else "unknown"
                        
                        relative_position = calculate_relative_position(box_coordinates, frame_width, frame_height)

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
                annotated_frame = self.annotate_frame(frame, detections)

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
    
    def annotate_frame(self, frame, detections):
        """
        Draw bounding boxes and labels on the frame based on detection results using supervision.
        """
        # Generate labels for each detection
        labels = [
            f"{detections.data['class_name'][i]} {detections.confidence[i]:.2f}"
            for i in range(len(detections)) if detections.confidence[i] >= self.confidence_threshold
        ]
        
        # Filter detections based on confidence threshold
        mask = detections.confidence >= self.confidence_threshold
        filtered_detections = detections[mask]
        filtered_labels = [labels[i] for i, include in enumerate(mask) if include]
        
        # Annotate frame with bounding boxes
        annotated_frame = self.box_annotator.annotate(scene=frame.copy(), detections=filtered_detections)
        
        # Annotate frame with labels
        if len(filtered_detections) > 0:
            annotated_frame = self.label_annotator.annotate(
                scene=annotated_frame, 
                detections=filtered_detections, 
                labels=filtered_labels
            )
        
        return annotated_frame
    
    def extract_detections(self, results, frame_width, frame_height):
        """
        Extract detections from YOLO-World model results
        
        Args:
            results: Model prediction results
            frame_width: Width of the frame
            frame_height: Height of the frame
            
        Returns:
            List of detections with their details
        """
        # Convert results to supervision Detections
        detections = sv.Detections.from_inference(results)
        
        extracted_detections = []
        
        for i in range(len(detections)):
            confidence = float(detections.confidence[i])
            
            # Skip low confidence detections
            if confidence < self.confidence_threshold:
                continue
                
            box_coordinates = detections.xyxy[i].tolist()
            label = detections.data.get('class_name', [])[i] if 'class_name' in detections.data else "unknown"
            relative_position = calculate_relative_position(box_coordinates, frame_width, frame_height)
            
            extracted_detections.append({
                "class": label,
                "confidence": confidence,
                "box": box_coordinates,
                "relative_position": relative_position
            })
            
        return extracted_detections
    
    def predict(self, frame):
        """
        Run object detection on a single frame using YOLO-World
        
        Args:
            frame: Input frame
            
        Returns:
            Detection results
        """
        return self.model.infer(frame)


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
    # Use timezone-aware version to avoid deprecation warning
    try:
        # For Python 3.11+
        from datetime import UTC
        return datetime.fromtimestamp(seconds, UTC).strftime('%H:%M:%S.%f')[:-3]
    except ImportError:
        # Fallback for older Python versions
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


def calculate_relative_position(box: List[float], frame_width: int, frame_height: int) -> List[float]:
    """
    Calculate the relative position of the object in the frame.
    
    Args:
        box: Bounding box coordinates [x1, y1, x2, y2]
        frame_width: Width of the frame
        frame_height: Height of the frame
        
    Returns:
        [x_center_relative, y_center_relative]
    """
    x1, y1, x2, y2 = box
    x_center = (x1 + x2) / 2 / frame_width
    y_center = (y1 + y2) / 2 / frame_height
    return [x_center, y_center]


def download_from_s3(bucket_name, video_id, download_path):
    """
    Download a video from S3
    
    Args:
        bucket_name: S3 bucket name
        video_id: Video ID in S3
        download_path: Local path to save the video
        
    Returns:
        Path to the downloaded video
    """
    # Create temp directory if it doesn't exist
    os.makedirs(os.path.dirname(download_path), exist_ok=True)
    
    try:
        logger.info(f"Downloading video {video_id} from S3 bucket {bucket_name}")
        s3_client.download_file(bucket_name, video_id, download_path)
        logger.info(f"Successfully downloaded video to {download_path}")
        return download_path
    except Exception as e:
        logger.error(f"Error downloading video from S3: {str(e)}")
        raise


def upload_to_s3(file_path, bucket_name, object_name=None):
    """
    Upload a file to S3
    
    Args:
        file_path: Path to the file to upload
        bucket_name: S3 bucket name
        object_name: S3 object name (defaults to file name)
        
    Returns:
        S3 URL of the uploaded file
    """
    if object_name is None:
        object_name = os.path.basename(file_path)
    
    try:
        logger.info(f"Uploading {file_path} to S3 bucket {bucket_name}")
        s3_client.upload_file(file_path, bucket_name, object_name)
        s3_url = f"https://{bucket_name}.s3.amazonaws.com/{object_name}"
        logger.info(f"Uploaded file to {s3_url}")
        return s3_url
    except Exception as e:
        logger.error(f"Error uploading to S3: {str(e)}")
        return None


def process_videos_from_queue():
    """
    Continuously polls MongoDB for videos with 'uploaded' status,
    processes them and marks as 'analyzed'
    """
    logger.info("Starting video processing service")
    
    # Initialize the video processor
    model_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
                            "ML", "models", "weights", "yolov8n.pt")
    processor = VideoProcessor(model_name="yolo", model_path=model_path, confidence_threshold=0.3)
    
    # Get database
    db = get_database()
    video_collection = db.videos
    
    while True:
        try:
            # Find one video with 'uploaded' status and update it to 'analyzing'
            video = video_collection.find_one_and_update(
                {"status": "uploaded"}, 
                {"$set": {"status": "analyzing"}},
                return_document=True
            )
            
            if not video:
                logger.info("No videos to process. Waiting...")
                time.sleep(2)
                continue
            
            video_id = str(video['_id'])
            logger.info(f"Found video to process: {video_id}")
            
            # Make sure temp directories exist
            if not os.path.exists("temp/downloads/"):
                os.makedirs("temp/downloads/", exist_ok=True)
                
            # Download the video from S3
            download_path = f"temp/downloads/{video_id}"
            download_from_s3(BUCKET_NAME, video_id, download_path)
            
            # Process the video
            logger.info(f"Processing video: {video_id}")
            annotated_video_path = processor.process_video(download_path)
            
            # Verify the annotated video file exists
            if not os.path.exists(annotated_video_path):
                # Check if file exists with .mp4v extension instead
                if annotated_video_path.endswith('.mp4'):
                    mp4v_path = annotated_video_path[:-4] + '.mp4v'
                    if os.path.exists(mp4v_path):
                        logger.info(f"Found video with .mp4v extension instead of .mp4: {mp4v_path}")
                        annotated_video_path = mp4v_path
                    else:
                        logger.error(f"Annotated video file not found at {annotated_video_path} or {mp4v_path}")
                        raise FileNotFoundError(f"Annotated video file not found")
                else:
                    logger.error(f"Annotated video file not found at {annotated_video_path}")
                    raise FileNotFoundError(f"Annotated video file not found")
                
            logger.info(f"Verified annotated video exists at: {annotated_video_path}")
                
            # Upload the annotated video to S3
            annotated_video_name = f"annotated_{video_id}"
            if not annotated_video_name.endswith('.mp4') and not annotated_video_name.endswith('.mp4v'):
                # Use the same extension as the found file
                if annotated_video_path.endswith('.mp4v'):
                    annotated_video_name += '.mp4v'
                else:
                    annotated_video_name += '.mp4'
            
            # Make sure the S3 client exists before trying to upload        
            if s3_client is None:
                logger.error("Cannot upload to S3: S3 client is not available")
                s3_url = None
            else:
                try:
                    s3_url = upload_to_s3(annotated_video_path, BUCKET_NAME, annotated_video_name)
                    logger.info(f"Uploaded annotated video to S3: {s3_url}")
                except Exception as e:
                    logger.error(f"Failed to upload to S3: {str(e)}")
                    s3_url = None
            
            # Update the video status to 'analyzed' even if S3 upload failed
            video_collection.update_one(
                {"_id": video['_id']},
                {"$set": {
                    "status": "analyzed",
                    "annotated_video_url": s3_url or annotated_video_path  # Use local path if S3 upload failed
                }}
            )
            
            logger.info(f"Video {video_id} processed and marked as 'analyzed'")
            
            # Clean up temporary files
            try:
                os.remove(download_path)
                os.remove(annotated_video_path)
                logger.info("Temporary files cleaned up")
            except Exception as e:
                logger.warning(f"Error cleaning up temporary files: {str(e)}")
                
        except Exception as e:
            logger.error(f"Error processing video: {str(e)}")
            # If there was an error with a video, mark it as 'error'
            if 'video' in locals() and video:
                video_collection.update_one(
                    {"_id": video['_id']},
                    {"$set": {"status": "error", "error_message": str(e)}}
                )
            time.sleep(2)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Process a specific video if provided
        model_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
                                "ML", "models", "weights", "yolov8n.pt")
        processor = VideoProcessor(model_name="yolo", model_path=model_path, confidence_threshold=0.3)
        
        video_path = sys.argv[1]
        print(f"Processing video: {video_path}")
        result = processor.process_video(video_path)
        print(f"Processing complete. Result: {result}")
    else:
        # Start the continuous processing service
        print("Starting continuous video processing service")
        process_videos_from_queue() 