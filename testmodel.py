import cv2
import supervision as sv
from inference.models.yolo_world.yolo_world import YOLOWorld

# Initialize the YOLO-World model
model = YOLOWorld(model_id="yolo_world/l")
# Load your custom classes
with open("ML/classes.csv", "r") as f:
    class_list = [line.strip() for line in f if line.strip()]

# Set custom classes
model.set_classes(class_list)

# Initialize video capture (replace with your video file path)
cap = cv2.VideoCapture('downloads/6742822bdc0e9bc8ad98386a.mp4')

# Initialize annotators
box_annotator = sv.BoxAnnotator(thickness=2)
label_annotator = sv.LabelAnnotator()

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        break

    # Perform object detection
    results = model.infer(frame)

    # Convert results to supervision Detections
    detections = sv.Detections.from_inference(results)

    # Generate labels for each detection
    labels = [
        f"{detections.data['class_name'][i]} {detections.confidence[i]:.2f}"
        for i in range(len(detections))
    ]

    # Annotate frame with bounding boxes
    annotated_frame = box_annotator.annotate(scene=frame, detections=detections)

    # Annotate frame with labels
    annotated_frame = label_annotator.annotate(scene=annotated_frame, detections=detections, labels=labels)

    # Display the annotated frame
    cv2.imshow("YOLO-World Object Detection", annotated_frame)

    # Exit loop if 'q' key is pressed
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Release video capture and close windows
cap.release()
cv2.destroyAllWindows()
