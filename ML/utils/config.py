"""
Configuration module for the ML package
"""
import os
from typing import Dict, Any, Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Config:
    """Configuration class for the ML package"""
    
    # MongoDB configuration
    MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/vidmetastream")
    DB_NAME = "vidmetastream"
    
    # MinIO/S3 configuration
    AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
    AWS_S3_ENDPOINT_URL = os.getenv("AWS_S3_ENDPOINT_URL")
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "minioadmin")
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "minioadmin")
    AWS_STORAGE_BUCKET_NAME = os.getenv("AWS_STORAGE_BUCKET_NAME", "vidmetastream")
    AWS_S3_ADDRESSING_STYLE = os.getenv("AWS_S3_ADDRESSING_STYLE", "path")
    
    # Video processing configuration
    CHUNK_DURATION = int(os.getenv("CHUNK_DURATION", "10"))  # seconds
    TEMP_DIR = os.getenv("TEMP_DIR", "/tmp/vidmetastream")
    MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", str(1024 * 1024 * 100)))  # 100MB
    
    # Logging configuration
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_DIR = os.getenv("LOG_DIR", "logs")
    
    # Model configuration
    DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "yolo")
    DEFAULT_MODEL_PATH = os.getenv("DEFAULT_MODEL_PATH", "yolo11n.pt")
    DEFAULT_DEVICE = os.getenv("DEFAULT_DEVICE", "cpu")
    
    @classmethod
    def get_mongodb_config(cls) -> Dict[str, Any]:
        """Get MongoDB configuration"""
        return {
            "uri": cls.MONGODB_URI,
            "db_name": cls.DB_NAME
        }
    
    @classmethod
    def get_s3_config(cls) -> Dict[str, Any]:
        """Get S3/MinIO configuration"""
        config = {
            "region_name": cls.AWS_REGION,
            "aws_access_key_id": cls.AWS_ACCESS_KEY_ID,
            "aws_secret_access_key": cls.AWS_SECRET_ACCESS_KEY,
            "bucket_name": cls.AWS_STORAGE_BUCKET_NAME,
        }
        
        # Add MinIO-specific configuration if endpoint URL is provided
        if cls.AWS_S3_ENDPOINT_URL:
            config.update({
                "endpoint_url": cls.AWS_S3_ENDPOINT_URL,
                "config": {
                    "signature_version": "s3v4",
                    "s3": {
                        "addressing_style": cls.AWS_S3_ADDRESSING_STYLE
                    }
                }
            })
        
        return config
    
    @classmethod
    def get_model_config(cls) -> Dict[str, Any]:
        """Get model configuration"""
        return {
            "model_name": cls.DEFAULT_MODEL,
            "model_path": cls.DEFAULT_MODEL_PATH,
            "device": cls.DEFAULT_DEVICE
        }
    
    @classmethod
    def get_logging_config(cls) -> Dict[str, Any]:
        """Get logging configuration"""
        return {
            "log_level": cls.LOG_LEVEL,
            "log_dir": cls.LOG_DIR
        }
    
    @classmethod
    def get_video_config(cls) -> Dict[str, Any]:
        """Get video processing configuration"""
        return {
            "chunk_duration": cls.CHUNK_DURATION,
            "temp_dir": cls.TEMP_DIR,
            "max_upload_size": cls.MAX_UPLOAD_SIZE
        }

# Create a singleton instance
config = Config() 