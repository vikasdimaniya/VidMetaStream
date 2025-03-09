"""
Base model class for object detection models
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Union, Tuple

class BaseDetector(ABC):
    """
    Abstract base class for all object detection models
    
    All detector models should inherit from this class and implement
    the required methods.
    """
    
    @abstractmethod
    def __init__(self, model_path: Optional[str] = None, **kwargs: Any) -> None:
        """
        Initialize the detector
        
        Args:
            model_path: Path to the model weights
            **kwargs: Additional model-specific parameters
        """
        pass
    
    @abstractmethod
    def predict(self, frame: Any, **kwargs: Any) -> Any:
        """
        Run object detection on a frame
        
        Args:
            frame: Input frame (numpy array)
            **kwargs: Additional prediction parameters
            
        Returns:
            Detection results
        """
        pass
    
    @abstractmethod
    def get_label(self, class_id: int) -> str:
        """
        Get the label for a class ID
        
        Args:
            class_id: Class ID from the model
            
        Returns:
            Label for the class
        """
        pass
    
    @abstractmethod
    def annotate_frame(self, frame: Any, results: Any, **kwargs: Any) -> Any:
        """
        Annotate a frame with detection results
        
        Args:
            frame: Input frame (numpy array)
            results: Detection results from predict()
            **kwargs: Additional annotation parameters
            
        Returns:
            Annotated frame
        """
        pass
        
    @abstractmethod
    def extract_detections(self, results: Any, frame_width: int, frame_height: int) -> List[Dict[str, Any]]:
        """
        Extract structured detection information from results
        
        Args:
            results: Detection results from predict()
            frame_width: Width of the frame
            frame_height: Height of the frame
            
        Returns:
            List of detection dictionaries with class, confidence, box, and relative position
        """
        pass 