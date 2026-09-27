"""
SOVARA AI - rebuild the vector index with access control.

Drops the Qdrant collection, then re-indexes:
  - the SOPs in sample_docs/ as SHARED reference material
  - every uploaded document in the database as PRIVATE to its uploader
Chunks indexed before access control existed (no owner) are removed.

Run from backend/ with the venv active:
    python reindex_rag.py --yes
"""

import sys

import app.models.user  # noqa: F401  (registers the users table)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.core.database import SessionLocal
from app.models.document import Document
from app.services.audit_service import record_standalone
from app.services.embedding_service import get_embedding
from app.services.qdrant_service import PRIVATE, recreate_collection, upsert_chunks
import ingest_sop_docs

splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)


def main() -> int:
    if "--yes" not in sys.argv:
        print("This drops and rebuilds the vector index. Re-run with --yes to continue.")
        return 1

    recreate_collection()
    sop_chunks = ingest_sop_docs.main()

    db = SessionLocal()
    try:
        docs = db.query(Document).order_by(Document.created_at.asc()).all()
    finally:
        db.close()

    indexed, skipped, doc_chunks = 0, 0, 0
    for d in docs:
        text = (d.extracted_text or "").strip()
        if not text or not d.uploaded_by:
            skipped += 1
            continue
        chunks = splitter.split_text(text)
        embeddings = [get_embedding(c) for c in chunks]
        upsert_chunks(chunks, embeddings, source_filename=d.filename,
                      document_id=str(d.id), owner_id=str(d.uploaded_by), visibility=PRIVATE)
        indexed += 1
        doc_chunks += len(chunks)
        print(f"  {d.filename}: {len(chunks)} private chunks")

    summary = f"{sop_chunks} shared SOP chunks, {indexed} documents ({doc_chunks} private chunks), {skipped} skipped"
    record_standalone(None, "rag.reindex", {
        "summary": "Rebuilt vector index with access control", "tool": "reindex_rag.py",
        "result": "success", "detail": summary,
    })
    print(f"\nRe-index complete: {summary}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())