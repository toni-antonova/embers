# ─────────────────────────────────────────────────────────────────────────────
# Model Registry — loads, holds, and provides access to ML models
# ─────────────────────────────────────────────────────────────────────────────


import logging
from typing import Any, Callable

from app.config import Settings

logger = logging.getLogger(__name__)


class ModelRegistry:
    """Manages ML model lifecycle: loading, access, and lazy initialization.

    Primary models (SDXL Turbo, PartCrafter) load eagerly via load_primary().
    Fallback models (Hunyuan3D, Grounded SAM) lazy-load via get_or_load().

    Stored in app.state during lifespan, injected via Depends().
    """

    def __init__(self, settings: Settings):
        self._settings = settings
        self._models: dict[str, Any] = {}
        self._loaded_names: list[str] = []

    def load_primary(self) -> None:
        """Load primary models at startup. Called during lifespan.

        Actual model loading will be added in Prompts 03 and 04.
        """
        if self._settings.skip_model_load:
            logger.info("SKIP_MODEL_LOAD=true — skipping model loading")
            return

        logger.info("Primary model loading — models will be added in subsequent prompts")
        self._log_vram()

    def register(self, name: str, model: Any) -> None:
        """Register a loaded model by name."""
        self._models[name] = model
        if name not in self._loaded_names:
            self._loaded_names.append(name)
        logger.info(f"Model '{name}' registered")
        self._log_vram()

    def get(self, name: str) -> Any:
        """Get a loaded model by name. Raises KeyError if not loaded."""
        if name not in self._models:
            raise KeyError(f"Model '{name}' not loaded. Available: {self._loaded_names}")
        return self._models[name]

    def get_or_load(self, name: str, factory: Callable[[], Any]) -> Any:
        """Get model, or lazy-load it using the factory if not yet loaded."""
        if name not in self._models:
            logger.info(f"Lazy-loading model '{name}'...")
            model = factory()
            self.register(name, model)
        return self._models[name]

    def has(self, name: str) -> bool:
        """Check if a model is loaded."""
        return name in self._models

    @property
    def loaded_names(self) -> list[str]:
        """Names of all currently loaded models."""
        return list(self._loaded_names)

    @property
    def skip_loading(self) -> bool:
        """Whether model loading was skipped (dev/test mode)."""
        return self._settings.skip_model_load

    def _log_vram(self) -> None:
        """Log current GPU VRAM usage if available."""
        try:
            import torch

            if torch.cuda.is_available():
                allocated = torch.cuda.memory_allocated() / 1e9
                total = torch.cuda.get_device_properties(0).total_mem / 1e9
                logger.info(f"GPU VRAM: {allocated:.1f}GB / {total:.1f}GB")
        except ImportError:
            pass
