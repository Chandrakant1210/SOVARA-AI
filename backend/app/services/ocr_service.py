from paddleocr import PaddleOCR

# Initialize once at module load — loading the model is expensive,
# we don't want to reload it on every request.
_ocr_engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)


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