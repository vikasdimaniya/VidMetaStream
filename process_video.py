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

# Load environment variables
load_dotenv()

# MongoDB and S3 configuration
mongo_user_name = os.getenv("MONGO_USERNAME")
mongo_password = os.getenv("MONGO_PASSWORD")
AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
BUCKET_NAME = "adtbucket"
db_name = "vidmetastream"

uri = f"mongodb+srv://{mongo_user_name}:{mongo_password}@adtcluster.d1cdf.mongodb.net/?retryWrites=true&w=majority&appName=adtCluster"
client = MongoClient(uri)
db = client[db_name]
collection = db["objects"]

s3_client = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
)

model = YOLO('yolo11n.pt')
print(model.names)

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
    logging.info(f"Initialized VideoWriter for annotated video at {annotated_video_path}")

    # MongoDB collections
    objects_collection = collection  # New collection for object presence

    # Temporary in-memory tracker for active objects
    # Format: {object_name: [{"instance_id": str, "last_frame": int, "last_timestamp_ms": float, "last_box": list}, ...]}
    active_objects = {}

    # Timeout threshold in milliseconds (e.g., 2 seconds)
    timeout_threshold = 2000  

    # IoU threshold for associating detections with existing tracked objects
    iou_threshold = 0.3

    with tqdm(total=total_frames, desc=f"Processing {video_name}", unit="frame") as pbar:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # Run object detection
            results = model.predict(frame, device="cpu", verbose=False)
            
            # Extract frame timestamp
            timestamp_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            timestamp = convert_ms_to_timestamp(timestamp_ms)  # Now includes milliseconds

            for result in results:
                for box in result.boxes:
                    # Extract object data
                    box_coordinates = box.xyxy[0].tolist()
                    label = model.names[int(box.cls[0])]
                    confidence = float(box.conf[0])
                    relative_position = calculate_relative_position(box_coordinates, frame_width, frame_height)

                    logging.info(
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
                        if iou > iou_threshold and iou > max_iou:
                            max_iou = iou
                            matched_instance = obj

                    if matched_instance:
                        # Update existing instance
                        matched_instance["last_frame"] = frame_number
                        matched_instance["last_timestamp_ms"] = timestamp_ms
                        matched_instance["last_box"] = box_coordinates
                        matched_instance["end_time"] = timestamp  # Update end_time

                        # Add frame data to MongoDB
                        objects_collection.update_one(
                            {"_id": matched_instance["instance_id"]},
                            {"$push": {"frames": {
                                "frame": frame_number,
                                "timestamp": timestamp,  # Now includes milliseconds
                                "box": box_coordinates,
                                "relative_position": relative_position,
                                "confidence": confidence
                            }},
                            "$set": {"end_time": timestamp}  # Update end_time
                            }
                        )
                    else:
                        # Create a new instance
                        instance_id = str(uuid.uuid4())  # Unique identifier for the new instance
                        new_instance = {
                            "instance_id": instance_id,
                            "last_frame": frame_number,
                            "start_time": timestamp,  # Set start_time
                            "end_time": timestamp,    # Initialize end_time
                            "last_timestamp_ms": timestamp_ms,
                            "last_box": box_coordinates
                        }
                        active_objects[label].append(new_instance)

                        # Create a new document in MongoDB for this instance
                        new_doc = {
                            "_id": instance_id,
                            "video_id": video_name,
                            "object_name": label,
                            "start_time": timestamp, 
                            "end_time": timestamp,    # Initialize end_time # Set start_time
                            "frames": [{
                                "frame": frame_number,
                                "timestamp": timestamp,  # Now includes milliseconds
                                "box": box_coordinates,
                                "relative_position": relative_position,
                                "confidence": confidence
                            }]
                        }
                        objects_collection.insert_one(new_doc)

                        logging.info(f"Created new instance ID {instance_id} for label '{label}'")

            # Annotate the frame with bounding boxes and labels
            annotated_frame = annotate_frame(frame, results, frame_width, frame_height)

            # Write the annotated frame to the output video
            out.write(annotated_frame)

            # Remove expired objects (based on timeout threshold)
            for label, instances in list(active_objects.items()):
                active_objects[label] = [
                    obj for obj in instances 
                    if (timestamp_ms - obj["last_timestamp_ms"]) <= timeout_threshold
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
    logging.info(f"Annotated video saved at {annotated_video_path}")

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

#def upload_to_s3(file_path):
#     file_name = os.path.basename(file_path)
#     try:
#         s3_client.upload_file(file_path, BUCKET_NAME, file_name)
#         return f"https://{BUCKET_NAME}.s3.amazonaws.com/{file_name}"
#     except Exception as e:
#         print(f"Error uploading to S3: {e}")
#         return None


# ##
# Latest Good Version
# import uuid  # For generating unique instance IDs
# import os
# import hashlib
# import cv2
# from tqdm import tqdm  # Import tqdm for the progress bar
# from ultralytics import YOLO
# from dotenv import load_dotenv
# import boto3
# import logging
# from pymongo.mongo_client import MongoClient
# from datetime import datetime

# # Load environment variables
# load_dotenv()

# # MongoDB and S3 configuration
# mongo_user_name = os.getenv("MONGO_USERNAME")
# mongo_password = os.getenv("MONGO_PASSWORD")
# AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY")
# AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
# BUCKET_NAME = "adtbucket"
# db_name = "vidmetastream"

# uri = f"mongodb+srv://{mongo_user_name}:{mongo_password}@adtcluster.d1cdf.mongodb.net/?retryWrites=true&w=majority&appName=adtCluster"
# client = MongoClient(uri)
# db = client[db_name]
# collection = db["objects"]

# s3_client = boto3.client(
#     "s3",
#     aws_access_key_id=AWS_ACCESS_KEY,
#     aws_secret_access_key=AWS_SECRET_KEY,
# )

# model = YOLO('yolo11n.pt')
# print(model.names)

# class CustomFormatter(logging.Formatter):
#     def formatTime(self, record, datefmt=None):
#         # Format time with milliseconds
#         ct = self.converter(record.created)
#         if datefmt:
#             s = datetime.fromtimestamp(record.created).strftime(datefmt)
#             return s
#         else:
#             # Default format with milliseconds
#             return datetime.fromtimestamp(record.created).strftime('%Y-%m-%d %H:%M:%S,%f')[:-3]

# # Remove all existing handlers to prevent logging to the console
# for handler in logging.root.handlers[:]:
#     logging.root.removeHandler(handler)

# # Create a FileHandler to write logs to a file
# file_handler = logging.FileHandler('video_processing.log')
# file_handler.setLevel(logging.INFO)

# # Create and set the custom formatter with valid logging format placeholders
# formatter = CustomFormatter(fmt='%(asctime)s - %(levelname)s - %(message)s')  # Ensures milliseconds are included
# file_handler.setFormatter(formatter)

# # Add the FileHandler to the root logger
# logging.getLogger().addHandler(file_handler)

# def process_video(video_path):
#     cap = cv2.VideoCapture(video_path)
#     frame_number = 0

#     total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
#     # Get frame dimensions
#     frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
#     frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

#     # MongoDB collections
#     objects_collection = collection  # New collection for object presence

#     # Temporary in-memory tracker for active objects
#     # Format: {object_name: [{"instance_id": str, "last_frame": int, "last_timestamp_ms": float, "last_box": list}, ...]}
#     active_objects = {}

#     # Timeout threshold in milliseconds (e.g., 2 seconds)
#     timeout_threshold = 2000  

#     # IoU threshold for associating detections with existing tracked objects
#     iou_threshold = 0.3

#     # Extract video name (or S3 URL if available)
#     video_name = os.path.basename(video_path)  # Replace with S3 link if needed

#     with tqdm(total=total_frames, desc=f"Processing {video_name}", unit="frame") as pbar:
#         while cap.isOpened():
#             ret, frame = cap.read()
#             if not ret:
#                 break

#             # Run object detection
#             results = model.predict(frame, device="cpu", verbose=False)
            
#             # Extract frame timestamp
#             timestamp_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
#             timestamp = convert_ms_to_timestamp(timestamp_ms)  # Now includes milliseconds

#             for result in results:
#                 for box in result.boxes:
#                     # Extract object data
#                     box_coordinates = box.xyxy[0].tolist()
#                     label = model.names[int(box.cls[0])]
#                     confidence = float(box.conf[0])
#                     relative_position = calculate_relative_position(box_coordinates, frame_width, frame_height)

#                     logging.info(
#                         f"Frame {frame_number}: Detected {label} with confidence {confidence:.2f}, "
#                         f"Box: {box_coordinates}, Relative Position: {relative_position}"
#                     )

#                     # Initialize the list for this label if not present
#                     if label not in active_objects:
#                         active_objects[label] = []

#                     matched_instance = None
#                     max_iou = 0

#                     # Iterate over existing active instances of this label to find a match
#                     for obj in active_objects[label]:
#                         iou = compute_iou(box_coordinates, obj["last_box"])
#                         if iou > iou_threshold and iou > max_iou:
#                             max_iou = iou
#                             matched_instance = obj

#                     if matched_instance:
#                         # Update existing instance
#                         matched_instance["last_frame"] = frame_number
#                         matched_instance["last_timestamp_ms"] = timestamp_ms
#                         matched_instance["last_box"] = box_coordinates

#                         # Add frame data to MongoDB
#                         objects_collection.update_one(
#                             {"_id": matched_instance["instance_id"]},
#                             {"$push": {"frames": {
#                                 "frame": frame_number,
#                                 "timestamp": timestamp,  # Now includes milliseconds
#                                 "box": box_coordinates,
#                                 "relative_position": relative_position,
#                                 "confidence": confidence
#                             }}}
#                         )
#                     else:
#                         # Create a new instance
#                         instance_id = str(uuid.uuid4())  # Unique identifier for the new instance
#                         new_instance = {
#                             "instance_id": instance_id,
#                             "last_frame": frame_number,
#                             "last_timestamp_ms": timestamp_ms,
#                             "last_box": box_coordinates
#                         }
#                         active_objects[label].append(new_instance)

#                         # Create a new document in MongoDB for this instance
#                         new_doc = {
#                             "_id": instance_id,
#                             "video_name": video_name,
#                             "object_name": label,
#                             "frames": [{
#                                 "frame": frame_number,
#                                 "timestamp": timestamp,  # Now includes milliseconds
#                                 "box": box_coordinates,
#                                 "relative_position": relative_position,
#                                 "confidence": confidence
#                             }]
#                         }
#                         objects_collection.insert_one(new_doc)

#             # Remove expired objects (based on timeout threshold)
#             for label, instances in list(active_objects.items()):
#                 active_objects[label] = [
#                     obj for obj in instances 
#                     if (timestamp_ms - obj["last_timestamp_ms"]) <= timeout_threshold
#                 ]
#                 if not active_objects[label]:
#                     del active_objects[label]

#             # Increment frame number
#             frame_number += 1

#             # Update the progress bar
#             pbar.update(1)

#     cap.release()

# def compute_iou(box1, box2):
#     """
#     Compute the Intersection over Union (IoU) of two bounding boxes.
#     Each box is represented by a list of four coordinates: [x1, y1, x2, y2]
#     """
#     x_left = max(box1[0], box2[0])
#     y_top = max(box1[1], box2[1])
#     x_right = min(box1[2], box2[2])
#     y_bottom = min(box1[3], box2[3])

#     if x_right < x_left or y_bottom < y_top:
#         return 0.0

#     intersection_area = (x_right - x_left) * (y_bottom - y_top)

#     box1_area = (box1[2] - box1[0]) * (box1[3] - box1[1])
#     box2_area = (box2[2] - box2[0]) * (box2[3] - box2[1])

#     iou = intersection_area / float(box1_area + box2_area - intersection_area)
#     return iou

# def save_video_objects(file_name, metadata, s3_url):
#     video_document = {
#         "file_name": file_name,
#         "s3_url": s3_url,
#         "metadata": metadata
#     }
#     collection.insert_one(video_document)

# def calculate_relative_position(box, frame_width, frame_height):
#     """
#     Calculate the relative position of the object in the frame.
#     Returns [x_center_relative, y_center_relative]
#     """
#     x1, y1, x2, y2 = box
#     x_center = (x1 + x2) / 2 / frame_width
#     y_center = (y1 + y2) / 2 / frame_height
#     return [x_center, y_center]


# def convert_ms_to_timestamp(ms):
#     """
#     Convert milliseconds to a timestamp string in the format "HH:MM:SS.mmm".
#     """
#     seconds = ms / 1000
#     return datetime.utcfromtimestamp(seconds).strftime('%H:%M:%S.%f')[:-3]

# #def upload_to_s3(file_path):
# #     file_name = os.path.basename(file_path)
# #     try:
# #         s3_client.upload_file(file_path, BUCKET_NAME, file_name)
# #         return f"https://{BUCKET_NAME}.s3.amazonaws.com/{file_name}"
# #     except Exception as e:
# #         print(f"Error uploading to S3: {e}")
# #         return None
