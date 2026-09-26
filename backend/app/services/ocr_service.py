import os
import threading
from collections import OrderedDict

import numpy as np
import fitz  # PyMuPDF
import ollama
from paddleocr import PaddleOCR
from app.config.model_registry import get_model_for_capability

# Initialize once at module load — loading the model is expensive,
# we don't want to reload it on every request.
_ocr_engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)

# PaddleOCR's predictor is not thread-safe. FastAPI runs sync endpoints in a
# thread pool, so concurrent requests (e.g. page analysis + extraction) could
# corrupt each other's results. Serialize all OCR calls through one lock.
# Re-entrant, because the cached analyze_page() holds it while calling _run_ocr().
_ocr_lock = threading.RLock()


def _run_ocr(image, cls: bool = True):
    with _ocr_lock:
        return _ocr_engine.ocr(image, cls=cls)


# Threshold below which PaddleOCR output is considered too weak to trust —
# triggers a fallback to the vision model.
MIN_TEXT_LENGTH = 20


def extract_text_from_pdf(file_path: str) -> str:
    """
    Renders each page of a PDF to an image and runs OCR on it,
    concatenating text from all pages in order.
    """
    doc = fitz.open(file_path)
    all_text = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
            pix.height, pix.width, pix.n
        )

        result = _run_ocr(img_array, cls=True)
        if result and result[0]:
            page_text = "\n".join(line[1][0] for line in result[0])
            all_text.append(f"--- Page {page_num + 1} ---\n{page_text}")

    doc.close()
    return "\n\n".join(all_text)


def extract_text_from_image(file_path: str) -> str:
    """
    Runs OCR on an image file and returns the extracted text,
    concatenated line by line.
    """
    result = _run_ocr(file_path, cls=True)

    if not result or not result[0]:
        return ""

    lines = [line[1][0] for line in result[0]]
    return "\n".join(lines)


def extract_text_with_vision(file_path: str) -> str:
    """
    Uses the registered vision model (via Ollama) to extract/describe
    text and visual content from an image. Used as a fallback when
    PaddleOCR returns little or no usable text.
    """
    with open(file_path, "rb") as f:
        image_bytes = f.read()

    response = ollama.chat(
        model=get_model_for_capability("vision")["model_name"],
        messages=[
            {
                "role": "user",
                "content": (
                    "Extract all readable text from this document image. "
                    "If it contains diagrams, tables, or stamps, briefly "
                    "describe them as well. Return only the extracted "
                    "content, no commentary."
                ),
                "images": [image_bytes],
            }
        ],
    )
    return response["message"]["content"]


def extract_text_with_fallback(file_path: str) -> str:
    """
    Runs PaddleOCR first. If the result is too short to be useful
    (e.g. a low-quality scan, stamp, or diagram-heavy page), falls
    back to the vision model.
    """
    ocr_text = extract_text_from_image(file_path)

    if len(ocr_text.strip()) >= MIN_TEXT_LENGTH:
        return ocr_text

    return extract_text_with_vision(file_path)


# ---------------------------------------------------------------------------
# Structured page analysis (Scan Analysis view)
# Keeps what the text-only functions above discard: per-line bounding boxes
# and PaddleOCR confidence scores. These are real OCR measurements.
# ---------------------------------------------------------------------------

# Caps render size so very large pages don't exhaust memory or slow OCR.
MAX_RENDER_SIDE = 2400


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _analyze_page_uncached(file_path: str, page_index: int = 0) -> dict:
    """
    Renders one page (PDF page or image file) and runs PaddleOCR on it.

    Returns the rendered page as PNG bytes, the page count, and every
    detected text line with its PaddleOCR confidence and a bounding box
    normalized to 0-1 relative to the rendered page.
    Raises ValueError if page_index is out of range.
    """
    doc = fitz.open(file_path)  # opens PDFs and common image formats alike
    try:
        page_count = len(doc)
        if not 0 <= page_index < page_count:
            raise ValueError(
                f"page_index {page_index} out of range (0-{page_count - 1})"
            )

        page = doc[page_index]
        longest = max(page.rect.width, page.rect.height)
        zoom = min(2.0, MAX_RENDER_SIDE / longest) if longest else 2.0
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
            pix.height, pix.width, pix.n
        )

        result = _run_ocr(img, cls=True)
        raw_lines = result[0] if result and result[0] else []

        lines = []
        for box, (text, score) in raw_lines:
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            lines.append({
                "text": text,
                "confidence": round(float(score), 4),
                "bbox": [
                    round(_clamp01(min(xs) / pix.width), 4),
                    round(_clamp01(min(ys) / pix.height), 4),
                    round(_clamp01(max(xs) / pix.width), 4),
                    round(_clamp01(max(ys) / pix.height), 4),
                ],
            })

        return {
            "page_index": page_index,
            "page_count": page_count,
            "width": pix.width,
            "height": pix.height,
            "lines": lines,
            "image_png": pix.tobytes("png"),
        }
    finally:
        doc.close()


# Page results are cached: an uploaded file never changes, so repeated or
# duplicate requests (page switching, reloads, React dev double-fetch) return
# instantly instead of queueing behind the OCR lock. In-memory only, bounded.
_PAGE_CACHE: "OrderedDict[tuple, dict]" = OrderedDict()
_PAGE_CACHE_MAX = 32


def analyze_page(file_path: str, page_index: int = 0) -> dict:
    """Cached wrapper around _analyze_page_uncached (same return value)."""
    key = (os.path.abspath(file_path), os.path.getmtime(file_path), page_index)
    with _ocr_lock:
        cached = _PAGE_CACHE.get(key)
        if cached is not None:
            _PAGE_CACHE.move_to_end(key)
            return cached
        result = _analyze_page_uncached(file_path, page_index)
        _PAGE_CACHE[key] = result
        if len(_PAGE_CACHE) > _PAGE_CACHE_MAX:
            _PAGE_CACHE.popitem(last=False)
        return result