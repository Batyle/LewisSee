"""Run webcam/IP-camera facial attendance with silent passive liveness checks."""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import face_recognition

from attendance import AttendanceStore
from embeddings import load_people, recognize
from liveness import is_live


def parse_camera(value: str) -> int | str:
    return int(value) if value.isdigit() else value


def face_crop(frame, top: int, right: int, bottom: int, left: int, padding: float = 0.18):
    """Return a padded crop, clipped safely to the camera frame."""
    height, width = frame.shape[:2]
    pad_x, pad_y = int((right - left) * padding), int((bottom - top) * padding)
    return frame[max(0, top - pad_y):min(height, bottom + pad_y), max(0, left - pad_x):min(width, right + pad_x)]


def main() -> None:
    parser = argparse.ArgumentParser(description="Passive-liveness facial attendance")
    parser.add_argument("--camera", default="0", help="webcam index (0) or rtsp/http camera URL")
    parser.add_argument("--known-faces", type=Path, default=Path("known_faces"))
    parser.add_argument("--database", type=Path, default=Path("data/attendance.sqlite3"))
    parser.add_argument("--tolerance", type=float, default=0.48, help="lower is stricter; typical range is 0.42-0.55")
    parser.add_argument("--cooldown", type=int, default=300, help="seconds before a student can be logged again")
    parser.add_argument("--detector", choices=("hog", "cnn"), default="hog")
    args = parser.parse_args()

    if not 0.0 < args.tolerance < 1.0:
        parser.error("--tolerance must be between 0 and 1.")
    if args.cooldown < 0:
        parser.error("--cooldown must be zero or greater.")

    people = load_people(args.known_faces)
    store = AttendanceStore(args.database, args.cooldown)
    camera = cv2.VideoCapture(parse_camera(args.camera))
    if not camera.isOpened():
        raise RuntimeError("Camera could not be opened. Check --camera or camera permissions.")

    print("Running. Press q in the video window to stop.")
    while True:
        ok, frame = camera.read()
        if not ok:
            print("Camera frame could not be read; stopping.")
            break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        locations = face_recognition.face_locations(rgb, model=args.detector)
        encodings = face_recognition.face_encodings(rgb, locations)

        for (top, right, bottom, left), encoding in zip(locations, encodings):
            crop = face_crop(frame, top, right, bottom, left)
            live = is_live(crop)
            person, distance = recognize(encoding, people, args.tolerance)
            color, label = (0, 165, 255), "Unknown"
            if person and not live:
                color, label = (0, 0, 255), "Spoof suspected"
            elif person and live:
                logged = store.record_if_due(person.student_id, person.name)
                color = (0, 170, 0)
                label = f"{person.name} | {'Logged' if logged else 'Already logged'}"
            cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
            cv2.putText(frame, label, (left, max(24, top - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)
            cv2.putText(frame, f"distance: {distance:.2f}", (left, min(frame.shape[0] - 10, bottom + 20)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

        cv2.imshow("Passive Face Attendance", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    camera.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
