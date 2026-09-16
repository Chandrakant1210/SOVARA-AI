from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.services.embedding_service import get_embedding
from app.services.qdrant_service import search
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter()


class RetrieveRequest(BaseModel):
    query: str
    top_k: int = 3


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
    query_embedding = get_embedding(request.query)
    raw_results = search(query_embedding, top_k=request.top_k)

    results = [
        RetrievedChunk(
            text=r.payload["text"],
            source=r.payload["source"],
            score=r.score,
        )
        for r in raw_results
    ]

    return RetrieveResponse(query=request.query, results=results)