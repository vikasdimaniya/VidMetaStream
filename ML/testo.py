# python3 -m venv .venv
# source .venv/bin/activate
# python3 -m pip install -r requirements.txt
from pymongo.mongo_client import MongoClient
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database configuration
db_name = "vidmetastream"

# Get MongoDB URI from environment or build it from components
mongodb_uri = os.getenv("MONGODB_URI")

# Try to connect to the database
try:
    # Create a MongoDB client
    print(f"Attempting to connect to MongoDB using URI: {mongodb_uri}")
    client = MongoClient(mongodb_uri)
    
    # Access a test database
    db = client[db_name]
    
    # Run a sample command to test connection
    server_info = client.server_info()  # If this works, the connection is successful
    print("MongoDB connection successful!")
    print("Server Info:", server_info)
except Exception as e:
    print("Failed to connect to MongoDB:", str(e))
    print("Please ensure MongoDB is running locally or update your connection string in .env")