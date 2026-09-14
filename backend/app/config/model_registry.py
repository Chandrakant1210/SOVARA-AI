"""
SOVARA AI — Model Registry

Loads model definitions from models.yaml and exposes a simple interface
for the rest of the app to select a model by capability, without ever
hard-coding a specific model name in application code.
"""

import os
import yaml

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "models.yaml")

_registry_cache = None


def _load_registry() -> dict:
    """Loads and caches the model registry from models.yaml."""
    global _registry_cache
    if _registry_cache is None:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        _registry_cache = data.get("models", {})
    return _registry_cache


def get_model_for_capability(capability: str) -> dict:
    """
    Returns the first available model entry matching the requested
    capability (e.g. "reasoning", "vision", "coding", "classification").

    Raises ValueError if no available model supports that capability —
    this is intentional: the caller should handle this explicitly rather
    than silently falling back to the wrong model.
    """
    registry = _load_registry()

    for model_id, config in registry.items():
        if config.get("capability") == capability and config.get("available"):
            return {"id": model_id, **config}

    raise ValueError(
        f"No available model found for capability '{capability}'. "
        f"Check models.yaml — the model may be defined but marked "
        f"available: false, or the capability name may be misspelled."
    )


def list_models() -> dict:
    """Returns the full model registry, as loaded from models.yaml."""
    return _load_registry()
