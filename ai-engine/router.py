"""
3d.me Intent Router
Classifies user creation requests into "functional" (parametric CAD) or "decorative" (neural TripoSR).
Uses deterministic heuristic keyword rules first, with local Ollama fallback for ambiguous cases.
"""

import json
import logging
import os
import re
import urllib.request
from typing import Dict, Any, Optional, Set

logger = logging.getLogger("3dme.router")

OLLAMA_TEXT_MODEL = os.environ.get("OLLAMA_TEXT_MODEL", "qwen2.5-coder:7b")
OLLAMA_VISION_MODEL = os.environ.get("OLLAMA_VISION_MODEL", "qwen2.5vl:7b")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")

FUNCTIONAL_KEYWORDS: Set[str] = {
    "case", "enclosure", "bracket", "cover", "clip", "knob", "mount", "gasket",
    "hinge", "replacement", "fits", "mm", "standoff", "screw", "bolt", "nut",
    "thread", "threaded", "spacer", "washer", "plate", "box", "housing", "chassis",
    "flange", "rail", "adapter", "coupling", "bushing", "gear", "pulley", "shaft",
    "plug", "cap", "holder", "dock", "stand", "jig", "fixture", "dimension",
    "tolerance", "clearance", "caliper", "fitting", "lid", "din", "extrusion",
    "pcb", "raspberry", "arduino", "esp32", "cable", "hook", "bearing", "slot",
    "hole", "holes", "m3", "m4", "m5", "m6", "m8", "cutout", "cutouts", "vent", "vents",
    "param", "parametric", "cad", "step", "dxf", "mechanical", "casing"
}

DECORATIVE_KEYWORDS: Set[str] = {
    "statue", "figurine", "sculpture", "character", "face", "creature", "monster",
    "dragon", "animal", "dog", "cat", "bird", "toy", "avatar", "bust", "art",
    "organic", "plant", "tree", "flower", "miniature", "warhammer", "dnd", "prop",
    "sword", "skull", "shield", "costume", "cosplay", "pendant", "jewelry"
}

DIMENSION_REGEX = re.compile(r"\b\d+(\.\d+)?\s*(mm|cm|in|inch|inches|millimeter|millimeters)\b", re.IGNORECASE)


def classify_intent_heuristic(prompt: str) -> Optional[Dict[str, str]]:
    """
    Deterministic rule-based keyword / regex heuristic classifier.
    Returns {"mode": "functional"|"decorative", "reason": str} or None if ambiguous.
    """
    if not prompt:
        return None

    clean_text = prompt.lower()
    # Extract alphanumeric words (splitting on hyphens and punctuation)
    tokens = set(re.findall(r"[a-z0-9]+", clean_text))

    has_dimensions = bool(DIMENSION_REGEX.search(clean_text))
    func_matches = sorted(list(tokens.intersection(FUNCTIONAL_KEYWORDS)))
    deco_matches = sorted(list(tokens.intersection(DECORATIVE_KEYWORDS)))

    if has_dimensions and "mm" not in func_matches:
        func_matches.append("explicit dimensions")

    func_score = len(func_matches) + (2 if has_dimensions else 0)
    deco_score = len(deco_matches)

    if func_score > deco_score and func_score > 0:
        return {
            "mode": "functional",
            "reason": f"Matched functional indicators: {', '.join(func_matches[:4])}"
        }
    elif deco_score > func_score and deco_score > 0:
        return {
            "mode": "decorative",
            "reason": f"Matched decorative indicators: {', '.join(deco_matches[:4])}"
        }

    return None


def classify_with_ollama(prompt: str, image_b64: Optional[str] = None) -> Dict[str, str]:
    """
    Queries local Ollama to classify ambiguous requests.
    Enforces keep_alive: 0 to respect the 16 GB Apple Silicon memory constraint.
    """
    model = OLLAMA_VISION_MODEL if image_b64 else OLLAMA_TEXT_MODEL
    system_prompt = (
        "You are an intent routing classifier for a 3D manufacturing system. "
        "Classify the user's intent into either 'functional' or 'decorative'.\n"
        "- functional: mechanical parts, electronics casings, brackets, enclosures, clips, mounts, jigs, replacement parts, or objects with strict dimensional fits.\n"
        "- decorative: figurines, characters, sculptures, organic forms, toys, or artistic shapes.\n\n"
        "Respond ONLY with raw JSON:\n"
        '{"mode": "functional" | "decorative", "reason": "concise explanation"}'
    )

    message: Dict[str, Any] = {
        "role": "user",
        "content": f"User prompt: {prompt or '(Image only)'}"
    }
    if image_b64 and model == OLLAMA_VISION_MODEL:
        message["images"] = [image_b64]

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            message
        ],
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.1,
            "num_predict": 128
        },
        "keep_alive": 0
    }

    try:
        req = urllib.request.Request(
            f"{OLLAMA_HOST}/api/chat",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data.get("message", {}).get("content", "").strip()
            parsed = json.loads(content)
            mode = parsed.get("mode", "").lower()
            if mode in ["functional", "decorative"]:
                return {
                    "mode": mode,
                    "reason": parsed.get("reason", f"Classified by local model ({model})")
                }
    except Exception as e:
        logger.warning(f"Ollama intent classification failed: {e}")

    # Fallback default if Ollama is unreachable
    return {
        "mode": "functional" if DIMENSION_REGEX.search(prompt) else "decorative",
        "reason": "Default routing fallback based on structural cues."
    }


def classify_intent(
    prompt: Optional[str] = "",
    image_b64: Optional[str] = None
) -> Dict[str, str]:
    """
    Main entry point for intent routing.
    Deterministic heuristic first, falling back to Ollama.
    """
    prompt = prompt or ""
    heuristic_res = classify_intent_heuristic(prompt)
    if heuristic_res is not None:
        return heuristic_res

    return classify_with_ollama(prompt, image_b64=image_b64)
