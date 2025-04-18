import numpy as np
from scipy.optimize import linear_sum_assignment
from collections import deque

class KalmanBoxTracker:
    count = 0
    def __init__(self, bbox):
        self.bbox = bbox  # [x1, y1, x2, y2]
        self.id = KalmanBoxTracker.count
        KalmanBoxTracker.count += 1
        self.hits = 1
        self.no_losses = 0
        self.trace = deque(maxlen=10)
        self.trace.append(bbox)

    def update(self, bbox):
        self.bbox = bbox
        self.hits += 1
        self.no_losses = 0
        self.trace.append(bbox)

    def predict(self):
        self.no_losses += 1
        return self.bbox

class Sort:
    def __init__(self, max_age=3, min_hits=1, iou_threshold=0.3):
        self.max_age = max_age
        self.min_hits = min_hits
        self.trackers = []
        self.frame_count = 0
        self.iou_threshold = iou_threshold

    def update(self, dets):
        self.frame_count += 1
        trks = np.array([trk.bbox for trk in self.trackers])
        matched, unmatched_dets, unmatched_trks = associate_detections_to_trackers(dets, trks, self.iou_threshold)
        # Update matched trackers
        for t, trk in enumerate(self.trackers):
            if t not in unmatched_trks:
                d = matched[t]
                trk.update(dets[d])
            else:
                trk.predict()
        # Create new trackers for unmatched detections
        for i in unmatched_dets:
            self.trackers.append(KalmanBoxTracker(dets[i]))
        # Remove dead trackers
        self.trackers = [t for t in self.trackers if t.no_losses <= self.max_age]
        # Prepare output: [x1, y1, x2, y2, id]
        ret = []
        for trk in self.trackers:
            if trk.hits >= self.min_hits or self.frame_count <= self.min_hits:
                ret.append(np.append(trk.bbox, trk.id))
        return np.array(ret)

def iou(bb_test, bb_gt):
    xx1 = np.maximum(bb_test[0], bb_gt[0])
    yy1 = np.maximum(bb_test[1], bb_gt[1])
    xx2 = np.minimum(bb_test[2], bb_gt[2])
    yy2 = np.minimum(bb_test[3], bb_gt[3])
    w = np.maximum(0., xx2 - xx1)
    h = np.maximum(0., yy2 - yy1)
    wh = w * h
    o = wh / ((bb_test[2] - bb_test[0]) * (bb_test[3] - bb_test[1])
              + (bb_gt[2] - bb_gt[0]) * (bb_gt[3] - bb_gt[1]) - wh)
    return o

def associate_detections_to_trackers(detections, trackers, iou_threshold=0.3):
    if len(trackers) == 0:
        return {}, list(range(len(detections))), []
    iou_matrix = np.zeros((len(detections), len(trackers)), dtype=np.float32)
    for d, det in enumerate(detections):
        for t, trk in enumerate(trackers):
            iou_matrix[d, t] = iou(det, trk)
    matched_indices = linear_sum_assignment(-iou_matrix)
    matched_indices = np.asarray(matched_indices).T
    unmatched_detections = list(set(range(len(detections))) - set(matched_indices[:, 0]))
    unmatched_trackers = list(set(range(len(trackers))) - set(matched_indices[:, 1]))
    matches = {}
    for d, t in matched_indices:
        if iou_matrix[d, t] < iou_threshold:
            unmatched_detections.append(d)
            unmatched_trackers.append(t)
        else:
            matches[t] = d
    return matches, unmatched_detections, unmatched_trackers
