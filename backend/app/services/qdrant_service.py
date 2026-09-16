from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import uuid

COLLECTION_NAME = "sop_documents"
VECTOR_SIZE = 768  # nomic-embed-text output dimension

client = QdrantClient(host="localhost", port=6333)


def ensure_collection():
    """Creates the Qdrant collection if it doesn't already exist."""
    collections = client.get_collections().collections
    existing_names = [c.name for c in collections]

    if COLLECTION_NAME not in existing_names:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )


def upsert_chunks(chunks: list[str], embeddings: list[list[float]], source_filename: str):
    """Stores chunks and their embeddings in Qdrant, tagged with source metadata."""
    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={"text": chunk, "source": source_filename, "chunk_index": i},
        )
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
    ]
    client.upsert(collection_name=COLLECTION_NAME, points=points)


def search(query_embedding: list[float], top_k: int = 3):
    """Returns the top-k most similar chunks to the query embedding."""
    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_embedding,
        limit=top_k,
    )
    return results.points
    return results