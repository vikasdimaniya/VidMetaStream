import cv2
from ultralytics import YOLO
import os
import glob

# Load YOLO model
model = YOLO('yolo11n.pt')  # Replace with your YOLO model file

def process_video_save_annotated(video_path, output_path=None):
    """
    Processes the video to detect objects using YOLO, annotates each frame with bounding boxes and labels,
    displays the annotated video in real-time, and saves the annotated video to disk.

    Args:
        video_path (str): Path to the input video file.
        output_path (str, optional): Path to save the annotated video. If None, saves in the same directory
                                     with prefix 'annotated_'.
    """
    # Open video file
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        print(f"Error: Unable to open video file {video_path}")
        return
    
    # Retrieve video properties
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    # Handle cases where FPS is not available
    if fps == 0:
        fps = 30  # Default FPS
        print("Warning: FPS not found. Defaulting to 30.")
    
    # Define output video path
    if output_path is None:
        directory, filename = os.path.split(video_path)
        annotated_video_name = f"annotated_{filename}"
        output_path = os.path.join(directory, annotated_video_name)
    
    # Define the codec and create VideoWriter object
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')  # Codec for MP4
    out = cv2.VideoWriter(output_path, fourcc, fps, (frame_width, frame_height))
    
    if not out.isOpened():
        print(f"Error: Unable to initialize VideoWriter with path {output_path}")
        cap.release()
        return
    
    print(f"Annotated video will be saved as: {output_path}")
    
    frame_number = 0
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            print("End of video reached or unable to fetch the frame.")
            break
    
        # Run YOLO detection on the frame
        results = model.predict(frame, device="cpu")  # Use GPU (device=0) if available
    
        # Create a copy of the frame to draw annotations
        annotated_frame = frame.copy()
    
        for result in results:
            for box in result.boxes:
                # Extract bounding box coordinates
                x1, y1, x2, y2 = map(int, box.xyxy[0])  # Bounding box corners
                class_id = int(box.cls[0])  # Class ID
                label = model.names[class_id]  # Get label using the model's class names
                confidence = box.conf[0]  # Confidence score
    
                # Draw rectangle on the frame
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)  # Green box
    
                # Prepare label text with confidence
                label_text = f"{label} {confidence:.2f}"
    
                # Calculate text size for background rectangle
                (text_width, text_height), baseline = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
    
                # Draw background rectangle for text
                cv2.rectangle(annotated_frame, (x1, y1 - text_height - baseline), (x1 + text_width, y1), (0, 255, 0), -1)
    
                # Put label text above the bounding box
                cv2.putText(annotated_frame, label_text, (x1, y1 - baseline), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
    
        # Write the annotated frame to the output video
        out.write(annotated_frame)
    
        # Display the annotated frame in a window
        cv2.imshow("YOLO Annotated Video", annotated_frame)
    
        # Exit if 'q' is pressed
        if cv2.waitKey(1) & 0xFF == ord('q'):
            print("Exiting video display.")
            break
    
        frame_number += 1
    
    # Release resources
    cap.release()
    out.release()
    cv2.destroyAllWindows()
    
    print(f"Annotated video saved successfully at: {output_path}")

def process_videos_in_folder(folder_path, output_folder=None):
    """
    Process all video files in the specified folder.
    
    Args:
        folder_path (str): Path to the folder containing video files
        output_folder (str, optional): Path to save annotated videos. If None, annotated videos
                                      will be saved in the same directory.
    """
    # Create output folder if specified and doesn't exist
    if output_folder and not os.path.exists(output_folder):
        os.makedirs(output_folder)
        print(f"Created output directory: {output_folder}")
    
    # Get all video files in the folder (common video extensions)
    video_extensions = ('*.mp4', '*.avi', '*.mov', '*.mkv', '*.mpg', '*.mpeg', '*.wmv')
    video_files = []
    
    for ext in video_extensions:
        video_files.extend(glob.glob(os.path.join(folder_path, ext)))
    
    if not video_files:
        print(f"No video files found in {folder_path}")
        return
    
    total_videos = len(video_files)
    print(f"Found {total_videos} video files to process")
    
    # Process each video
    for i, video_path in enumerate(video_files):
        videos_left = total_videos - i
        print(f"Processing video {i+1}/{total_videos}: {os.path.basename(video_path)}")
        print(f"Videos remaining after this one: {videos_left-1}")
        
        if output_folder:
            # Generate output path in the specified output folder
            filename = os.path.basename(video_path)
            output_path = os.path.join(output_folder, f"annotated_{filename}")
        else:
            output_path = None  # Will use default behavior in process_video_save_annotated
        
        # Process the video
        process_video_save_annotated(video_path, output_path)
        
        # Print completion message
        print(f"Completed video {i+1}/{total_videos}. {videos_left-1} videos remaining.")
        print("-" * 50)

if __name__ == "__main__":
    # Process all videos in the sample_videos folder
    sample_videos_folder = "sample_videos"
    
    # Optional: create a specific output folder for annotated videos
    output_folder = "annotated_videos"
    
    # Process all videos without a specific output folder (will save in the same directory)
    # process_videos_in_folder(sample_videos_folder)
    
    # Alternatively, uncomment the following line to save in a dedicated output folder
    process_videos_in_folder(sample_videos_folder, output_folder="annotated_videos")
