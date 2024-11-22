import cv2
from ultralytics import YOLO

# Load YOLO model
model = YOLO('yolo11n.pt')  # Replace with your YOLO model file

def process_video_real_time(video_path):
    # Open video file
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        print(f"Error: Unable to open video file {video_path}")
        return

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            print("End of video reached or unable to fetch the frame.")
            break

        # Run YOLO detection on the frame
        results = model.predict(frame, device=0)  # Use GPU (device=0) or set to 'cpu'

        # Draw detections on the frame
        annotated_frame = frame.copy()
        for result in results:
            for box in result.boxes:
                # Extract bounding box coordinates
                x1, y1, x2, y2 = map(int, box.xyxy[0])  # Bounding box corners
                class_id = int(box.cls[0])  # Class ID
                label = model.names[class_id]  # Get label using the model's class names
                confidence = box.conf[0]  # Confidence score

                # Draw rectangle and label on the frame
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)  # Green box
                cv2.putText(
                    annotated_frame,
                    f"{label} {confidence:.2f}",
                    (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 255, 0),
                    2
                )

        # Display the annotated frame
        cv2.imshow("YOLO Real-Time Detection", annotated_frame)

        # Exit if 'q' is pressed
        if cv2.waitKey(1) & 0xFF == ord('q'):
            print("Exiting video display.")
            break

    # Release the video capture and close OpenCV windows
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    # Use the provided test video path
    video_path = "test_videos\\9354031-hd_1920_1080_30fps.mp4"
    process_video_real_time(video_path)
