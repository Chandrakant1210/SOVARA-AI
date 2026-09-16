import os
import fitz  # PyMuPDF
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.services.embedding_service import get_embedding
from app.services.qdrant_service import ensure_collection, upsert_chunks

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


def ingest_document(file_path: str):
    filename = os.path.basename(file_path)
    print(f"Processing {filename}...")

    raw_text = extract_text_from_pdf(file_path)
    if not raw_text.strip():
        print(f"  WARNING: no text extracted from {filename}, skipping.")
        return

    chunks = splitter.split_text(raw_text)
    print(f"  Split into {len(chunks)} chunks")

    embeddings = [get_embedding(chunk) for chunk in chunks]
    print(f"  Generated {len(embeddings)} embeddings")

    upsert_chunks(chunks, embeddings, source_filename=filename)
    print(f"  Stored in Qdrant.")


def main():
    ensure_collection()

    pdf_files = [
        f for f in os.listdir(SAMPLE_DOCS_DIR) if f.lower().endswith(".pdf")
    ]

    if not pdf_files:
        print(f"No PDFs found in {SAMPLE_DOCS_DIR}/")
        return

    for filename in pdf_files:
        file_path = os.path.join(SAMPLE_DOCS_DIR, filename)
        ingest_document(file_path)

    print("\nIngestion complete.")


if __name__ == "__main__":
    main()