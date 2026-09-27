"""
SOVARA AI - Model Router

Selects a local model by capability using the registry (models.yaml) AND
what is actually installed in the local Ollama server. Every decision comes
with an honest reason, including which candidates were skipped and why.
Only the local Ollama server is ever contacted.
"""

import threading
import time

import requests

from app.config.model_registry import list_models
from app.core.config import settings

# If no model for a capability is usable, try these capabilities next, in order.
CAPABILITY_FALLBACKS = {
    "coding": ["reasoning"],
    "classification": ["reasoning"],
    "reasoning": [],
    "vision": [],
}

_INSTALLED_CACHE_SECONDS = 30
_installed_cache: dict = {"at": 0.0, "models": None}
_installed_lock = threading.Lock()


class ModelUnavailableError(RuntimeError):
    """No usable local model for the requested capability."""


def _normalize(name: str) -> str:
    name = name.strip().lower()
    return name if ":" in name else f"{name}:latest"


def installed_ollama_models() -> set[str]:
    """Model names installed in the local Ollama server (cached briefly)."""
    with _installed_lock:
        now = time.monotonic()
        if _installed_cache["models"] is not None and now - _installed_cache["at"] < _INSTALLED_CACHE_SECONDS:
            return _installed_cache["models"]
        try:
            resp = requests.get(f"{settings.ollama_host}/api/tags", timeout=5)
            resp.raise_for_status()
            models = {_normalize(m["name"]) for m in resp.json().get("models", [])}
        except Exception as e:
            raise ModelUnavailableError(f"Local Ollama server is not reachable: {e}")
        _installed_cache.update(at=now, models=models)
        return models


def _candidates(capability: str, installed: set[str]) -> tuple[dict | None, list[str]]:
    """First usable model for one capability, plus reasons for skipped ones."""
    skipped = []
    for model_id, cfg in list_models().items():
        if cfg.get("capability") != capability:
            continue
        name = cfg.get("model_name", "")
        if not cfg.get("available"):
            skipped.append(f"{name}: disabled in registry")
        elif _normalize(name) not in installed:
            skipped.append(f"{name}: not installed in Ollama")
        else:
            return {"id": model_id, **cfg}, skipped
    return None, skipped


def resolve_model(capability: str) -> dict:
    """
    Returns {"model", "capability_requested", "capability_served", "reason", "skipped"}.
    Raises ModelUnavailableError if neither the capability nor its fallbacks
    have a usable model.
    """
    installed = installed_ollama_models()
    all_skipped: list[str] = []

    for served in [capability] + CAPABILITY_FALLBACKS.get(capability, []):
        model, skipped = _candidates(served, installed)
        all_skipped.extend(skipped)
        if model:
            if served == capability:
                reason = f"{capability} task: using {capability} model {model['model_name']}"
            else:
                detail = f" ({'; '.join(all_skipped)})" if all_skipped else ""
                reason = (f"No {capability} model available{detail}; "
                          f"using {served} model {model['model_name']}")
            return {
                "model": model,
                "capability_requested": capability,
                "capability_served": served,
                "reason": reason,
                "skipped": all_skipped,
            }

    detail = f": {'; '.join(all_skipped)}" if all_skipped else ": none registered"
    raise ModelUnavailableError(f"No usable model for '{capability}'{detail}")


def chat(model_name: str, messages: list[dict], timeout: int = 180, temperature: float = 0.2) -> str:
    """Single non-streaming chat call to the local Ollama server."""
    resp = requests.post(
        f"{settings.ollama_host}/api/chat",
        json={
            "model": model_name,
            "messages": messages,
            "stream": False,
            "think": False,  # qwen3: skip the thinking trace; we only want the answer
            "options": {"temperature": temperature},
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.json().get("message", {}).get("content", "")


def generate_response(prompt: str) -> str:
    """
    Sends a prompt to the locally running Ollama model and returns the response.
    Kept for existing callers (chat, agent); new code should use resolve_model() + chat().
    """
    response = requests.post(
        f"{settings.ollama_host}/api/generate",
        json={
            "model": settings.ollama_model,
            "prompt": prompt,
            "stream": False,
        },
        timeout=120,
    )
    response.raise_for_status()
    data = response.json()
    return data.get("response", "")