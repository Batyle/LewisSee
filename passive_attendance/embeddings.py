"""Enrollment loading and embedding matching."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import face_recognition
import numpy as np


@dataclass(frozen=True)
class Person:
    student_id: str
    name: str
    encoding: np.ndarray


def load_people(known_faces_dir: Path) -> list[Person]:
    """Load one or more images from ``known_faces/<student_id>_<name>/``."""
    if not known_faces_dir.is_dir():
        raise FileNotFoundError(
            f"Enrollment directory not found: {known_faces_dir}. "
            "Create it and add '<student_id>_<name>' folders."
        )
    people: list[Person] = []
    for folder in sorted(path for path in known_faces_dir.iterdir() if path.is_dir()):
        student_id, separator, name = folder.name.partition("_")
        if not separator or not student_id or not name:
            raise ValueError(f"Use '<student_id>_<name>' for enrollment folder: {folder.name}")
        for image_path in folder.iterdir():
            if image_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            image = face_recognition.load_image_file(image_path)
            encodings = face_recognition.face_encodings(image)
            if len(encodings) != 1:
                raise ValueError(f"{image_path} must contain exactly one visible face.")
            people.append(Person(student_id, name.replace("_", " "), encodings[0]))
    if not people:
        raise ValueError(f"No enrollment images found in {known_faces_dir}")
    return people


def recognize(encoding: np.ndarray, people: list[Person], tolerance: float) -> tuple[Person | None, float]:
    """Return the nearest enrolled person and its face-distance score."""
    distances = face_recognition.face_distance([person.encoding for person in people], encoding)
    index = int(np.argmin(distances))
    return (people[index], float(distances[index])) if distances[index] <= tolerance else (None, float(distances[index]))
