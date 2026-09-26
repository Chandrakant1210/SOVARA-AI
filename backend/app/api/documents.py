import os
import base64
import shutil
import uuid
import logging
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Path
from pydantic import BaseModel
from sqlalchemy.orm import Session
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.services.ocr_service import (
    extract_text_from_pdf,
    extract_text_with_fallback,
    analyze_page,
)
from app.services.embedding_service import get_embedding
from app.services.qdrant_service import ensure_collection, upsert_chunks
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User, UserRole
from app.models.document import Document

logger = logging.getLogger(__name__)

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
UPLOAD_ROOT = os.path.realpath(UPLOAD_DIR)

# Roles allowed to see every document; everyone else sees only their own.
PRIVILEGED_ROLES = {UserRole.ADMIN, UserRole.MANAGER}

# OCR lines below this PaddleOCR confidence are flagged for human review.
LOW_CONFIDENCE_THRESHOLD = 0.85

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".pdf"}

_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)


class UploadResponse(BaseModel):
    document_id: str
    filename: str
    extracted_text: str
    indexed_chunks: int


class DocumentSummary(BaseModel):
    id: str
    filename: str
    created_at: datetime | None
    uploaded_by: str | None


class OcrLine(BaseModel):
    text: str
    confidence: float
    bbox: list[float]  # [x0, y0, x1, y1], normalized 0-1


class PageAnalysisResponse(BaseModel):
    document_id: str
    filename: str
    page_index: int
    page_count: int
    width: int
    height: int
    ocr_engine: str
    low_confidence_threshold: float
    lines: list[OcrLine]
    image_base64: str  # PNG; sent inline because <img src> can't carry the JWT


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


def _remove_file(file_path: str) -> None:
    if os.path.exists(file_path):
        os.remove(file_path)


def _can_access(document: Document, user: User) -> bool:
    if user.role in PRIVILEGED_ROLES:
        return True
    return document.uploaded_by is not None and str(document.uploaded_by) == str(user.id)


def _get_accessible_document(document_id: uuid.UUID, user: User, db: Session) -> Document:
    """
    Returns the document if it exists AND the user may see it.
    Both cases fail with the same 404, so the API never confirms that a
    confidential document the user can't access exists.
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if document is None or not _can_access(document, user):
        raise HTTPException(status_code=404, detail="Document not found")
    return document


def _resolve_upload_path(stored_path: str) -> str:
    """
    Maps a stored file_path to a real file inside UPLOAD_ROOT.
    Only the bare filename is kept, so a stored path can never point
    outside the uploads folder, and Windows-style backslashes stored on
    a dev machine still resolve on Linux.
    """
    name = stored_path.replace("\\", "/").rsplit("/", 1)[-1]
    full = os.path.realpath(os.path.join(UPLOAD_ROOT, name))
    if os.path.dirname(full) != UPLOAD_ROOT or not os.path.isfile(full):
        raise HTTPException(status_code=404, detail="File for this document is missing on the server")
    return full


# Plain `def` (not `async def`): OCR, embedding and DB calls here are all
# blocking. FastAPI runs sync endpoints in a thread pool, so a long OCR job
# no longer freezes other requests (agent streams, Security Center polling).
@router.post("/documents/upload", response_model=UploadResponse)
def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
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
        _remove_file(file_path)
        raise HTTPException(status_code=500, detail=f"Document processing failed: {str(e)}")

    # PostgreSQL rejects NUL bytes in text columns; bad scans can produce them.
    extracted_text = (extracted_text or "").replace("\x00", "")

    # Persist the document record so it has an ID, an owner, and can be
    # looked up later (Scan Analysis, RBAC, audit) without trusting paths
    # sent from the browser.
    document = Document(
        filename=file.filename,
        file_path=file_path,
        uploaded_by=current_user.id,
        extracted_text=extracted_text,
    )
    try:
        db.add(document)
        db.commit()
        db.refresh(document)
    except Exception as e:
        db.rollback()
        _remove_file(file_path)
        logger.exception("Failed to save document record for %s", file.filename)
        raise HTTPException(status_code=500, detail=f"Failed to save document record: {str(e)}")

    # Index into Qdrant so the agent can retrieve this document's content
    # in future queries. Indexing failure doesn't fail the whole upload —
    # the user still gets their extracted text either way, just a note
    # that it wasn't searchable.
    try:
        indexed_chunks = _index_text(extracted_text, source_filename=file.filename)
    except Exception:
        logger.exception("Indexing failed for document %s", document.id)
        indexed_chunks = 0

    return UploadResponse(
        document_id=str(document.id),
        filename=file.filename,
        extracted_text=extracted_text,
        indexed_chunks=indexed_chunks,
    )


@router.get("/documents", response_model=list[DocumentSummary])
def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lists documents the current user may see, newest first."""
    query = db.query(Document)
    if current_user.role not in PRIVILEGED_ROLES:
        query = query.filter(Document.uploaded_by == current_user.id)
    documents = query.order_by(Document.created_at.desc()).limit(100).all()

    return [
        DocumentSummary(
            id=str(d.id),
            filename=d.filename,
            created_at=d.created_at,
            uploaded_by=str(d.uploaded_by) if d.uploaded_by else None,
        )
        for d in documents
    ]


@router.get(
    "/documents/{document_id}/pages/{page_index}/analysis",
    response_model=PageAnalysisResponse,
)
def analyze_document_page(
    document_id: uuid.UUID,
    page_index: int = Path(..., ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Runs PaddleOCR on one page and returns every detected line with its
    real confidence score and bounding box, plus the rendered page image.
    """
    document = _get_accessible_document(document_id, current_user, db)
    file_path = _resolve_upload_path(document.file_path)

    try:
        result = analyze_page(file_path, page_index)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Page analysis failed for document %s page %s", document.id, page_index)
        raise HTTPException(status_code=500, detail=f"Page analysis failed: {str(e)}")

    return PageAnalysisResponse(
        document_id=str(document.id),
        filename=document.filename,
        page_index=result["page_index"],
        page_count=result["page_count"],
        width=result["width"],
        height=result["height"],
        ocr_engine="PaddleOCR",
        low_confidence_threshold=LOW_CONFIDENCE_THRESHOLD,
        lines=[OcrLine(**line) for line in result["lines"]],
        image_base64=base64.b64encode(result["image_png"]).decode("ascii"),
    )