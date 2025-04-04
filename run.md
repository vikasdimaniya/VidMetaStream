# Create a new environment with Python 3.11.2
conda create -n py311 python=3.11.2

# Activate the environment
conda activate py311

# Install dependencies
pip install --no-cache-dir  --force-reinstall "inference[yolo-world]" supervision opencv-python numpy