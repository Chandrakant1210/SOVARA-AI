from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.services.embedding_service import get_embedding
from app.services.qdrant_service import search
from app.core.deps import get_current_user
from app.models.user import User, UserRole

router = APIRouter()

# Same rule as documents: managers and admins may read every document.
PRIVILEGED_ROLES = {UserRole.ADMIN, UserRole.MANAGER}


class RetrieveRequest(BaseModel):
    query: str = Field(..., max_length=2000)
    top_k: int = Field(default=3, gt=0, le=20)


class RetrievedChunk(BaseModel):
    text: str
    source: str
    score: float
    visibility: str | None = None


class RetrieveResponse(BaseModel):
    query: str
    results: list[RetrievedChunk]


@router.post("/retrieve", response_model=RetrieveResponse)
def retrieve(
    request: RetrieveRequest,
    current_user: User = Depends(get_current_user),
):
    """Semantic search over the chunks this user is allowed to read."""
    try:
        query_embedding = get_embedding(request.query)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Embedding generation failed: {str(e)}")

    try:
        raw_results = search(
            query_embedding,
            top_k=request.top_k,
            user_id=str(current_user.id),
            privileged=current_user.role in PRIVILEGED_ROLES,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Vector search failed: {str(e)}")

    results = [
        RetrievedChunk(
            text=r.payload["text"],
            source=r.payload["source"],
            score=r.score,
            visibility=r.payload.get("visibility"),
        )
        for r in raw_results
    ]

    return RetrieveResponse(query=request.query, results=results)