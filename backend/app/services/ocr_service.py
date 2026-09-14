import numpy as np
import fitz  # PyMuPDF


from paddleocr import PaddleOCR

# Initialize once at module load — loading the model is expensive,
# we don't want to reload it on every request.
_ocr_engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)


def extract_text_from_pdf(file_path: str) -> str:
    """
    Renders each page of a PDF to an image and runs OCR on it,
    concatenating text from all pages in order.
    """
    doc = fitz.open(file_path)
    all_text = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        # Render at 2x zoom for better OCR accuracy on scanned text
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
            pix.height, pix.width, pix.n
        )

        result = _ocr_engine.ocr(img_array, cls=True)
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
    result = _ocr_engine.ocr(file_path, cls=True)

    if not result or not result[0]:
        return ""

    lines = [line[1][0] for line in result[0]]
    return "\n".join(lines)




# import base64
import ollama

# Threshold below which PaddleOCR output is considered too weak to trust —
# triggers a fallback to the vision model.
MIN_TEXT_LENGTH = 20


def extract_text_with_vision(file_path: str) -> str:
    """
    Uses Qwen2.5-VL (via Ollama) to extract/describe text and visual
    content from an image. Used as a fallback when PaddleOCR returns
    little or no usable text.
    """
    with open(file_path, "rb") as f:
        image_bytes = f.read()

    response = ollama.chat(
        model="qwen2.5vl:7b",
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
    back to the Qwen2.5-VL vision model.
    """
    ocr_text = extract_text_from_image(file_path)

    if len(ocr_text.strip()) >= MIN_TEXT_LENGTH:
        return ocr_text

    return extract_text_with_vision(file_path)