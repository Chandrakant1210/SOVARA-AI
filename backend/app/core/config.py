from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "qwen3:8b"

    class Config:
        env_file = ".env"


settings = Settings()