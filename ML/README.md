# VidMetaStream ML Package

This directory contains all the machine learning and video processing code for the VidMetaStream project.

## Overview

The ML package provides functionality for:

- Object detection in videos using multiple model backends
- Automatic video processing and annotation
- Storing detection results in MongoDB
- Integration with MinIO (S3-compatible storage)

## Directory Structure

```
ML/
├── __init__.py             # Package initialization
├── main.py                 # Main entry point with CLI interface
├── video_processor.py      # Video processing pipeline
├── models/                 # Model implementations
│   ├── __init__.py         # Model registry and factory
│   ├── base_model.py       # Base detector class
│   ├── yolo_detector.py    # YOLO implementation
│   └── ...                 # Other model implementations
├── utils/                  # Utility modules
│   ├── __init__.py         # Utils package initialization
│   ├── config.py           # Configuration management
│   ├── connections.py      # Database and storage connections
│   └── logging_config.py   # Logging configuration
├── real_time_process.py    # Real-time video processing
└── testo.py                # MongoDB connection test
```

## Usage

To run the ML package:

```bash
# Activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the main script to automatically process uploaded videos
python -m ML.main

# Process a specific video file
python -m ML.main --video /path/to/video.mp4

# Use a different model
python -m ML.main --model yolo --model-path /path/to/model.pt

# Set logging level
python -m ML.main --log-level DEBUG
```

## Adding New Models

To add a new model:

1. Create a new file in the `models` directory (e.g., `models/faster_rcnn_detector.py`)
2. Implement the model class inheriting from `BaseDetector`
3. Register the model in `models/__init__.py` by adding it to the `AVAILABLE_MODELS` dictionary

Example:

```python
# In models/faster_rcnn_detector.py
from ML.models.base_model import BaseDetector

class FasterRCNNDetector(BaseDetector):
    def __init__(self, model_path=None, device="cpu", **kwargs):
        # Implementation...
    
    def predict(self, frame, **kwargs):
        # Implementation...
    
    def get_label(self, class_id):
        # Implementation...
    
    def annotate_frame(self, frame, results, **kwargs):
        # Implementation...
    
    def extract_detections(self, results, frame_width, frame_height):
        # Implementation...

# In models/__init__.py
from ML.models.faster_rcnn_detector import FasterRCNNDetector

AVAILABLE_MODELS = {
    "yolo": YOLODetector,
    "faster_rcnn": FasterRCNNDetector,
    # Add more models here
}
```

## Code Quality Features

The codebase includes several features to ensure code quality:

- **Type Hints**: All functions and methods include Python type annotations
- **Centralized Configuration**: Environment variables are managed in `utils/config.py`
- **Structured Logging**: Logging is configured in `utils/logging_config.py`
- **Error Handling**: Comprehensive error handling with proper logging
- **Modular Architecture**: Clear separation of concerns with a modular design
- **Documentation**: Comprehensive docstrings and README

## Dependencies

- OpenCV (cv2) for video processing
- Ultralytics YOLO for object detection
- PyMongo for MongoDB integration
- Boto3 for S3/MinIO integration
- tqdm for progress bars

## Configuration

The ML package uses environment variables for configuration. Create a `.env` file in the project root with the following variables:

```
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/vidmetastream

# MinIO Configuration
AWS_REGION=us-east-1
AWS_S3_ENDPOINT_URL=http://localhost:9000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_STORAGE_BUCKET_NAME=vidmetastream
AWS_S3_ADDRESSING_STYLE=path

# Logging Configuration
LOG_LEVEL=INFO
LOG_DIR=logs

# Model Configuration
DEFAULT_MODEL=yolo
DEFAULT_MODEL_PATH=yolo11n.pt
DEFAULT_DEVICE=cpu
``` 