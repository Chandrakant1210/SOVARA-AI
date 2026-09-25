import json
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from app.agent.graph import build_agent_graph
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter()

# Built once at module load — compiling the graph is cheap, but this
# avoids rebuilding it on every request.
_agent = build_agent_graph()


class AgentRunRequest(BaseModel):
    user_input: str
    document_text: Optional[str] = None


class AgentRunResponse(BaseModel):
    final_output: str
    docx_path: str
    steps_completed: list[str]


@router.post("/agent/run", response_model=AgentRunResponse)
def run_agent(
    request: AgentRunRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Runs the full agent graph and returns the final result in one response.
    Kept for scripted/programmatic use (e.g. testing) where step-by-step
    progress isn't needed. The frontend should use /agent/run/stream instead.
    """
    if not request.user_input.strip():
        raise HTTPException(status_code=400, detail="user_input cannot be empty")

    try:
        result = _agent.invoke({
            "user_input": request.user_input,
            "document_text": request.document_text,
            "steps_completed": [],
        })
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Agent execution failed: {str(e)}")

    return AgentRunResponse(
        final_output=result["final_output"],
        docx_path=result["docx_path"],
        steps_completed=result["steps_completed"],
    )


def _stream_agent_events(user_input: str, document_text: Optional[str]):
    """
    Runs the agent graph via LangGraph's .stream(), yielding a Server-Sent
    Event after each node completes. This is what replaces the fake
    setInterval animation on the frontend's agent tracker with real,
    live progress.
    """
    initial_state = {
        "user_input": user_input,
        "document_text": document_text,
        "steps_completed": [],
    }

    try:
        for step_output in _agent.stream(initial_state):
            # step_output is a dict like {"understand": {...state updates...}}
            for node_name, node_state in step_output.items():
                event = {
                    "type": "step_complete",
                    "node": node_name,
                    "steps_completed": node_state.get("steps_completed", []),
                }
                yield f"data: {json.dumps(event)}\n\n"

                # On the final node, also send the finished deliverable.
                if node_name == "generate":
                    final_event = {
                        "type": "done",
                        "final_output": node_state.get("final_output"),
                        "docx_path": node_state.get("docx_path"),
                        "citations": node_state.get("citations", []),
                    }
                    yield f"data: {json.dumps(final_event)}\n\n"

    except Exception as e:
        error_event = {"type": "error", "detail": str(e)}
        yield f"data: {json.dumps(error_event)}\n\n"


@router.post("/agent/run/stream")
def run_agent_stream(
    request: AgentRunRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Same as /agent/run, but streams a Server-Sent Event after each node
    completes, so the frontend can show real live progress instead of
    a fake timed animation.
    """
    if not request.user_input.strip():
        raise HTTPException(status_code=400, detail="user_input cannot be empty")

    return StreamingResponse(
        _stream_agent_events(request.user_input, request.document_text),
        media_type="text/event-stream",
    )