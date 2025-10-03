"""
Main entry point for the VidMetaStream ML package
"""
import os
import time
import threading
import argparse
import logging
from typing import Optional
from ML.video_processor import VideoProcessor
from ML.utils.connections import videos_collection, download_from_s3
from ML.utils.config import config
from ML.utils.logging_config import setup_logging, get_logger

# Set up logging
setup_logging(log_file=os.path.join(config.LOG_DIR, 'main.log'))
logger = get_logger(__name__)

def process_video_file(video_path: str, model_name: str = "yolo", 
                      model_path: Optional[str] = None, device: str = "cpu") -> str:
    """
    Process a video file using the specified model
    
    Args:
        video_path: Path to the video file
        model_name: Name of the model to use
        model_path: Path to the model weights
        device: Device to run inference on ('cpu' or 'cuda')
        
    Returns:
        Path to the annotated video
    """
    logger.info(f"Processing video file: {video_path} with model: {model_name}")
    processor = VideoProcessor(
        model_name=model_name,
        model_path=model_path,
        device=device
    )
    return processor.process_video(video_path)

def find_and_update_task(model_name: str = "yolo", 
                         model_path: Optional[str] = None, 
                         device: str = "cpu") -> None:
    """
    Background task to find videos with 'uploaded' status and process them
    
    Args:
        model_name: Name of the model to use
        model_path: Path to the model weights
        device: Device to run inference on ('cpu' or 'cuda')
    """
    logger.info(f"Starting find_and_update_task with model: {model_name}")
    while True:
        try:
            # Perform the find_one_and_update operation
            result = videos_collection.find_one_and_update(
                {"status": "uploaded"},  # Query to find the document
                {"$set": {"status": "analyzing"}},  # Update the document
                return_document=True
            )
            if not result:
                logger.debug("No documents found with status 'uploaded'")
                time.sleep(2)
            else:
                logger.info(f"Found document to process: {result.get('_id')}")
                s3_key = str(result.get("_id"))
                
                if s3_key:
                    # Define a local path to save the file
                    local_path = os.path.join("downloads", s3_key)

                    # Ensure the downloads directory exists
                    os.makedirs(os.path.dirname(local_path), exist_ok=True)

                    # Download the file from S3
                    vid_path = download_from_s3(s3_key, local_path)
                    logger.info(f"Downloaded {s3_key} to {local_path}")
                    
                    # Pass the absolute path to the processing module
                    if vid_path:
                        try:
                            annotated_path = process_video_file(
                                vid_path, 
                                model_name=model_name,
                                model_path=model_path,
                                device=device
                            )
                            logger.info(f"Video processed and saved to {annotated_path}")
                            
                            # Update the status to 'processed'
                            videos_collection.update_one(
                                {"_id": result.get("_id")},
                                {"$set": {"status": "analyzed", "annotated_path": annotated_path}}
                            )
                        except Exception as e:
                            logger.error(f"Error processing video: {e}", exc_info=True)
                            # Update the status to 'error'
                            videos_collection.update_one(
                                {"_id": result.get("_id")},
                                {"$set": {"status": "error", "error_message": str(e)}}
                            )
                    else:
                        logger.error(f"Skipping processing for {s3_key} due to download failure.")
                        # Update the status to 'error'
                        videos_collection.update_one(
                            {"_id": result.get("_id")},
                            {"$set": {"status": "error", "error_message": "Download failed"}}
                        )
                else:
                    logger.error("No S3 key found in the document.")

        except Exception as e:
            logger.error(f"Error in find_and_update_task: {e}", exc_info=True)

def parse_args() -> argparse.Namespace:
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description="VidMetaStream ML Package")
    parser.add_argument(
        "--model", 
        type=str, 
        default=config.DEFAULT_MODEL, 
        help=f"Model to use for object detection (default: {config.DEFAULT_MODEL})"
    )
    parser.add_argument(
        "--model-path", 
        type=str, 
        default=config.DEFAULT_MODEL_PATH, 
        help=f"Path to model weights (default: {config.DEFAULT_MODEL_PATH})"
    )
    parser.add_argument(
        "--device", 
        type=str, 
        default=config.DEFAULT_DEVICE, 
        choices=["cpu", "cuda"], 
        help=f"Device to run inference on (default: {config.DEFAULT_DEVICE})"
    )
    parser.add_argument(
        "--video", 
        type=str, 
        default=None, 
        help="Path to video file to process"
    )
    parser.add_argument(
        "--log-level", 
        type=str, 
        default=config.LOG_LEVEL, 
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"], 
        help=f"Logging level (default: {config.LOG_LEVEL})"
    )
    
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    
    # Configure logging based on command line arguments
    setup_logging(
        log_file=os.path.join(config.LOG_DIR, 'main.log'),
        log_level=getattr(logging, args.log_level)
    )
    
    logger.info(f"Starting VidMetaStream ML Package with model: {args.model}")
    
    if args.video:
        # Process a single video file
        process_video_file(args.video, args.model, args.model_path, args.device)
    else:
        # Automatically start processing uploaded videos
        logger.info("Starting automatic video processing...")
        find_and_update_task(args.model, args.model_path, args.device)