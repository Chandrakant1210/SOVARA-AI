from fastapi import APIRouter, HTTPException, Depends
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
