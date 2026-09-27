import json
import logging
import os
import time
import uuid
from typing import Iterator, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agent.graph import build_agent_graph
from app.config.model_registry import get_model_for_capability
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.services.audit_service import record, record_standalone, sha256

logger = logging.getLogger(__name__)

router = APIRouter()

# Built once at module load — compiling the graph is cheap, but this
# avoids rebuilding it on every request.
_agent = build_agent_graph()

MAX_INPUT_CHARS = 4_000
MAX_DOCUMENT_CHARS = 200_000


class AgentRunRequest(BaseModel):
    user_input: str = Field(..., max_length=MAX_INPUT_CHARS)
    document_text: Optional[str] = Field(None, max_length=MAX_DOCUMENT_CHARS)


class AgentRunResponse(BaseModel):
    run_id: str
    final_output: str
    docx_path: str
    steps_completed: list[str]


def _reasoning_model_name() -> str:
    # The graph calls the registry's reasoning model; record the same name.
    try:
        return get_model_for_capability("reasoning")["model_name"]
    except ValueError:
        return "unavailable"


def _step_details(node: str, node_state: dict, model: str) -> dict:
    """What the Activity Log shows for one agent step: tool/model, detail, result."""
    if node == "retrieve":
        error = node_state.get("retrieval_error")
        if error:
            return {"tool": "Qdrant", "detail": f"retrieval failed: {error}", "result": "error"}
        return {"tool": "Qdrant", "detail": f"{len(node_state.get('citations') or [])} chunks", "result": "ok"}
    if node == "generate":
        path = node_state.get("docx_path")
        return {"tool": f"{model} + python-docx", "detail": os.path.basename(path) if path else "no file", "result": "ok"}
    return {"tool": model, "result": "ok"}


def _run_agent_audited(run_id: str, user_id, user_input: str, document_text: Optional[str]) -> Iterator[tuple[str, dict]]:
    """
    Runs the graph step by step, writing one audit event per completed node
    and a final result event (success / error / cancelled). Yields
    (node_name, node_state) so callers can stream or collect the result.
    """
    model = _reasoning_model_name()
    started = last = time.monotonic()
    outcome, error, docx_name, sources = "error", None, None, []
    initial_state = {"user_input": user_input, "document_text": document_text, "steps_completed": []}

    try:
        for step_output in _agent.stream(initial_state):
            for node, node_state in step_output.items():
                now = time.monotonic()
                details = _step_details(node, node_state, model)
                record_standalone(user_id, "agent.step", {
                    "run_id": run_id, "step": node, "summary": f"Agent step: {node}",
                    "duration_ms": int((now - last) * 1000), **details,
                })
                last = now
                if node == "generate":
                    docx_name = os.path.basename(node_state.get("docx_path") or "") or None
                    # Source names and scores only (no chunk text), so reviewers
                    # opening the note later see the same citations.
                    sources = [{"source": c.get("source"), "score": c.get("score")}
                               for c in (node_state.get("citations") or [])]
                yield node, node_state
        outcome = "success"
    except GeneratorExit:
        outcome = "cancelled"  # client disconnected mid-run
        raise
    except Exception as e:
        error = str(e)
        raise
    finally:
        record_standalone(user_id, "agent.run.result", {
            "run_id": run_id,
            "summary": f"Generated {docx_name}" if docx_name else "Agent run",
            "tool": model, "result": outcome, "error": error,
            "document": docx_name, "citations": len(sources), "sources": sources,
            "duration_ms": int((time.monotonic() - started) * 1000),
        })


def _start_run(db: Session, user: User, request: AgentRunRequest) -> str:
    """Validates input and writes the fail-closed start event. Returns the run id."""
    if not request.user_input.strip():
        raise HTTPException(status_code=400, detail="user_input cannot be empty")
    run_id = str(uuid.uuid4())
    try:
        record(db, user.id, "agent.run.start", {
            "run_id": run_id, "summary": "Started agent run", "tool": _reasoning_model_name(),
            "input_sha256": sha256(request.user_input), "input_chars": len(request.user_input),
            "has_document": bool(request.document_text),
        })
    except Exception:
        db.rollback()
        logger.exception("Audit write failed; refusing agent run")
        raise HTTPException(status_code=503, detail="Audit log unavailable; the agent was not run")
    return run_id


@router.post("/agent/run", response_model=AgentRunResponse)
def run_agent(
    request: AgentRunRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Runs the full agent graph and returns the final result in one response.
    Kept for scripted/programmatic use (e.g. testing) where step-by-step
    progress isn't needed. The frontend should use /agent/run/stream instead.
    """
    run_id = _start_run(db, current_user, request)
    user_id = current_user.id
    db.close()  # the run can take minutes; don't hold a DB connection

    final_state: dict = {}
    try:
        for _, node_state in _run_agent_audited(run_id, user_id, request.user_input, request.document_text):
            final_state.update(node_state)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Agent execution failed: {str(e)}")

    return AgentRunResponse(
        run_id=run_id,
        final_output=final_state["final_output"],
        docx_path=final_state["docx_path"],
        steps_completed=final_state["steps_completed"],
    )


def _stream_agent_events(run_id: str, user_id, user_input: str, document_text: Optional[str]):
    """
    Streams a Server-Sent Event after each node completes. Every event
    carries the run_id so the UI can link the run to its audit trace.
    Audit writes use their own sessions: the request's session is already
    closed by the time this generator runs.
    """
    try:
        for node_name, node_state in _run_agent_audited(run_id, user_id, user_input, document_text):
            event = {
                "type": "step_complete",
                "run_id": run_id,
                "node": node_name,
                "steps_completed": node_state.get("steps_completed", []),
            }
            yield f"data: {json.dumps(event)}\n\n"

            # On the final node, also send the finished deliverable.
            if node_name == "generate":
                final_event = {
                    "type": "done",
                    "run_id": run_id,
                    "final_output": node_state.get("final_output"),
                    "docx_path": node_state.get("docx_path"),
                    "citations": node_state.get("citations", []),
                }
                yield f"data: {json.dumps(final_event)}\n\n"

    except Exception as e:
        error_event = {"type": "error", "run_id": run_id, "detail": str(e)}
        yield f"data: {json.dumps(error_event)}\n\n"


@router.post("/agent/run/stream")
def run_agent_stream(
    request: AgentRunRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Same as /agent/run, but streams a Server-Sent Event after each node
    completes, so the frontend can show real live progress instead of
    a fake timed animation.
    """
    run_id = _start_run(db, current_user, request)
    user_id = current_user.id
    db.close()

    return StreamingResponse(
        _stream_agent_events(run_id, user_id, request.user_input, request.document_text),
        media_type="text/event-stream",
    )