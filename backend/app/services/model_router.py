"""
SOVARA AI - Model Router

Selects a local model by capability using the registry (models.yaml) AND
what is actually installed in the local Ollama server. Every decision comes
with an honest reason, including which candidates were skipped and why.
Only the local Ollama server is ever contacted.
"""

import logging
import os
import threading
import time

import requests

from app.config.model_registry import list_models

# Human-readable task names for each capability (used by the registry UI).
CAPABILITY_LABELS = {
    "reasoning": "Document analysis, drafting",
    "coding": "Code, calculations",
    "vision": "Image, scan, drawing",
    "classification": "Intent classification",
}
from app.core.config import settings

logger = logging.getLogger(__name__)

# Local inference settings (overridable via environment variables).
# 8192 tokens fits qwen3:8b plus its cache in 8 GB VRAM; Ollama's default
# (4096) silently drops the start of longer prompts.
LLM_NUM_CTX = int(os.getenv("SOVARA_NUM_CTX", "8192"))
# Keep the model in VRAM between requests so a demo never waits for a cold load.
LLM_KEEP_ALIVE = os.getenv("SOVARA_KEEP_ALIVE", "30m")

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


def installed_ollama_details() -> dict[str, dict]:
    """
    Models installed in the local Ollama server, keyed by normalized name,
    with size, parameter count and quantization. Cached briefly.
    """
    with _installed_lock:
        now = time.monotonic()
        if _installed_cache["models"] is not None and now - _installed_cache["at"] < _INSTALLED_CACHE_SECONDS:
            return _installed_cache["models"]
        try:
            resp = requests.get(f"{settings.ollama_host}/api/tags", timeout=5)
            resp.raise_for_status()
            models = {}
            for m in resp.json().get("models", []):
                details = m.get("details") or {}
                models[_normalize(m["name"])] = {
                    "name": m["name"],
                    "size_bytes": m.get("size"),
                    "parameter_size": details.get("parameter_size"),
                    "quantization": details.get("quantization_level"),
                    "family": details.get("family"),
                }
        except Exception as e:
            raise ModelUnavailableError(f"Local Ollama server is not reachable: {e}")
        _installed_cache.update(at=now, models=models)
        return models


def installed_ollama_models() -> set[str]:
    """Normalized names of models installed in the local Ollama server."""
    return set(installed_ollama_details())


def loaded_ollama_models() -> dict[str, dict]:
    """Models currently loaded in memory (live, not cached), with real VRAM use."""
    resp = requests.get(f"{settings.ollama_host}/api/ps", timeout=5)
    resp.raise_for_status()
    return {
        _normalize(m["name"]): {"size_bytes": m.get("size"), "vram_bytes": m.get("size_vram"), "expires_at": m.get("expires_at")}
        for m in resp.json().get("models", [])
    }


def ollama_model_capabilities(model_name: str) -> set[str] | None:
    """
    What the model can do according to Ollama itself, e.g. {"completion", "vision"}
    or {"embedding"}. None if this Ollama version doesn't report capabilities.
    """
    resp = requests.post(f"{settings.ollama_host}/api/show", json={"model": model_name}, timeout=10)
    resp.raise_for_status()
    caps = resp.json().get("capabilities")
    return set(caps) if isinstance(caps, list) else None


def registrable_problem(model_name: str, capability: str) -> str | None:
    """
    Why this model can't serve this capability, or None if it can.
    Embedding-only models can't answer chat requests; vision needs image input.
    """
    try:
        caps = ollama_model_capabilities(model_name)
    except Exception:
        caps = None
    if caps is None:
        # Older Ollama: fall back to the naming convention for embedding models.
        return f"'{model_name}' looks like an embedding model and can't answer chat requests" if "embed" in model_name.lower() else None
    if "completion" not in caps:
        return f"'{model_name}' can't answer chat requests (Ollama reports: {', '.join(sorted(caps)) or 'no capabilities'})"
    if capability == "vision" and "vision" not in caps:
        return f"'{model_name}' has no image input, so it can't serve vision tasks"
    return None


def clear_installed_cache() -> None:
    with _installed_lock:
        _installed_cache.update(at=0.0, models=None)


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


def chat_with_stats(
    model_name: str,
    messages: list[dict],
    *,
    think: bool = False,
    timeout: int = 300,
    temperature: float = 0.2,
) -> tuple[str, dict]:
    """
    Single non-streaming chat call to the local Ollama server.
    Returns (answer, stats). Warns when the prompt filled the whole context
    window, because Ollama then silently drops the start of the prompt.
    """
    resp = requests.post(
        f"{settings.ollama_host}/api/chat",
        json={
            "model": model_name,
            "messages": messages,
            "stream": False,
            "think": think,  # qwen3: hidden reasoning only where it helps
            "keep_alive": LLM_KEEP_ALIVE,
            "options": {"temperature": temperature, "num_ctx": LLM_NUM_CTX},
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    data = resp.json()
    stats = {
        "prompt_tokens": data.get("prompt_eval_count"),
        "output_tokens": data.get("eval_count"),
        "num_ctx": LLM_NUM_CTX,
        "truncated": (data.get("prompt_eval_count") or 0) >= LLM_NUM_CTX - 8,
    }
    if stats["truncated"]:
        logger.warning("Prompt filled the %s-token context of %s; its start was likely truncated",
                       LLM_NUM_CTX, model_name)
    return data.get("message", {}).get("content", ""), stats


def chat(model_name: str, messages: list[dict], timeout: int = 180, temperature: float = 0.2) -> str:
    """Single non-streaming chat call (thinking off). See chat_with_stats()."""
    answer, _ = chat_with_stats(model_name, messages, think=False, timeout=timeout, temperature=temperature)
    return answer


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