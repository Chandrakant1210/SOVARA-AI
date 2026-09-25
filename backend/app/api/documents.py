import os
import shutil
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from pydantic import BaseModel
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.services.ocr_service import extract_text_from_pdf, extract_text_with_fallback
from app.services.embedding_service import get_embedding
from app.services.qdrant_service import ensure_collection, upsert_chunks
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".pdf"}

_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)


class UploadResponse(BaseModel):
    filename: str
    extracted_text: str
    indexed_chunks: int


def _index_text(text: str, source_filename: str) -> int:
    """
    Chunks the extracted text, embeds each chunk, and stores it in
    Qdrant so the agent's retrieval can find it in future queries.
    Returns the number of chunks indexed (0 if there was nothing
    meaningful to index).
    """
    if not text or not text.strip():
        return 0

    chunks = _splitter.split_text(text)
    if not chunks:
        return 0

    ensure_collection()
    embeddings = [get_embedding(chunk) for chunk in chunks]
    upsert_chunks(chunks, embeddings, source_filename=source_filename)
    return len(chunks)


@router.post("/documents/upload", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    ext = os.path.splitext(file.filename)[1].lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    try:
        if ext == ".pdf":
            extracted_text = extract_text_from_pdf(file_path)
        else:
            extracted_text = extract_text_with_fallback(file_path)
    except Exception as e:
        # Clean up the orphaned file before returning the error —
        # otherwise every failed OCR/vision request leaves a dead file on disk.
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Document processing failed: {str(e)}")

    # Index into Qdrant so the agent can retrieve this document's content
    # in future queries. Indexing failure doesn't fail the whole upload —
    # the user still gets their extracted text either way, just a note
    # that it wasn't searchable.
    try:
        indexed_chunks = _index_text(extracted_text, source_filename=file.filename)
    except Exception:
        indexed_chunks = 0

    return UploadResponse(
        filename=file.filename,
        extracted_text=extracted_text,
        indexed_chunks=indexed_chunks,
    )