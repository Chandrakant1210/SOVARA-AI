import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config.model_registry import REGISTRABLE_CAPABILITIES, list_models, register_model, reload_registry
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole
from app.services.model_router import (
    CAPABILITY_LABELS,
    ModelUnavailableError,
    _normalize,
    clear_installed_cache,
    installed_ollama_details,
    loaded_ollama_models,
    registrable_problem,
    resolve_model,
)

logger = logging.getLogger(__name__)

router = APIRouter()

MANAGE_ROLES = {UserRole.ADMIN, UserRole.MANAGER}
REGISTER_ROLES = {UserRole.ADMIN}


class RegisterRequest(BaseModel):
    model_name: str = Field(..., min_length=1, max_length=200)
    capability: str
    description: str = Field("", max_length=200)


def _audit(db: Session, user_id, action: str, details: dict) -> None:
    db.add(AuditLog(user_id=user_id, action=action, details=json.dumps(details)))
    db.commit()


@router.get("/models/registry")
def get_registry(current_user: User = Depends(get_current_user)):
    """Registered models with live Ollama status, current routing, and unregistered installed models."""
    try:
        installed = installed_ollama_details()
        ollama_reachable, ollama_error = True, None
    except ModelUnavailableError as e:
        installed, ollama_reachable, ollama_error = {}, False, str(e)
    try:
        loaded = loaded_ollama_models() if ollama_reachable else {}
    except Exception:
        loaded = {}

    routing = []
    for capability, label in CAPABILITY_LABELS.items():
        row = {"capability": capability, "label": label, "model_name": None, "model_id": None,
               "capability_served": None, "fallback": False, "reason": None}
        try:
            r = resolve_model(capability)
            row.update(model_name=r["model"]["model_name"], model_id=r["model"]["id"],
                       capability_served=r["capability_served"],
                       fallback=r["capability_served"] != capability, reason=r["reason"])
        except ModelUnavailableError as e:
            row["reason"] = str(e)
        routing.append(row)

    registered_names = set()
    models = []
    for model_id, cfg in list_models().items():
        key = _normalize(str(cfg.get("model_name", "")))
        registered_names.add(key)
        info, live = installed.get(key), loaded.get(key)
        if not cfg.get("available"):
            status = "disabled"
        elif not info:
            status = "not_installed"
        elif live:
            status = "loaded"
        else:
            status = "installed"
        models.append({
            "id": model_id,
            "model_name": cfg.get("model_name"),
            "capability": cfg.get("capability"),
            "description": cfg.get("description"),
            "context_length": cfg.get("context_length"),
            "status": status,
            "parameter_size": info.get("parameter_size") if info else None,
            "quantization": info.get("quantization") if info else None,
            "size_bytes": info.get("size_bytes") if info else None,
            "vram_bytes": live.get("vram_bytes") if live else None,
            "serves": [r["capability"] for r in routing if r["model_id"] == model_id],
        })

    unregistered = []
    for key, info in installed.items():
        if key in registered_names:
            continue
        # A model that can't chat (e.g. an embedding model) can't serve any routed task.
        problem = registrable_problem(info["name"], "reasoning")
        unregistered.append({
            "model_name": info["name"], "parameter_size": info.get("parameter_size"),
            "quantization": info.get("quantization"), "size_bytes": info.get("size_bytes"),
            "family": info.get("family"), "registrable": problem is None, "note": problem,
        })

    return {
        "ollama_reachable": ollama_reachable,
        "ollama_error": ollama_error,
        "models": models,
        "routing": routing,
        "unregistered_installed": unregistered,
        "registrable_capabilities": list(REGISTRABLE_CAPABILITIES),
        "can_manage": current_user.role in MANAGE_ROLES,
        "can_register": current_user.role in REGISTER_ROLES,
    }


@router.post("/models/reload")
def reload(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Re-reads models.yaml and Ollama's installed models."""
    if current_user.role not in MANAGE_ROLES:
        raise HTTPException(status_code=403, detail="Only managers and admins can reload the registry")
    reload_registry()
    clear_installed_cache()
    try:
        _audit(db, current_user.id, "registry.reload", {"models": len(list_models())})
    except Exception:
        db.rollback()
        logger.exception("Audit write failed for registry reload")
    return {"reloaded": True, "models": len(list_models())}


@router.post("/models/register")
def register(request: RegisterRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Registers a model that is already installed in the local Ollama server.
    Nothing is downloaded: on an air-gapped server, models are loaded offline.
    """
    if current_user.role not in REGISTER_ROLES:
        raise HTTPException(status_code=403, detail="Only admins can register models")
    if request.capability not in REGISTRABLE_CAPABILITIES:
        raise HTTPException(status_code=422, detail=f"capability must be one of {', '.join(REGISTRABLE_CAPABILITIES)}")

    clear_installed_cache()
    try:
        installed = installed_ollama_details()
    except ModelUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    info = installed.get(_normalize(request.model_name))
    if not info:
        raise HTTPException(status_code=400, detail=f"'{request.model_name}' is not installed in the local Ollama server")
    problem = registrable_problem(info["name"], request.capability)
    if problem:
        raise HTTPException(status_code=400, detail=problem)

    try:
        _audit(db, current_user.id, "registry.register", {"model_name": info["name"], "capability": request.capability})
    except Exception:
        db.rollback()
        logger.exception("Audit write failed; refusing registry change")
        raise HTTPException(status_code=503, detail="Audit log unavailable; registry was not changed")

    try:
        model_id = register_model(info["name"], request.capability, request.description.strip())
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        logger.exception("Registry write failed")
        raise HTTPException(status_code=500, detail=f"Registry write failed: {str(e)}")

    return {"registered": True, "id": model_id, "model_name": info["name"], "capability": request.capability}