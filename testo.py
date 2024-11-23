# python3 -m venv .venv
# source .venv/bin/activate
# python3 -m pip install -r requirements.txt
from pymongo.mongo_client import MongoClient

# Database configuration
db_name = "vidmetastream"
uri = f"mongodb+srv://Vikas:gPeAAonuG93l1WE8@adtcluster.d1cdf.mongodb.net/?retryWrites=true&w=majority&appName=adtCluster"
try:
    # Create a MongoDB client
    client = MongoClient(uri)
    
    # Access a test database
    db = client[db_name]
    
    # Run a sample command to test connection
    server_info = client.server_info()  # If this works, the connection is successful
    print("MongoDB Atlas connection successful!")
    print("Server Info:", server_info)
except Exception as e:
    print("Failed to connect to MongoDB Atlas:", str(e))