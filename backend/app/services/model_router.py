import requests
from app.core.config import settings


def generate_response(prompt: str) -> str:
    """
    Sends a prompt to the locally running Ollama model and returns the response.
    This is a stub — will be replaced by the full model router in a later sprint.
    """
    response = requests.post(
        f"{settings.ollama_host}/api/generate",
        json={
            "model": settings.ollama_model,
            "prompt": prompt,
            "stream": False,
        },
        timeout=120,
    )
    response.raise_for_status()
    data = response.json()
    return data.get("response", "")