"""
SOVARA AI - Model Registry

Loads model definitions from models.yaml and exposes a simple interface
for the rest of the app to select a model by capability, without ever
hard-coding a specific model name in application code.
"""

import os
import re
import shutil
import tempfile
import threading

import yaml

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "models.yaml")

_registry_cache = None
_write_lock = threading.Lock()

REGISTRABLE_CAPABILITIES = ("reasoning", "coding", "vision", "classification")


def _load_registry() -> dict:
    """Loads and caches the model registry from models.yaml."""
    global _registry_cache
    if _registry_cache is None:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        _registry_cache = data.get("models", {})
    return _registry_cache


def reload_registry() -> dict:
    """Drops the cache and re-reads models.yaml."""
    global _registry_cache
    _registry_cache = None
    return _load_registry()


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


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9.]+", "-", name.lower()).strip("-")


def register_model(model_name: str, capability: str, description: str) -> str:
    """
    Appends a new entry to models.yaml and returns its registry id.

    The entry is appended as text (rather than re-dumping the whole file)
    so the file's comments survive. The result is re-parsed and verified
    before it atomically replaces the original; a .bak copy is kept.
    Assumes `models:` is the last top-level key in models.yaml.
    """
    if capability not in REGISTRABLE_CAPABILITIES:
        raise ValueError(f"Unknown capability '{capability}'")

    with _write_lock:
        registry = reload_registry()
        if any(str(cfg.get("model_name", "")).lower() == model_name.lower() for cfg in registry.values()):
            raise ValueError(f"'{model_name}' is already registered")

        base = _slug(model_name) or "model"
        model_id, n = base, 2
        while model_id in registry:
            model_id, n = f"{base}-{n}", n + 1

        entry = {model_id: {
            "capability": capability,
            "provider": "ollama",
            "model_name": model_name,
            "description": description,
            "available": True,
        }}
        # safe_dump quotes/escapes values, so user text can't inject YAML structure.
        block = yaml.safe_dump(entry, sort_keys=False, allow_unicode=True)
        indented = "".join(f"  {line}\n" for line in block.splitlines())

        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            original = f.read()
        updated = original.rstrip("\n") + "\n\n" + indented

        parsed = yaml.safe_load(updated)
        if parsed.get("models", {}).get(model_id, {}).get("model_name") != model_name:
            raise RuntimeError("Registry update failed verification; models.yaml was not changed")

        shutil.copy2(_CONFIG_PATH, _CONFIG_PATH + ".bak")
        fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(_CONFIG_PATH), suffix=".yaml.tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(updated)
            os.replace(tmp_path, _CONFIG_PATH)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

        reload_registry()
        return model_id