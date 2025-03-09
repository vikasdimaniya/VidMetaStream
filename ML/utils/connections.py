"""
Shared connections module for MongoDB and S3/MinIO
"""
import os
from typing import Optional, Dict, Any, Union
import boto3
from pymongo import MongoClient
from ML.utils.config import config
from ML.utils.logging_config import get_logger

# Set up logging
logger = get_logger(__name__)

# MongoDB connection
mongo_client = MongoClient(config.MONGODB_URI)
db = mongo_client[config.DB_NAME]

# S3/MinIO client
s3_config = config.get_s3_config()
s3_client = boto3.client(
    "s3",
    endpoint_url=s3_config.get("endpoint_url"),
    aws_access_key_id=s3_config["aws_access_key_id"],
    aws_secret_access_key=s3_config["aws_secret_access_key"],
    region_name=s3_config["region_name"],
    config=s3_config.get("config")
)

# Export collections for easy access
videos_collection = db["videos"]
objects_collection = db["objects"]

def get_mongo_db():
    """Get the MongoDB database instance"""
    return db

def get_collection(collection_name: str) -> Any:
    """
    Get a specific MongoDB collection
    
    Args:
        collection_name: Name of the collection
        
    Returns:
        MongoDB collection
    """
    return db[collection_name]

def get_s3_client() -> Any:
    """
    Get the S3/MinIO client
    
    Returns:
        S3/MinIO client
    """
    return s3_client

def get_bucket_name() -> str:
    """
    Get the S3/MinIO bucket name
    
    Returns:
        Bucket name
    """
    return s3_config["bucket_name"]

def download_from_s3(s3_key: str, local_path: str) -> Optional[str]:
    """
    Download a file from S3/MinIO
    
    Args:
        s3_key: The object key in S3/MinIO
        local_path: The local path to save the file
        
    Returns:
        The absolute path to the downloaded file or None if download failed
    """
    try:
        # Ensure the directory exists
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        
        # Download the file
        s3_client.download_file(get_bucket_name(), s3_key, local_path)
        absolute_path = os.path.abspath(local_path)
        logger.info(f"Downloaded {s3_key} to {absolute_path}")
        return absolute_path
    except Exception as e:
        logger.error(f"Error downloading {s3_key}: {e}", exc_info=True)
        return None 