from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Locate the .env file at the repo root, regardless of the current working directory.
ENV_PATH = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "qwen3:8b"
    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    model_config = SettingsConfigDict(env_file=str(ENV_PATH), extra="ignore")


settings = Settings()