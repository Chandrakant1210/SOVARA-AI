import ollama
from app.core.config import settings


def get_embedding(text: str) -> list[float]:
    """
    Generates a vector embedding for the given text using the local
    nomic-embed-text model via Ollama.
    """
    response = ollama.embeddings(model="nomic-embed-text", prompt=text)
    return response["embedding"]