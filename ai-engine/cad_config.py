import os

# Centralized configuration for local Ollama AI models and endpoints
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_CHAT_ENDPOINT = f"{OLLAMA_BASE_URL}/api/chat"

# Text / Code generation model (used for CAD editing and planning)
OLLAMA_TEXT_MODEL = os.getenv("OLLAMA_TEXT_MODEL", "qwen2.5-coder:7b")

# Vision-Language model (used for photo-to-part analysis)
OLLAMA_VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL", "qwen2.5vl:7b")

# Maximum photo upload size (15 MB)
MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024

# Downscaling resolution limit
MAX_PHOTO_LONG_EDGE = 1280
