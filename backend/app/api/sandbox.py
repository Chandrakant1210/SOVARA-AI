from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.services.sandbox_service import run_code_in_sandbox
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter()


class SandboxRunRequest(BaseModel):
    code: str


class SandboxRunResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool


@router.post("/sandbox/run", response_model=SandboxRunResponse)
def run_sandbox(
    request: SandboxRunRequest,
    current_user: User = Depends(get_current_user),
):
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="code cannot be empty")

    try:
        result = run_code_in_sandbox(request.code)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Sandbox execution failed: {str(e)}")

    return SandboxRunResponse(**result)
    