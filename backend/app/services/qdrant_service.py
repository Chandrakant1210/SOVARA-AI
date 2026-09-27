"""
SOVARA AI - Qdrant vector store with access control.

Every chunk carries who may read it:
  visibility  "shared"  - reference material everyone may retrieve (e.g. SOPs)
              "private" - only the owner, managers and admins
  owner_id    user who uploaded the document (private chunks)
  document_id the Document row the chunk came from
Searches are filtered INSIDE Qdrant, so chunks a user may not read are never
returned to the backend at all. Chunks without these fields (indexed before
access control) are treated as restricted: only managers and admins see them.
"""

import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    FilterSelector,
    MatchValue,
    PayloadSchemaType,
    PointStruct,
    VectorParams,
)

COLLECTION_NAME = "sop_documents"
VECTOR_SIZE = 768  # nomic-embed-text output dimension

SHARED = "shared"
PRIVATE = "private"

client = QdrantClient(host="localhost", port=6333)


def ensure_collection():
    """Creates the collection (and indexes on the access fields) if missing."""
    existing_names = [c.name for c in client.get_collections().collections]
    if COLLECTION_NAME not in existing_names:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )
    for field in ("visibility", "owner_id", "document_id", "source"):
        try:
            client.create_payload_index(COLLECTION_NAME, field_name=field, field_schema=PayloadSchemaType.KEYWORD)
        except Exception:
            pass  # index already exists


def upsert_chunks(
    chunks: list[str],
    embeddings: list[list[float]],
    source_filename: str,
    *,
    document_id: str | None = None,
    owner_id: str | None = None,
    visibility: str = PRIVATE,
):
    """
    Stores chunks with their access metadata. Defaults to private: a caller
    that forgets to say otherwise can't accidentally share a document.
    """
    if visibility not in (SHARED, PRIVATE):
        raise ValueError(f"visibility must be '{SHARED}' or '{PRIVATE}'")
    if visibility == PRIVATE and not owner_id:
        raise ValueError("private chunks need an owner_id")

    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={
                "text": chunk,
                "source": source_filename,
                "chunk_index": i,
                "document_id": document_id,
                "owner_id": owner_id,
                "visibility": visibility,
            },
        )
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
    ]
    client.upsert(collection_name=COLLECTION_NAME, points=points)


def access_filter(user_id: str, privileged: bool) -> Filter | None:
    """Managers/admins: no restriction. Everyone else: shared chunks plus their own."""
    if privileged:
        return None
    return Filter(should=[
        FieldCondition(key="visibility", match=MatchValue(value=SHARED)),
        FieldCondition(key="owner_id", match=MatchValue(value=str(user_id))),
    ])


# At most this many chunks per source document in one result set, so a document
# uploaded several times (or one very long document) can't crowd out the rest.
MAX_CHUNKS_PER_SOURCE = 2


def search(query_embedding: list[float], top_k: int = 3, *, user_id: str, privileged: bool,
           max_per_source: int = MAX_CHUNKS_PER_SOURCE):
    """
    Returns the top-k most similar chunks the user may read, with at most
    `max_per_source` chunks per source document (Qdrant groups by source, so
    duplicates can't crowd out other documents however many there are).
    `user_id` and `privileged` are required on purpose: a caller that doesn't
    say who is asking fails loudly instead of searching everything.
    """
    if not user_id:
        raise ValueError("search requires the requesting user's id")
    groups = client.query_points_groups(
        collection_name=COLLECTION_NAME,
        query=query_embedding,
        query_filter=access_filter(user_id, privileged),
        group_by="source",
        limit=top_k,                 # up to top_k different documents...
        group_size=max_per_source,   # ...each contributing its best chunks
    ).groups

    points, seen_text = [], set()
    for point in sorted((p for g in groups for p in g.hits), key=lambda p: p.score, reverse=True):
        text = point.payload.get("text", "")
        if text in seen_text:
            continue  # identical chunk from a re-uploaded copy
        seen_text.add(text)
        points.append(point)
    return points[:top_k]


def delete_by_source(source_filename: str, visibility: str) -> None:
    """Removes a document's chunks (used to re-ingest without duplicates)."""
    client.delete(
        collection_name=COLLECTION_NAME,
        points_selector=FilterSelector(filter=Filter(must=[
            FieldCondition(key="source", match=MatchValue(value=source_filename)),
            FieldCondition(key="visibility", match=MatchValue(value=visibility)),
        ])),
    )


def recreate_collection() -> None:
    """Drops and recreates the collection (operator re-index only)."""
    if COLLECTION_NAME in [c.name for c in client.get_collections().collections]:
        client.delete_collection(COLLECTION_NAME)
    ensure_collection()