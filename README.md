# Advanced Video Querying System for Machine Learning

An advanced video querying system designed for machine learning applications, enabling complex temporal and spatial searches within large video datasets. The system integrates state-of-the-art object detection and tracking technologies to efficiently filter and retrieve specific video segments required for AI model training.

## Key Features:

Precise Temporal & Spatial Queries: Search for moments within specific time intervals and spatial areas in videos.
Complex Object Interaction Detection: Query based on object interactions (e.g., proximity or shared scenes).
Efficient Data Filtering: Extracts exactly what’s needed for AI model training, optimizing resources.

## Technologies:

TransVOD++ for object detection
MongoDB for scalable metadata storage
FFmpeg for video processing
R-trees for efficient indexing

## Future Work:

Integration of action recognition models
Real-time video stream support

## Getting Started

1. Install pip requirements: $pip install -r requirements.txt
2. Create .env file with

   To connect to mongoDB Atlas Cluster for metadata storage
   a.MONGO_USERNAME = your_mongo_username
   b. MONGO_PASSWORD = your_mongo_password

   To connect to aws s3 for video storage/retreival
   c. AWS_ACCESS_KEY = your_aws_access_key
   d. AWS_SECRET_ACCESS_KEY = your_aws_secret_access_key

First run will download the yolo model

## TODO

1. Create Query Engine for spatial and temporal, possible via metadata
   - Base query of object via classes/labels in yolo model
2. Create mechanism to retreive desired segments of videos from queries, based of sequences of frames that fit criteria
