"""
Loads the reference SOPs in sample_docs/ into Qdrant as SHARED material that
every user may retrieve. Safe to re-run: each SOP's previous chunks are
removed first, so nothing is duplicated.

Run from backend/ with the venv active:  python ingest_sop_docs.py
"""

import os
import fitz  # PyMuPDF
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.services.embedding_service import get_embedding
from app.services.qdrant_service import SHARED, delete_by_source, ensure_collection, upsert_chunks

SAMPLE_DOCS_DIR = "sample_docs"

splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50,
)


def extract_text_from_pdf(file_path: str) -> str:
    """Extracts raw text from a PDF using PyMuPDF (fast, since these are text PDFs, not scans)."""
    doc = fitz.open(file_path)
    text = "\n".join(page.get_text() for page in doc)
    doc.close()
    return text


def ingest_document(file_path: str) -> int:
    filename = os.path.basename(file_path)
    print(f"Processing {filename}...")

    raw_text = extract_text_from_pdf(file_path)
    if not raw_text.strip():
        print(f"  WARNING: no text extracted from {filename}, skipping.")
        return 0

    chunks = splitter.split_text(raw_text)
    embeddings = [get_embedding(chunk) for chunk in chunks]

    delete_by_source(filename, SHARED)  # re-running replaces, never duplicates
    upsert_chunks(chunks, embeddings, source_filename=filename, visibility=SHARED)
    print(f"  Stored {len(chunks)} shared chunks.")
    return len(chunks)


def main() -> int:
    ensure_collection()

    pdf_files = sorted(f for f in os.listdir(SAMPLE_DOCS_DIR) if f.lower().endswith(".pdf"))
    if not pdf_files:
        print(f"No PDFs found in {SAMPLE_DOCS_DIR}/")
        return 0

    total = sum(ingest_document(os.path.join(SAMPLE_DOCS_DIR, f)) for f in pdf_files)
    print(f"\nIngestion complete: {len(pdf_files)} SOPs, {total} shared chunks.")
    return total


if __name__ == "__main__":
    main()