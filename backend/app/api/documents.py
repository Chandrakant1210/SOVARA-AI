import os
import json
import base64
import shutil
import uuid
import logging
import threading
import time
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Path
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.services.ocr_service import (
    extract_text_from_pdf,
    extract_text_with_fallback,
    analyze_page,
)
from app.services.scan_extraction_service import (
    REVIEW_CONFIDENCE,
    build_findings_text,
    correction_targets,
    extract_inspection_report,
)
from app.services.audit_service import record, record_standalone
from app.services.embedding_service import get_embedding
from app.services.qdrant_service import ensure_collection, upsert_chunks
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User, UserRole
from app.models.document import Document
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
UPLOAD_ROOT = os.path.realpath(UPLOAD_DIR)

# Roles allowed to see every document; everyone else sees only their own.
PRIVILEGED_ROLES = {UserRole.ADMIN, UserRole.MANAGER}

# Roles allowed to correct values extracted from a scan.
CORRECT_ROLES = {UserRole.ADMIN, UserRole.MANAGER, UserRole.ENGINEER}

# Single source of truth: same threshold as the extraction service.
LOW_CONFIDENCE_THRESHOLD = REVIEW_CONFIDENCE

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".pdf"}

# Viewing the same scan again within this window isn't logged twice
# (page reloads, React dev double-requests).
SCAN_AUDIT_DEDUPE_SECONDS = 600
_scan_audit_seen: dict[tuple[str, str], float] = {}
_scan_audit_lock = threading.Lock()

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
        record_standalone(current_user.id, "document.upload", {
            "summary": f"Uploaded {file.filename}", "tool": "Document Vault", "result": "failed",
            "error": str(e),
        })
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

    record_standalone(current_user.id, "document.upload", {
        "summary": f"Uploaded {file.filename}", "tool": "Document Vault",
        "result": f"indexed · {indexed_chunks} chunks" if indexed_chunks else "stored, not indexed",
        "document_id": str(document.id),
    })

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
    doc_id, filename = str(document.id), document.filename
    # Release the DB connection before slow OCR so queued requests
    # can't exhaust the connection pool.
    db.close()

    try:
        result = analyze_page(file_path, page_index)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Page analysis failed for document %s page %s", doc_id, page_index)
        raise HTTPException(status_code=500, detail=f"Page analysis failed: {str(e)}")

    return PageAnalysisResponse(
        document_id=doc_id,
        filename=filename,
        page_index=result["page_index"],
        page_count=result["page_count"],
        width=result["width"],
        height=result["height"],
        ocr_engine="PaddleOCR",
        low_confidence_threshold=LOW_CONFIDENCE_THRESHOLD,
        lines=[OcrLine(**line) for line in result["lines"]],
        image_base64=base64.b64encode(result["image_png"]).decode("ascii"),
    )


# Caps OCR work per extraction request.
MAX_EXTRACTION_PAGES = 10


class CorrectionRequest(BaseModel):
    target: str = Field(..., max_length=100)  # "field:<key>" or "reading:<CML>:<nominal|previous|current>"
    value: str = Field(..., min_length=1, max_length=200)
    reason: str = Field("", max_length=300)


def _load_corrections(db: Session, doc_id: str) -> dict:
    """Latest human correction per value for this document, from the audit log."""
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.action == "scan.correction", AuditLog.details.like(f'%"document_id": "{doc_id}"%'))
        .order_by(AuditLog.created_at.asc())
        .all()
    )
    ids = {r.user_id for r in rows if r.user_id}
    emails = {str(u.id): u.email for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}
    corrections = {}
    for r in rows:
        try:
            d = json.loads(r.details or "{}")
        except ValueError:
            continue
        if d.get("target") and d.get("value") is not None:
            corrections[d["target"]] = {
                "value": d["value"], "reason": d.get("reason"),
                "by": emails.get(str(r.user_id), "unknown"),
                "at": r.created_at.isoformat() if r.created_at else None,
            }
    return corrections


def _run_extraction(file_path: str, corrections: dict) -> tuple[dict, dict, list]:
    first = analyze_page(file_path, 0)
    page_total = min(first["page_count"], MAX_EXTRACTION_PAGES)
    pages = [first] + [analyze_page(file_path, i) for i in range(1, page_total)]
    lines = [{"page": p["page_index"] + 1, **line} for p in pages for line in p["lines"]]
    return extract_inspection_report(lines, corrections), first, pages


def _current_value(result: dict, target: str):
    parts = target.split(":")
    if parts[0] == "field":
        return next((f["value"] for f in result["fields"] + result["signoff"] if f["key"] == parts[1]), None)
    cml, col = parts[1], parts[2]
    return next((r[col] for r in result["readings"] if r["cml"] == cml), None)


def _with_meta(result: dict, doc_id: str, filename: str, first: dict, pages: list, user: User) -> dict:
    result.update({
        "document_id": doc_id,
        "filename": filename,
        "page_count": first["page_count"],
        "pages_analyzed": len(pages),
        "can_correct": user.role in CORRECT_ROLES,
    })
    return result


@router.get("/documents/{document_id}/extraction")
def extract_document_fields(
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Runs OCR on every page (up to MAX_EXTRACTION_PAGES) and returns
    structured fields, thickness readings and validation checks, with
    human corrections applied. Every value points to its source OCR line.
    """
    document = _get_accessible_document(document_id, current_user, db)
    file_path = _resolve_upload_path(document.file_path)
    doc_id, filename = str(document.id), document.filename
    user_id = current_user.id
    corrections = _load_corrections(db, doc_id)
    # Release the DB connection before slow OCR (see analyze_document_page).
    db.close()

    try:
        result, first, pages = _run_extraction(file_path, corrections)
    except Exception as e:
        logger.exception("Extraction OCR failed for document %s", doc_id)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

    summary = result["summary"]
    flagged = summary["needs_review"] + summary["failed_checks"]
    key = (str(user_id), doc_id)
    with _scan_audit_lock:
        now = time.monotonic()
        recent = now - _scan_audit_seen.get(key, -SCAN_AUDIT_DEDUPE_SECONDS) < SCAN_AUDIT_DEDUPE_SECONDS
        _scan_audit_seen[key] = now
    if not recent:
        record_standalone(user_id, "scan.extract", {
            "summary": f"Analysed {filename} ({len(pages)} {'page' if len(pages) == 1 else 'pages'})",
            "tool": "PaddleOCR + rules",
            "result": f"{flagged} {'item' if flagged == 1 else 'items'} flagged" if flagged else "no issues",
            "document_id": doc_id, "filename": filename,
        })

    return _with_meta(result, doc_id, filename, first, pages, current_user)


@router.post("/documents/{document_id}/corrections")
def correct_value(
    document_id: uuid.UUID,
    request: CorrectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Records a human correction of one extracted value. Stored as an audit
    event (who, what, from, to, why); nothing is overwritten. Returns the
    extraction re-validated with all corrections applied.
    """
    if current_user.role not in CORRECT_ROLES:
        raise HTTPException(status_code=403, detail="Your role can't correct extracted values")
    document = _get_accessible_document(document_id, current_user, db)
    file_path = _resolve_upload_path(document.file_path)
    doc_id, filename = str(document.id), document.filename

    try:
        result, _, _ = _run_extraction(file_path, _load_corrections(db, doc_id))
    except Exception as e:
        logger.exception("Extraction failed before correction for document %s", doc_id)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

    target = request.target.strip()
    if target not in correction_targets(result):
        raise HTTPException(status_code=422, detail=f"'{target}' is not a correctable value on this document")
    value = request.value.strip()
    if target.startswith("reading:") and not target.endswith(":location"):
        try:
            float(value)
        except ValueError:
            raise HTTPException(status_code=422, detail="Thickness readings must be numbers, e.g. 13.1")

    original = _current_value(result, target)
    try:
        record(db, current_user.id, "scan.correction", {
            "summary": f"Corrected {target.split(':', 1)[1].replace(':', ' ')} on {filename}",
            "tool": "Scan Analysis", "result": "corrected",
            "document_id": doc_id, "target": target,
            "original": original, "value": value, "reason": request.reason.strip() or None,
        })
    except Exception:
        db.rollback()
        logger.exception("Audit write failed; correction not recorded")
        raise HTTPException(status_code=503, detail="Audit log unavailable; the correction was not recorded")

    corrections = _load_corrections(db, doc_id)
    db.close()
    result, first, pages = _run_extraction(file_path, corrections)
    return _with_meta(result, doc_id, filename, first, pages, current_user)


@router.post("/documents/{document_id}/findings")
def document_findings(
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Findings text for the agent, built on the server from the validated
    extraction (with corrections). Marks corrected and unconfirmed values.
    """
    document = _get_accessible_document(document_id, current_user, db)
    file_path = _resolve_upload_path(document.file_path)
    doc_id, filename = str(document.id), document.filename
    user_id = current_user.id
    corrections = _load_corrections(db, doc_id)
    db.close()

    try:
        result, _, _ = _run_extraction(file_path, corrections)
    except Exception as e:
        logger.exception("Findings extraction failed for document %s", doc_id)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

    summary = result["summary"]
    record_standalone(user_id, "scan.findings", {
        "summary": f"Prepared findings from {filename}", "tool": "Scan Analysis",
        "result": f"{summary['needs_review']} items need review", "document_id": doc_id,
    })
    return {"document_id": doc_id, "filename": filename, "text": build_findings_text(result, filename), "summary": summary}