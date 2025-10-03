"""
YOLO detector implementation
"""
import cv2
import numpy as np
from typing import Any, Dict, List, Optional, Union, Tuple
from ultralytics import YOLO
from ML.models.base_model import BaseDetector

class YOLODetector(BaseDetector):
    """
    YOLO object detector using Ultralytics YOLO implementation
    """
    
    def __init__(self, model_path: str = 'yolo11n.pt', device: str = "cpu", **kwargs: Any) -> None:
        """
        Initialize the YOLO detector
        
        Args:
            model_path: Path to the YOLO model weights
            device: Device to run inference on ('cpu' or 'cuda')
            **kwargs: Additional model-specific parameters
        """
        import os
        # Prevent multiprocessing issues that cause semaphore leaks
        os.environ['OMP_NUM_THREADS'] = '1'
        os.environ['MKL_NUM_THREADS'] = '1'
        
        self.model_path = model_path
        self.device = device
        self.model = YOLO(model_path)
        self.confidence_threshold = kwargs.get('confidence_threshold', 0.25)
        print(f"Loaded YOLO model with classes: {self.model.names}")
    
    def predict(self, frame: np.ndarray, verbose: bool = False, **kwargs: Any) -> Any:
        """
        Run object detection on a frame
        
        Args:
            frame: Input frame (numpy array)
            verbose: Whether to print verbose output
            **kwargs: Additional prediction parameters
            
        Returns:
            Detection results from YOLO model
        """
        results = self.model.predict(
            frame, 
            device=self.device, 
            verbose=verbose, 
            conf=self.confidence_threshold,
            **kwargs
        )
        return results
    
    def get_label(self, class_id: int) -> str:
        """
        Get the label for a class ID
        
        Args:
            class_id: Class ID from the model
            
        Returns:
            Label for the class
        """
        return self.model.names[int(class_id)]
    
    def annotate_frame(self, frame: np.ndarray, results: Any, **kwargs: Any) -> np.ndarray:
        """
        Annotate a frame with detection results
        
        Args:
            frame: Input frame (numpy array)
            results: Detection results from predict()
            **kwargs: Additional annotation parameters
            
        Returns:
            Annotated frame
        """
        annotated_frame = frame.copy()
        
        for result in results:
            for box in result.boxes:
                # Extract bounding box coordinates
                x1, y1, x2, y2 = map(int, box.xyxy[0])  # Bounding box corners
                class_id = int(box.cls[0])  # Class ID
                label = self.get_label(class_id)  # Get label
                confidence = float(box.conf[0])  # Confidence score
                
                # Draw rectangle on the frame
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)  # Green box
                
                # Prepare label text with confidence
                label_text = f"{label} {confidence:.2f}"
                
                # Calculate text size for background rectangle
                (text_width, text_height), baseline = cv2.getTextSize(
                    label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1
                )
                
                # Draw background rectangle for text
                cv2.rectangle(
                    annotated_frame, 
                    (x1, y1 - text_height - baseline), 
                    (x1 + text_width, y1), 
                    (0, 255, 0), 
                    -1
                )
                
                # Put label text above the bounding box
                cv2.putText(
                    annotated_frame, 
                    label_text, 
                    (x1, y1 - baseline), 
                    cv2.FONT_HERSHEY_SIMPLEX, 
                    0.5, 
                    (0, 0, 0), 
                    1
                )
        
        return annotated_frame
    
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
        detections = []
        
        for result in results:
            for box in result.boxes:
                # Extract object data
                box_coordinates = box.xyxy[0].tolist()
                class_id = int(box.cls[0])
                label = self.get_label(class_id)
                confidence = float(box.conf[0])
                
                # Calculate relative position (center of box)
                x1, y1, x2, y2 = box_coordinates
                x_center = (x1 + x2) / 2 / frame_width
                y_center = (y1 + y2) / 2 / frame_height
                relative_position = [x_center, y_center]
                
                detections.append({
                    "class": label,
                    "confidence": confidence,
                    "box": box_coordinates,
                    "relative_position": relative_position
                })
        
        return detections 