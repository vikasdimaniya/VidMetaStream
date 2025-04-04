from process_video import process_video
from query_engine import query_menu
import threading
import time
import os
from pymongo import MongoClient
from dotenv import load_dotenv
import boto3

load_dotenv()

# Get MongoDB connection info from environment variables
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
print(f"Connected to MongoDB")
collection = db["videos"]

s3 = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
    region_name=AWS_REGION,
    endpoint_url=os.getenv("AWS_S3_ENDPOINT_URL")
)

# Function to download a file from S3
def download_from_s3(s3_key, local_path):
    try:
        s3.download_file(BUCKET_NAME, s3_key, local_path)
        absolute_path = os.path.abspath(local_path)  # Convert to absolute path
        print(f"1Downloaded {s3_key} to {absolute_path}")
        return absolute_path
    except Exception as e:
        print(f"Error downloading {s3_key}: {e}")
        return None

# Function to perform the find_one_and_update operation
def find_and_update_task():
    while True:
        try:
            # Perform the find_one_and_update operation
            result = collection.find_one_and_update(
                {"status": "uploaded"},  # Query to find the document
                {"$set": {"status": "analyzing"}},  # Update the document
                return_document=True
            )
            
            if result:
                print(f"Updated document: {result}")
                s3_key = str(result.get("_id"))
                print(f"s3_key: {s3_key}")
                if s3_key:
                    # Define a local path to save the file
                    local_path = os.path.join("downloads", s3_key)

                    # Ensure the downloads directory exists
                    os.makedirs(os.path.dirname(local_path), exist_ok=True)

                    # Download the file from S3
                    vid_path = download_from_s3(s3_key, local_path)
                    print(f"2Downloaded {s3_key} to {local_path} (or {vid_path})")
                    
                    # Pass the absolute path to the processing module
                    if vid_path:
                        try:
                            process_video(vid_path)
                            
                            # Update the video status to "analized" after processing
                            collection.update_one(
                                {"_id": result.get("_id")},
                                {"$set": {"status": "analized"}}
                            )
                            print(f"Updated video status to 'analized' for video ID: {s3_key}")
                            print("Video processed and metadata saved.")
                        except Exception as processing_error:
                            print(f"Error processing video: {processing_error}")
                            # Update the video status to "error" if processing fails
                            collection.update_one(
                                {"_id": result.get("_id")},
                                {
                                    "$set": {
                                        "status": "error",
                                        "error": str(processing_error)
                                    }
                                }
                            )
                            print(f"Updated video status to 'error' for video ID: {s3_key}")
                        finally:
                            # Clean up temporary files
                            try:
                                if os.path.exists(vid_path):
                                    os.remove(vid_path)
                                    print(f"Removed temporary file: {vid_path}")
                            except Exception as cleanup_error:
                                print(f"Error cleaning up temporary files: {cleanup_error}")
                    else:
                        print(f"Skipping processing for {s3_key} due to download failure.")
                        # Mark the video as error since download failed
                        collection.update_one(
                            {"_id": result.get("_id")},
                            {
                                "$set": {
                                    "status": "error",
                                    "error": "Failed to download video from S3"
                                }
                            }
                        )
                else:
                    print("No S3 key found in the document.")
            else:
                print("No documents found with status 'uploaded' waiting for 2 seconds.")
                time.sleep(2)

        except Exception as e:
            print(f"Error in find_and_update_task: {e}")
        #Refactor to exit first design style, to reduce nested indentations
        
        

def main_menu():
    print("Welcome to the Video Processing and Query System!")
    
    # Start the background thread for find_and_update_task
    update_thread = threading.Thread(target=find_and_update_task, daemon=True)
    update_thread.start()

    while True:
        print("\nChoose an option:")
        print("1. Upload a video")
        print("2. Run a query")
        print("3. Exit")
        
        choice = input("Enter your choice: ").strip()
        if choice == "1":
            video_path = input("Enter the absolute path to the video file: ").strip()
            process_video_cli(video_path)
        elif choice == "2":
            query_menu()
        elif choice == "3":
            print("Exiting. Goodbye!")
            break
        else:
            print("Invalid choice. Please try again.")

if __name__ == "__main__":
    find_and_update_task()

{"_id":{"$oid":"674240e24030724e7e817944"},"title":"1","description":"This is the first video","filename":"1.mov","status":"uploaded","__v":{"$numberInt":"0"}}

{"_id":{"$oid":"674242054030724e7e817947"},"title":"1","description":"This is the first video","filename":"1.mov","status":"uploaded","__v":{"$numberInt":"0"}}

