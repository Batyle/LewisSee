"""Silent, heuristic passive liveness checks for face crops.

This module intentionally has no blink, smile, or challenge-response logic.
It evaluates every supplied frame from texture and high-frequency image signals.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
from skimage.feature import local_binary_pattern

# These are starting values for a 160-320px, well-lit face crop. Calibrate them
# with real and spoof samples captured by the actual camera before deployment.
MIN_FACE_SIZE = int(os.getenv("LIVENESS_MIN_FACE_SIZE", "96"))
MIN_TEXTURE_MASS = float(os.getenv("LIVENESS_MIN_TEXTURE_MASS", "0.32"))
MIN_LBP_ENTROPY = float(os.getenv("LIVENESS_MIN_LBP_ENTROPY", "1.15"))
MIN_LAPLACIAN_VARIANCE = float(os.getenv("LIVENESS_MIN_LAPLACIAN_VARIANCE", "28"))
MAX_LAPLACIAN_VARIANCE = float(os.getenv("LIVENESS_MAX_LAPLACIAN_VARIANCE", "2800"))
MAX_REFERENCE_DISTANCE = float(os.getenv("LIVENESS_MAX_REFERENCE_DISTANCE", "0.42"))
LBP_POINTS = 8
LBP_RADIUS = 1


@lru_cache(maxsize=1)
def _reference_histogram() -> np.ndarray | None:
    """Load an optional LBP baseline made from real enrollment-camera samples."""
    filename = os.getenv("LIVENESS_REFERENCE_HISTOGRAM", "")
    if not filename or not Path(filename).is_file():
        return None
    reference = np.load(filename).astype(np.float32).ravel()
    if reference.size != LBP_POINTS + 2 or reference.sum() <= 0:
        raise ValueError("LIVENESS_REFERENCE_HISTOGRAM must contain 10 non-zero bins.")
    return reference / reference.sum()


def is_live(face_image: np.ndarray) -> bool:
    """Return ``True`` only when a BGR/RGB face crop passes passive checks.

    The input is evaluated silently. A real face should have enough local skin
    texture and a natural range of high-frequency detail. A flat print, blurred
    phone replay, or strongly moire screen commonly fails one of these checks.
    This is a heuristic gate, not proof of life; use a trained PAD model for a
    security-sensitive deployment.
    """
    if face_image is None or face_image.size == 0:
        return False
    if min(face_image.shape[:2]) < MIN_FACE_SIZE:
        return False

    gray = (
        cv2.cvtColor(face_image, cv2.COLOR_BGR2GRAY)
        if face_image.ndim == 3
        else face_image.copy()
    )
    gray = cv2.equalizeHist(gray)

    # Uniform LBP produces 10 bins. Interior bins capture useful micro-texture;
    # a flat/smooth display has comparatively little mass in those bins.
    lbp = local_binary_pattern(gray, LBP_POINTS, LBP_RADIUS, method="uniform")
    histogram, _ = np.histogram(
        lbp.ravel(), bins=np.arange(LBP_POINTS + 3), range=(0, LBP_POINTS + 2)
    )
    histogram = histogram.astype(np.float32)
    histogram /= max(histogram.sum(), 1.0)
    texture_mass = float(histogram[1:-1].sum())
    entropy = float(-(histogram[histogram > 0] * np.log2(histogram[histogram > 0])).sum())

    # Screens and prints often introduce blur, re-sampling, or abnormal edge
    # energy. Very low and very high values are both rejected.
    laplacian_variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    reference = _reference_histogram()
    reference_distance = (
        float(np.abs(histogram - reference).sum()) if reference is not None else 0.0
    )

    return bool(
        texture_mass >= MIN_TEXTURE_MASS
        and entropy >= MIN_LBP_ENTROPY
        and MIN_LAPLACIAN_VARIANCE <= laplacian_variance <= MAX_LAPLACIAN_VARIANCE
        and reference_distance <= MAX_REFERENCE_DISTANCE
    )
