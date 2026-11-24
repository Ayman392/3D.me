import gc
import logging
import os
import sys
from typing import Optional
import torch

os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tsr.system import TSR

logger = logging.getLogger("meshforge.model")
logging.basicConfig(level=logging.INFO)

class TripoSRModelManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TripoSRModelManager, cls).__new__(cls)
            cls._instance.model = None
            cls._instance.device = cls._instance._detect_device()
            cls._instance.pretrained_path = "stabilityai/TripoSR"
        return cls._instance

    def _detect_device(self) -> str:
        mps_built = torch.backends.mps.is_built()
        mps_available = torch.backends.mps.is_available()
        logger.info(f"Checking Apple Silicon MPS: built={mps_built}, available={mps_available}")
        if mps_built and mps_available:
            return "mps"
        return "cpu"

    def load_model(self, force_cpu: bool = False):
        if self.model is not None and (not force_cpu or self.device == "cpu"):
            return self.model

        target_device = "cpu" if force_cpu else self.device
        logger.info(f"Loading TripoSR model on device: {target_device}")

        try:
            self.model = TSR.from_pretrained(
                self.pretrained_path,
                config_name="config.yaml",
                weight_name="model.ckpt",
            )
            self.model.renderer.set_chunk_size(8192)
            self.model.to(target_device)
            self.device = target_device
            logger.info(f"TripoSR model loaded successfully on {self.device}")
        except Exception as e:
            logger.error(f"Error loading model on {target_device}: {e}")
            if target_device != "cpu":
                logger.warning("Falling back to CPU device...")
                self.device = "cpu"
                self.model = TSR.from_pretrained(
                    self.pretrained_path,
                    config_name="config.yaml",
                    weight_name="model.ckpt",
                )
                self.model.renderer.set_chunk_size(8192)
                self.model.to("cpu")
                logger.info("TripoSR model loaded successfully on CPU fallback")
            else:
                raise e

        return self.model

    def release_memory(self):
        gc.collect()
        if self.device == "mps" and hasattr(torch, "mps"):
            try:
                torch.mps.empty_cache()
            except Exception as e:
                logger.warning(f"Error clearing MPS cache: {e}")


def get_segmentation_session(model_name: Optional[str] = None):
    """
    Returns background segmentation session.
    Defaults to U²-Net ('u2net', Apache 2.0 / permissive friendly).
    Can also use 'bria-rmbg' or 'isnet-general-use'.
    """
    import rembg
    target_model = model_name or os.environ.get("SEGMENTATION_MODEL", "u2net")
    logger.info(f"Initializing background segmentation session with model '{target_model}'")
    return rembg.new_session(model_name=target_model)

