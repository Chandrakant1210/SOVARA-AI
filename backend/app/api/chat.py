from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.services.model_router import generate_response
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter()


class ChatRequest(BaseModel):
    prompt: str


class ChatResponse(BaseModel):
    response: str


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest, current_user: User = Depends(get_current_user)):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    try:
        result = generate_response(request.prompt)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Model inference failed: {str(e)}")

    return ChatResponse(response=result)