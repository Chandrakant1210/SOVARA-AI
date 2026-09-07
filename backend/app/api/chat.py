from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.model_router import generate_response

router = APIRouter()


class ChatRequest(BaseModel):
    prompt: str


class ChatResponse(BaseModel):
    response: str


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    try:
        result = generate_response(request.prompt)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Model inference failed: {str(e)}")

    return ChatResponse(response=result)