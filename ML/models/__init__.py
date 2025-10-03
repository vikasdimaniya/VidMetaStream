"""
Models package for VidMetaStream

This package contains different object detection and video processing models.
"""

from ML.models.yolo_detector import YOLODetector

# Dictionary of available models
AVAILABLE_MODELS = {
    "yolo": YOLODetector,
    # Add more models here as they are implemented
    # "faster_rcnn": FasterRCNNDetector,
    # "ssd": SSDDetector,
}

def get_model(model_name, **kwargs):
    """
    Factory function to get a model instance by name
    
    Args:
        model_name (str): Name of the model to use
        **kwargs: Additional arguments to pass to the model constructor
        
    Returns:
        Model instance
        
    Raises:
        ValueError: If model_name is not recognized
    """
    if model_name not in AVAILABLE_MODELS:
        raise ValueError(f"Unknown model: {model_name}. Available models: {list(AVAILABLE_MODELS.keys())}")
    
    return AVAILABLE_MODELS[model_name](**kwargs) 