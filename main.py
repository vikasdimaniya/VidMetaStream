from process_video import save_video_metadata, process_video, compute_file_hash
from query_engine import query_menu
import threading
import time
import os
from pymongo import MongoClient
from dotenv import load_dotenv
import boto3

load_dotenv()

mongo_user_name = os.getenv("MONGO_USERNAME")
mongo_password = os.getenv("MONGO_PASSWORD")
BUCKET_NAME = "adtbucket"
db_name = "vidmetastream"

uri = f"mongodb+srv://{mongo_user_name}:{mongo_password}@adtcluster.d1cdf.mongodb.net/?retryWrites=true&w=majority&appName=adtCluster"
client = MongoClient(uri)
db = client[db_name]
collection = db["videos"]

# Function to download a file from S3
def download_from_s3(s3_key, local_path):
    try:
        s3.download_file(bucket_name, s3_key, local_path)
        absolute_path = os.path.abspath(local_path)  # Convert to absolute path
        print(f"Downloaded {s3_key} to {absolute_path}")
        return absolute_path
    except Exception as e:
        print(f"Error downloading {s3_key}: {e}")
        return None

# AWS S3 setup
s3 = boto3.client('s3', region_name='us-east-2')  # Specify your region
bucket_name = 'adtproject'  # Replace with your S3 bucket name

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
                s3_key = result.get("uploadTempLocation")
                if s3_key:
                    # Define a local path to save the file
                    local_path = os.path.join("downloads", s3_key)

                    # Ensure the downloads directory exists
                    os.makedirs(os.path.dirname(local_path), exist_ok=True)

                    # Download the file from S3
                    vid_path = download_from_s3(s3_key, local_path)
                    
                    # Pass the absolute path to the processing module
                    if vid_path:
                        file_hash = compute_file_hash(vid_path)
                        metadata = process_video(vid_path)
                        s3_url = f"https://{bucket_name}.s3.amazonaws.com/{s3_key}"
                        save_video_metadata(vid_path, file_hash, metadata, s3_url)
                        print("Video processed and metadata saved.")
                    else:
                        print(f"Skipping processing for {s3_key} due to download failure.")
                else:
                    print("No S3 key found in the document.")
            else:
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
    main_menu()
