from fastapi import FastAPI
from app.api.chat import router as chat_router

app = FastAPI(title="SOVARA AI Backend", version="0.1.0")

app.include_router(chat_router, prefix="/api")


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "sovara-backend"}