# import os
# from ultralytics import YOLO
# import cv2
# import datetime
# from pymongo.mongo_client import MongoClient
# from dotenv import load_dotenv
# import hashlib
# import boto3

# # Load environment variables
# load_dotenv()

# # MongoDB and S3 Configuration
# mongo_user_name = os.getenv("MONGO_USERNAME")
# mongo_password = os.getenv("MONGO_PASSWORD")
# AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY")
# AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
# BUCKET_NAME = "adtbucket"  # Replace with your bucket name
# db_name = "video_metadata_db"  # Database name
# collection_name = "videos"  # Collection name

# uri = f"mongodb+srv://{mongo_user_name}:{mongo_password}@adtcluster.d1cdf.mongodb.net/?retryWrites=true&w=majority&appName=adtCluster"

# client = MongoClient(uri)
# db = client[db_name]
# collection = db[collection_name]

# # Initialize S3 client
# s3_client = boto3.client(
#     "s3",
#     aws_access_key_id=AWS_ACCESS_KEY,
#     aws_secret_access_key=AWS_SECRET_KEY,
# )

# model = YOLO('yolo11n.pt')  # Load YOLO model

# def main_menu():
#     print("Welcome to the Video Processing and Query System!")
#     while True:
#         print("\nChoose an option:")
#         print("1. Upload a video")
#         print("2. Run a query")
#         print("3. Exit")
        
#         choice = input("Enter your choice: ").strip()
#         if choice == "1":
#             video_path = input("Enter the absolute path to the video file: ").strip()
#             if not os.path.isfile(video_path):
#                 print(f"Error: The file '{video_path}' does not exist.")
#                 continue
#             process_video_cli(video_path)
#         elif choice == "2":
#             query_menu()
#         elif choice == "3":
#             print("Exiting. Goodbye!")
#             break
#         else:
#             print("Invalid choice. Please try again.")

# def process_video_cli(video_path):
#     print(f"Processing video: {video_path}")
    
#     # Compute file hash to check for duplicates
#     file_hash = compute_file_hash(video_path)
#     if is_duplicate_video(file_hash):
#         print("Duplicate video detected. Skipping upload.")
#         return

#     # Upload video to S3
#     print("Uploading video to S3...")
#     s3_url = upload_to_s3(video_path)
#     if not s3_url:
#         print("Error uploading video to S3. Aborting.")
#         return

#     # Process video and extract metadata
#     metadata = process_video(video_path)

#     # Save metadata in MongoDB
#     save_video_metadata(video_path, file_hash, metadata, s3_url)
#     print("Video processed and metadata saved.")

# def process_video(video_path):
#     cap = cv2.VideoCapture(video_path)
#     frame_number = 0
#     metadata = []

#     # Get frame dimensions
#     frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
#     frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

#     while cap.isOpened():
#         ret, frame = cap.read()
#         if not ret:
#             break

#         # Run YOLO on the frame
#         results = model.predict(frame, device=0)

#         # Extract metadata
#         timestamp_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
#         timestamp = convert_ms_to_timestamp(timestamp_ms)
#         frame_metadata = {"frame": frame_number, "timestamp": timestamp, "objects": []}

#         for result in results:
#             for box in result.boxes:
#                 box_coordinates = box.xyxy[0].tolist()
#                 label = model.names[int(box.cls[0])]
#                 confidence = float(box.conf[0])
#                 relative_position = calculate_relative_position(box_coordinates, frame_width, frame_height)
#                 frame_metadata["objects"].append({
#                     "name": label,
#                     "box": box_coordinates,
#                     "relative_position": relative_position,
#                     "confidence": confidence
#                 })

#         metadata.append(frame_metadata)
#         frame_number += 1

#     cap.release()
#     return metadata

# def query_menu():
#     print("\nQuery Options:")
#     print("1. Find objects in a specific region and time range")
#     print("2. Detect interactions between objects")
#     print("3. Find objects in a region for a duration")
#     print("4. Go back")
    
#     choice = input("Enter your choice: ").strip()
#     if choice == "1":
#         region_query()
#     elif choice == "2":
#         interaction_query()
#     elif choice == "3":
#         duration_query()
#     elif choice == "4":
#         return
#     else:
#         print("Invalid choice. Please try again.")

# def region_query():
#     region = input("Enter region (e.g., 'top-left', 'bottom-right'): ").strip().lower()
#     start_time = input("Enter start time (HH:MM:SS): ").strip()
#     end_time = input("Enter end time (HH:MM:SS): ").strip()
#     object_name = input("Enter object name to search for: ").strip()
    
#     # Implement region query logic here
#     print(f"Querying for {object_name} in {region} from {start_time} to {end_time}...")

# def interaction_query():
#     object1 = input("Enter first object: ").strip()
#     object2 = input("Enter second object: ").strip()
#     threshold = float(input("Enter proximity threshold (in pixels): ").strip())
    
#     # Implement interaction query logic here
#     print(f"Querying for interactions between {object1} and {object2} within {threshold} pixels...")

# def duration_query():
#     region = input("Enter region (e.g., 'top-left', 'bottom-right'): ").strip().lower()
#     object_name = input("Enter object name to search for: ").strip()
#     duration = int(input("Enter duration in seconds: ").strip())
    
#     # Implement duration query logic here
#     print(f"Querying for {object_name} in {region} for at least {duration} seconds...")

# def compute_file_hash(file_path):
#     hash_sha256 = hashlib.sha256()
#     with open(file_path, "rb") as f:
#         for chunk in iter(lambda: f.read(4096), b""):
#             hash_sha256.update(chunk)
#     return hash_sha256.hexdigest()

# def is_duplicate_video(file_hash):
#     return collection.find_one({"file_hash": file_hash}) is not None

# def upload_to_s3(file_path):
#     file_name = os.path.basename(file_path)
#     try:
#         s3_client.upload_file(file_path, BUCKET_NAME, file_name)
#         return f"https://{BUCKET_NAME}.s3.amazonaws.com/{file_name}"
#     except Exception as e:
#         print(f"Error uploading to S3: {e}")
#         return None

# def save_video_metadata(file_name, file_hash, metadata, s3_url):
#     video_document = {
#         "file_name": file_name,
#         "file_hash": file_hash,
#         "upload_date": datetime.datetime.now(datetime.timezone.utc).isoformat(),
#         "s3_url": s3_url,
#         "metadata": metadata
#     }
#     collection.insert_one(video_document)

# def calculate_relative_position(box, frame_width, frame_height):
#     x_center = (box[0] + box[2]) / 2 / frame_width
#     y_center = (box[1] + box[3]) / 2 / frame_height
#     return [x_center, y_center]

# def convert_ms_to_timestamp(milliseconds):
#     seconds = int(milliseconds / 1000)
#     return f"{seconds // 3600:02}:{(seconds % 3600) // 60:02}:{seconds % 60:02}"

# if __name__ == "__main__":
#     main_menu()


import os
import hashlib
import cv2
from ultralytics import YOLO
from dotenv import load_dotenv
import boto3
from pymongo.mongo_client import MongoClient
import datetime

# Load environment variables
load_dotenv()

# MongoDB and S3 configuration
mongo_user_name = os.getenv("MONGO_USERNAME")
mongo_password = os.getenv("MONGO_PASSWORD")
AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
BUCKET_NAME = "adtbucket"
db_name = "video_metadata_db"

uri = f"mongodb+srv://{mongo_user_name}:{mongo_password}@adtcluster.d1cdf.mongodb.net/?retryWrites=true&w=majority&appName=adtCluster"
client = MongoClient(uri)
db = client[db_name]
collection = db["videos"]

s3_client = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
)

model = YOLO('yolo11n.pt')

def process_video_cli(video_path):
    if not os.path.exists(video_path):
        print(f"Error: The file '{video_path}' does not exist.")
        return
    
    file_hash = compute_file_hash(video_path)
    if is_duplicate_video(file_hash):
        print("Duplicate video detected. Skipping upload.")
        return

    print("Uploading video to S3...")
    s3_url = upload_to_s3(video_path)
    if not s3_url:
        print("Error uploading video to S3. Aborting.")
        return

    print(f"Processing video: {video_path}")
    metadata = process_video(video_path)
    save_video_metadata(video_path, file_hash, metadata, s3_url)
    print("Video processed and metadata saved.")

def process_video(video_path):
    cap = cv2.VideoCapture(video_path)
    frame_number = 0
    metadata = []

    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        results = model.predict(frame, device=0, verbose=False)

        timestamp_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
        timestamp = convert_ms_to_timestamp(timestamp_ms)
        frame_metadata = {"frame": frame_number, "timestamp": timestamp, "objects": []}

        for result in results:
            for box in result.boxes:
                box_coordinates = box.xyxy[0].tolist()
                label = model.names[int(box.cls[0])]
                confidence = float(box.conf[0])
                relative_position = calculate_relative_position(box_coordinates, frame_width, frame_height)
                frame_metadata["objects"].append({
                    "name": label,
                    "box": box_coordinates,
                    "relative_position": relative_position,
                    "confidence": confidence
                })

        metadata.append(frame_metadata)
        frame_number += 1

    cap.release()
    return metadata

def compute_file_hash(file_path):
    hash_sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_sha256.update(chunk)
    return hash_sha256.hexdigest()

def is_duplicate_video(file_hash):
    return collection.find_one({"file_hash": file_hash}) is not None

def upload_to_s3(file_path):
    file_name = os.path.basename(file_path)
    try:
        s3_client.upload_file(file_path, BUCKET_NAME, file_name)
        return f"https://{BUCKET_NAME}.s3.amazonaws.com/{file_name}"
    except Exception as e:
        print(f"Error uploading to S3: {e}")
        return None

def save_video_metadata(file_name, file_hash, metadata, s3_url):
    video_document = {
        "file_name": file_name,
        "file_hash": file_hash,
        "upload_date": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "s3_url": s3_url,
        "metadata": metadata
    }
    collection.insert_one(video_document)

def calculate_relative_position(box, frame_width, frame_height):
    x_center = (box[0] + box[2]) / 2 / frame_width
    y_center = (box[1] + box[3]) / 2 / frame_height
    return [x_center, y_center]

def convert_ms_to_timestamp(milliseconds):
    seconds = int(milliseconds / 1000)
    return f"{seconds // 3600:02}:{(seconds % 3600) // 60:02}:{seconds % 60:02}"
