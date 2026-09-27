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
from app.services.audit_service import record as _audit, record_standalone
from app.services.embedding_service import get_embedding
from app.services.model_router import ModelUnavailableError, chat, resolve_model
from app.services.qdrant_service import search
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

# Managers and admins may retrieve every document; others shared SOPs + their own.
PRIVILEGED_ROLES = {UserRole.ADMIN, UserRole.MANAGER}

MAX_ATTEMPTS = 3            # first try + up to 2 repairs
REFERENCE_CHUNKS = 3
MAX_CHUNK_CHARS = 800
MAX_FEEDBACK_CHARS = 3000   # pytest output sent back to the model per repair

GENERATE_SYSTEM_PROMPT = (
    "You are the code generator inside SOVARA, an air-gapped industrial AI workbench. "
    "Write ONE self-contained Python 3.11 file for the user's task. Rules:\n"
    "- Use only the Python standard library; no network access; no file writes except under /tmp; no input().\n"
    "- Include pytest-style test functions named test_* with plain assert statements. "
    "Compute every expected value in the tests by hand from the same formula the code uses.\n"
    "- NEVER call the test functions yourself (no calls at module level, no __main__ block): pytest runs them.\n"
    "- If REFERENCE MATERIAL is provided and contains the relevant formula or limit, use it exactly and name "
    "its source in a comment.\n"
    "- If it does not contain the formula, do not invent safety factors or constants: state every assumption "
    "in a comment starting with '# ASSUMPTION:' at the top of the file.\n"
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


class GenerateAttempt(BaseModel):
    attempt: int
    runner: str
    test_summary: str | None
    exit_code: int
    timed_out: bool
    passed: bool


class GenerateSource(BaseModel):
    source: str
    score: float


class GenerateResponse(BaseModel):
    code: str
    filename: str
    model_id: str
    model_name: str
    capability_requested: str
    capability_served: str
    reason: str
    duration_ms: int
    attempts: list[GenerateAttempt]
    verified: bool                  # the model's own tests passed in the sandbox
    run: SandboxRunResponse         # result of the final attempt
    sources: list[GenerateSource]   # reference chunks the model was given
    reference_note: str | None


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


def _reference_for(prompt: str, user: User) -> tuple[str, list[dict], str | None]:
    """Relevant chunks the user may read (access-filtered), formatted for the model."""
    try:
        points = search(get_embedding(prompt), top_k=REFERENCE_CHUNKS,
                        user_id=str(user.id), privileged=user.role in PRIVILEGED_ROLES)
    except Exception as e:
        logger.exception("Reference retrieval failed for code generation")
        return "", [], f"Reference retrieval failed ({type(e).__name__}); code was generated without reference material."
    if not points:
        return "", [], "No reference material found; the model was told to mark assumptions."
    blocks = [f"[{i}] source: {p.payload.get('source')}\n{p.payload.get('text', '')[:MAX_CHUNK_CHARS]}"
              for i, p in enumerate(points, 1)]
    sources = [{"source": p.payload.get("source") or "unknown", "score": round(p.score, 3)} for p in points]
    text = "REFERENCE MATERIAL from SOVARA's private knowledge base:\n\n" + "\n\n".join(blocks)
    return text, sources, None


def _repair_message(run: dict) -> str:
    output = (run["stdout"] + ("\n" + run["stderr"] if run["stderr"] else ""))[-MAX_FEEDBACK_CHARS:]
    if run["runner"] != "pytest":
        problem = "The file has no test_* functions, so nothing was verified."
    elif run["timed_out"]:
        problem = "The run timed out."
    else:
        problem = f"pytest reported: {run['test_summary'] or 'exit code ' + str(run['exit_code'])}."
    return (
        f"Your code was run with pytest in the isolated sandbox. {problem}\n\n"
        f"Sandbox output (end):\n{output}\n\n"
        "Fix the code and/or the tests so they are correct and consistent. Keep all the rules: "
        "never call test functions yourself, compute expected values from the same formula, "
        "mark assumptions with '# ASSUMPTION:'. Reply with the complete corrected file in one ```python block."
    )


@router.post("/sandbox/generate", response_model=GenerateResponse)
def generate_code(
    request: GenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generates code with the routed local model, grounded in access-filtered
    reference material, then runs it with pytest in the sandbox. If the tests
    fail, the output goes back to the model for a fix (up to MAX_ATTEMPTS).
    Every attempt is audited. `verified` only means the model's own tests pass.
    """
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

    reference, sources, reference_note = _reference_for(prompt, current_user)
    # Release the DB connection during the (slow) model calls and sandbox runs.
    db.close()

    user_content = f"{reference}\n\nTASK: {prompt}" if reference else f"TASK: {prompt}"
    messages = [{"role": "system", "content": GENERATE_SYSTEM_PROMPT}, {"role": "user", "content": user_content}]
    attempts: list[dict] = []
    started = time.monotonic()
    code, run = "", None

    for n in range(1, MAX_ATTEMPTS + 1):
        try:
            raw = chat(model["model_name"], messages)
        except Exception as e:
            logger.exception("Code generation failed")
            raise HTTPException(status_code=502, detail=f"Local model call failed: {str(e)}")
        code = _extract_code(raw)
        if not code:
            raise HTTPException(status_code=502, detail="The model returned no code")
        if len(code) > MAX_CODE_CHARS:
            raise HTTPException(status_code=502, detail="Generated code exceeds the sandbox size limit")

        try:
            run = run_code_in_sandbox(code)
        except SandboxBusyError as e:
            raise HTTPException(status_code=429, detail=str(e))
        except SandboxUnavailableError as e:
            raise HTTPException(status_code=503, detail=str(e))
        except Exception as e:
            logger.exception("Sandbox execution failed during generation")
            raise HTTPException(status_code=502, detail=f"Sandbox execution failed: {str(e)}")

        passed = run["runner"] == "pytest" and run["exit_code"] == 0 and not run["timed_out"]
        attempts.append({"attempt": n, "runner": run["runner"], "test_summary": run["test_summary"],
                         "exit_code": run["exit_code"], "timed_out": run["timed_out"], "passed": passed})
        record_standalone(user_id, "sandbox.result", {
            "summary": f"Ran generated code (attempt {n})", "tool": "sandbox",
            "result": "timed out" if run["timed_out"] else (run["test_summary"] or f"exit {run['exit_code']}"),
            "run_id": run["run_id"], "prompt_sha256": prompt_sha256,
            "code_sha256": hashlib.sha256(code.encode("utf-8")).hexdigest(),
            "exit_code": run["exit_code"], "duration_ms": run["duration_ms"], "attempt": n,
        })
        if passed:
            break
        messages += [{"role": "assistant", "content": f"```python\n{code}\n```"},
                     {"role": "user", "content": _repair_message(run)}]

    duration_ms = int((time.monotonic() - started) * 1000)
    verified = attempts[-1]["passed"]
    record_standalone(user_id, "sandbox.generate.result", {
        "summary": "Generated code", "tool": model["model_name"],
        "result": (f"verified after {len(attempts)} attempt(s)" if verified
                   else f"tests failing after {len(attempts)} attempts"),
        "prompt_sha256": prompt_sha256, "model": model["model_name"],
        "code_sha256": hashlib.sha256(code.encode("utf-8")).hexdigest(),
        "code_chars": len(code), "duration_ms": duration_ms, "attempts": len(attempts),
        "sources": [s["source"] for s in sources],
    })

    return GenerateResponse(
        code=code,
        filename="generated.py",
        model_id=model["id"],
        model_name=model["model_name"],
        capability_requested=route["capability_requested"],
        capability_served=route["capability_served"],
        reason=route["reason"],
        duration_ms=duration_ms,
        attempts=attempts,
        verified=verified,
        run=SandboxRunResponse(**run),
        sources=sources,
        reference_note=reference_note,
    )