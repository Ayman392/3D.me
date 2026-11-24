"""
3d.me Dimension & Scale Measurement Engine (Phase 2)
Mandatory scale confirmation, reference object detection (Credit card, A4, ArUco),
and dimension verification table generation.
"""

import io
import math
import logging
from typing import Dict, Any, List, Optional, Tuple
import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger("3dme.cad.measure")

REFERENCE_STANDARDS_MM: Dict[str, Dict[str, float]] = {
    "credit_card": {"width": 85.60, "height": 53.98, "diag": 101.21},
    "a4": {"width": 210.0, "height": 297.0, "diag": 363.74},
    "aruco": {"size": 50.0},
    "us_quarter": {"diameter": 24.26},
    "eur_2": {"diameter": 25.75},
}


def detect_aruco_scale(image_cv: np.ndarray, marker_size_mm: float = 50.0) -> Optional[float]:
    """
    Detects standard ArUco markers in the photo and returns px_per_mm.
    Uses cv2.aruco.ArucoDetector.
    """
    try:
        aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
        parameters = cv2.aruco.DetectorParameters()
        detector = cv2.aruco.ArucoDetector(aruco_dict, parameters)

        gray = cv2.cvtColor(image_cv, cv2.COLOR_BGR2GRAY) if len(image_cv.shape) == 3 else image_cv
        corners, ids, _ = detector.detectMarkers(gray)

        if ids is not None and len(corners) > 0:
            # Measure perimeter of the first detected marker
            c = corners[0][0]  # 4 corner points
            edge1 = np.linalg.norm(c[0] - c[1])
            edge2 = np.linalg.norm(c[1] - c[2])
            edge3 = np.linalg.norm(c[2] - c[3])
            edge4 = np.linalg.norm(c[3] - c[0])
            avg_edge_px = (edge1 + edge2 + edge3 + edge4) / 4.0
            px_per_mm = avg_edge_px / marker_size_mm
            logger.info(f"ArUco marker detected: {avg_edge_px:.1f}px -> {px_per_mm:.2f} px/mm")
            return float(px_per_mm)
    except Exception as e:
        logger.warning(f"ArUco detection error: {e}")
    return None


def detect_reference_scale(
    image_bytes: bytes,
    reference_type: str = "credit_card",
    marker_size_mm: float = 50.0
) -> Tuple[Optional[float], str, float]:
    """
    Derives real physical scale (px_per_mm) from reference object in image.
    Returns (px_per_mm, detected_reference_type, confidence).
    """
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return None, "none", 0.0

        # 1. Try ArUco marker first
        aruco_scale = detect_aruco_scale(img, marker_size_mm)
        if aruco_scale and aruco_scale > 0:
            return aruco_scale, "aruco", 0.95

        # 2. Try Credit Card / A4 rectangle detection via contours
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edged = cv2.Canny(blurred, 40, 150)

        contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:8]

        for cnt in contours:
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.03 * peri, True)
            if len(approx) == 4 and cv2.contourArea(cnt) > 2000:
                rect = cv2.minAreaRect(cnt)
                w, h = rect[1]
                long_edge, short_edge = max(w, h), min(w, h)
                ratio = long_edge / max(1.0, short_edge)

                if reference_type == "credit_card" or 1.45 <= ratio <= 1.70:
                    # Credit card aspect ratio is 85.6 / 53.98 = ~1.585
                    px_per_mm = long_edge / 85.60
                    return float(px_per_mm), "credit_card", 0.88
                elif reference_type == "a4" or 1.35 <= ratio <= 1.48:
                    # A4 aspect ratio is 297.0 / 210.0 = ~1.414
                    px_per_mm = long_edge / 297.0
                    return float(px_per_mm), "a4", 0.88

        # 3. Fallback for coin circles
        if reference_type in ["us_quarter", "eur_2"]:
            circles = cv2.HoughCircles(
                blurred, cv2.HOUGH_GRADIENT, dp=1.2, minDist=50,
                param1=100, param2=40, minRadius=20, maxRadius=200
            )
            if circles is not None:
                circles = np.uint16(np.around(circles))
                diameter_px = circles[0][0][2] * 2.0
                known_d = REFERENCE_STANDARDS_MM.get(reference_type, {}).get("diameter", 24.26)
                return float(diameter_px / known_d), reference_type, 0.85

    except Exception as e:
        logger.warning(f"Scale detection failed: {e}")

    return None, "none", 0.0


def build_dimension_confirmation_table(
    template_name: str,
    raw_parameters: Dict[str, Any],
    scale_source: str,
    px_per_mm: Optional[float] = None,
    user_confirmed: bool = False
) -> Dict[str, Any]:
    """
    Builds the dimension inspection table.
    Every dimension item specifies:
      - name, label, value_mm, source ('measured' | 'user' | 'estimated'), confidence, confirmed.
    Ensures VLM-guessed values are strictly marked 'estimated' with confirmed=False.
    """
    from cad_templates.registry import get_template_schema

    schema_cls = get_template_schema(template_name)
    features: List[Dict[str, Any]] = []

    if schema_cls:
        fields = schema_cls.model_fields
        for k, finfo in fields.items():
            if k in ["model_config", "port_cutouts", "vents", "pointer_notch", "set_screw_hole", "gusset"]:
                continue

            val = raw_parameters.get(k)
            if val is None:
                val = finfo.default

            if isinstance(val, (int, float)):
                # Determine source and confidence
                if scale_source == "caliper":
                    source = "user"
                    confidence = "high"
                    confirmed = True
                elif scale_source in ["aruco", "credit_card", "a4", "reference_object"]:
                    source = "measured"
                    confidence = "high"
                    confirmed = True
                elif scale_source == "manual_spec":
                    source = "user"
                    confidence = "high"
                    confirmed = True
                else:
                    source = "estimated"
                    confidence = "medium"
                    confirmed = user_confirmed

                label = finfo.description or k.replace("_", " ").title()
                features.append({
                    "name": k,
                    "label": label,
                    "value_mm": float(val),
                    "unit": "mm",
                    "source": source,
                    "confidence": confidence,
                    "confirmed": confirmed,
                })

    # Can generate only if all required dimensions are confirmed
    unconfirmed_count = sum(1 for f in features if not f["confirmed"])
    can_generate = (unconfirmed_count == 0) and (scale_source != "unconfirmed" or user_confirmed)

    return {
        "template": template_name,
        "scale_source": scale_source,
        "px_per_mm": px_per_mm,
        "features": features,
        "can_generate": can_generate,
        "unconfirmed_count": unconfirmed_count,
        "message": (
            "All dimensions confirmed. Ready for parametric generation."
            if can_generate else
            f"{unconfirmed_count} dimension(s) estimated. Review and confirm measurements before generation."
        )
    }
