from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.services.embedding_service import get_embedding
from app.services.qdrant_service import search
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter()


class RetrieveRequest(BaseModel):
    query: str
    top_k: int = Field(default=3, gt=0, le=20)


class RetrievedChunk(BaseModel):
    text: str
    source: str
    score: float


class RetrieveResponse(BaseModel):
    query: str
    results: list[RetrievedChunk]


@router.post("/retrieve", response_model=RetrieveResponse)
def retrieve(
    request: RetrieveRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        query_embedding = get_embedding(request.query)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Embedding generation failed: {str(e)}")

    try:
        raw_results = search(query_embedding, top_k=request.top_k)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Vector search failed: {str(e)}")

    results = [
        RetrievedChunk(
            text=r.payload["text"],
            source=r.payload["source"],
            score=r.score,
        )
        for r in raw_results
    ]

    return RetrieveResponse(query=request.query, results=results)