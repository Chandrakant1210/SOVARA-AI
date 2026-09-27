import hashlib
import logging
import re
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User, UserRole
from app.services.audit_service import record as _audit
from app.services.model_router import ModelUnavailableError, chat, resolve_model
from app.services.sandbox_service import (
    MAX_CODE_CHARS,
    SandboxBusyError,
    SandboxUnavailableError,
    get_sandbox_info,
    run_code_in_sandbox,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Running code is a privileged action; employees can view but not execute.
SANDBOX_ROLES = {UserRole.ADMIN, UserRole.MANAGER, UserRole.ENGINEER}

MAX_PROMPT_CHARS = 2_000

GENERATE_SYSTEM_PROMPT = (
    "You are the code generator inside SOVARA, an air-gapped industrial AI workbench. "
    "Write ONE self-contained Python 3.11 file for the user's task. "
    "Rules: use only the Python standard library; no network access; no file writes "
    "except under /tmp; no input() calls. Include pytest-style test functions named "
    "test_* that check the behaviour with plain assert statements. "
    "Reply with exactly one ```python code block and nothing else."
)

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_CODE_BLOCK_RE = re.compile(r"```(?:python|py)?\s*\n(.*?)```", re.DOTALL | re.IGNORECASE)


class SandboxRunRequest(BaseModel):
    code: str = Field(..., max_length=MAX_CODE_CHARS)


class SandboxRunResponse(BaseModel):
    run_id: str
    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool
    duration_ms: int
    output_truncated: bool
    runner: str  # "pytest" or "python"
    test_summary: str | None  # e.g. "2 passed", only for pytest runs


class GenerateRequest(BaseModel):
    prompt: str = Field(..., max_length=MAX_PROMPT_CHARS)


class GenerateResponse(BaseModel):
    code: str
    filename: str
    model_id: str
    model_name: str
    capability_requested: str
    capability_served: str
    reason: str
    duration_ms: int


def _extract_code(text: str) -> str:
    text = _THINK_RE.sub("", text).strip()
    blocks = _CODE_BLOCK_RE.findall(text)
    return (max(blocks, key=len) if blocks else text).strip()


@router.get("/sandbox/info")
def sandbox_info(current_user: User = Depends(get_current_user)):
    """Real sandbox limits and availability, plus whether this user may run code."""
    info = get_sandbox_info()
    info["can_run"] = current_user.role in SANDBOX_ROLES
    return info


# Plain `def`: the Docker calls block, so FastAPI runs this in its thread pool.
@router.post("/sandbox/run", response_model=SandboxRunResponse)
def run_sandbox(
    request: SandboxRunRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in SANDBOX_ROLES:
        raise HTTPException(status_code=403, detail="Your role is not allowed to run code in the sandbox")
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="code cannot be empty")

    user_id = current_user.id
    code_sha256 = hashlib.sha256(request.code.encode("utf-8")).hexdigest()

    # Fail closed: if the run can't be audited, it doesn't happen.
    # The hash (not the code) is stored, so confidential scripts aren't
    # duplicated into the audit table but the exact code can still be proven.
    try:
        _audit(db, user_id, "sandbox.run", {"summary": "Ran code in sandbox", "tool": "sandbox",
                                            "code_sha256": code_sha256, "code_chars": len(request.code)})
    except Exception:
        db.rollback()
        logger.exception("Audit write failed; refusing sandbox run")
        raise HTTPException(status_code=503, detail="Audit log unavailable; code was not run")

    # Release the DB connection while the container runs (up to the timeout).
    db.close()

    try:
        result = run_code_in_sandbox(request.code)
    except SandboxBusyError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except SandboxUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Sandbox execution failed")
        raise HTTPException(status_code=502, detail=f"Sandbox execution failed: {str(e)}")

    try:
        _audit(db, user_id, "sandbox.result", {
            "summary": "Sandbox result", "tool": "sandbox",
            "result": "timed out" if result["timed_out"] else (result["test_summary"] or f"exit {result['exit_code']}"),
            "run_id": result["run_id"],
            "code_sha256": code_sha256,
            "exit_code": result["exit_code"],
            "timed_out": result["timed_out"],
            "duration_ms": result["duration_ms"],
            "runner": result["runner"],
            "test_summary": result["test_summary"],
        })
    except Exception:
        db.rollback()
        logger.exception("Audit write failed for sandbox result %s", result["run_id"])

    return SandboxRunResponse(**result)


@router.post("/sandbox/generate", response_model=GenerateResponse)
def generate_code(
    request: GenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generates code with the routed local model. It is NOT executed here."""
    if current_user.role not in SANDBOX_ROLES:
        raise HTTPException(status_code=403, detail="Your role is not allowed to generate code")
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt cannot be empty")

    try:
        route = resolve_model("coding")
    except ModelUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    model = route["model"]

    user_id = current_user.id
    prompt_sha256 = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    try:
        _audit(db, user_id, "sandbox.generate", {
            "summary": "Generated code", "tool": model["model_name"],
            "prompt_sha256": prompt_sha256, "prompt_chars": len(prompt),
            "model": model["model_name"], "capability_served": route["capability_served"],
        })
    except Exception:
        db.rollback()
        logger.exception("Audit write failed; refusing code generation")
        raise HTTPException(status_code=503, detail="Audit log unavailable; code was not generated")

    # Release the DB connection during the (slow) model call.
    db.close()

    started = time.monotonic()
    try:
        raw = chat(model["model_name"], [
            {"role": "system", "content": GENERATE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ])
    except Exception as e:
        logger.exception("Code generation failed")
        raise HTTPException(status_code=502, detail=f"Local model call failed: {str(e)}")
    duration_ms = int((time.monotonic() - started) * 1000)

    code = _extract_code(raw)
    if not code:
        raise HTTPException(status_code=502, detail="The model returned no code")
    if len(code) > MAX_CODE_CHARS:
        raise HTTPException(status_code=502, detail="Generated code exceeds the sandbox size limit")

    try:
        _audit(db, user_id, "sandbox.generate.result", {
            "summary": "Generated code", "tool": model["model_name"], "result": "success",
            "prompt_sha256": prompt_sha256, "model": model["model_name"],
            "code_sha256": hashlib.sha256(code.encode("utf-8")).hexdigest(),
            "code_chars": len(code), "duration_ms": duration_ms,
        })
    except Exception:
        db.rollback()
        logger.exception("Audit write failed for code generation result")

    return GenerateResponse(
        code=code,
        filename="generated.py",
        model_id=model["id"],
        model_name=model["model_name"],
        capability_requested=route["capability_requested"],
        capability_served=route["capability_served"],
        reason=route["reason"],
        duration_ms=duration_ms,
    )