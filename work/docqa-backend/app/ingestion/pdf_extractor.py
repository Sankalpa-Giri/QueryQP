# The purpose of this file is to extract typed text elements and accurate bounding
# boxes from PDF documents, ensuring proper reading order and role tagging.

from __future__ import annotations

import io
import logging
import os
from pathlib import Path
from typing import Any

import pymupdf

logger = logging.getLogger(__name__)


def _find_tessdata_dir() -> str | None:
    candidates = [
        os.environ.get("TESSDATA_PREFIX", ""),
        "/usr/share/tesseract-ocr/5/tessdata",
        "/usr/share/tesseract-ocr/4.00/tessdata",
        "/usr/share/tessdata",
        "/usr/local/share/tessdata",
        "/opt/homebrew/share/tessdata",
    ]
    for c in candidates:
        if c and os.path.isdir(c) and os.path.exists(os.path.join(c, "eng.traineddata")):
            return c
    return None


def extract_pdf_pages(path: Path) -> list[dict]:
    """Extract typed text blocks and their PDF-space bounding boxes in reading order."""
    pages: list[dict] = []
    with pymupdf.open(path) as pdf:
        for page_number, page in enumerate(pdf, start=1):  # type: ignore[arg-type]
            page_width = float(page.rect.width)
            page_height = float(page.rect.height)

            raw_blocks = page.get_text("blocks")
            valid_text_blocks = [
                b for b in raw_blocks
                if len(b) > 4 and isinstance(b[4], str) and (len(b) <= 6 or b[6] == 0)
            ]
            total_chars = sum(len(b[4].strip()) for b in valid_text_blocks)

            if total_chars < 30:
                tess_dir = _find_tessdata_dir()
                ocr_succeeded = False
                try:
                    kwargs: dict[str, Any] = {"flags": 0, "language": "eng", "dpi": 300, "full": True}
                    if tess_dir:
                        kwargs["tessdata"] = tess_dir
                    tp = page.get_textpage_ocr(**kwargs)
                    ocr_blocks = page.get_text("blocks", textpage=tp)
                    ocr_valid = [
                        b for b in ocr_blocks
                        if len(b) > 4 and isinstance(b[4], str) and (len(b) <= 6 or b[6] == 0)
                    ]
                    ocr_chars = sum(len(b[4].strip()) for b in ocr_valid)
                    if ocr_chars >= 20:
                        raw_blocks = ocr_blocks
                        ocr_succeeded = True
                except Exception as e:
                    logger.debug("PyMuPDF get_textpage_ocr failed on page %d: %s", page_number, e)

                if not ocr_succeeded:
                    try:
                        import pytesseract
                        from PIL import Image

                        pix = page.get_pixmap(dpi=200)
                        img = Image.open(io.BytesIO(pix.tobytes("png")))
                        ocr_text = pytesseract.image_to_string(img, lang="eng").strip()
                        if len(ocr_text) >= 20:
                            raw_blocks = [
                                (50.0, 50.0, page_width - 50.0, page_height - 50.0, ocr_text, 0, 0)
                            ]
                    except Exception:
                        pass

            # Sort blocks into human visual reading order (top-to-bottom, left-to-right)
            text_blocks_to_sort = [
                b for b in raw_blocks
                if len(b) > 4 and isinstance(b[4], str) and (len(b) <= 6 or b[6] == 0)
            ]
            sorted_blocks = sorted(text_blocks_to_sort, key=lambda b: (round(b[1] / 6) * 6, b[0]))

            elements = []
            for index, block in enumerate(sorted_blocks, start=1):
                x0, y0, x1, y1, text, *_ = block
                cleaned_text = str(text).strip()
                if not cleaned_text:
                    continue

                # Identify running headers and footers (5% margins)
                is_header = y1 <= 0.05 * page_height
                is_footer = y0 >= 0.95 * page_height
                element_type = "header" if is_header else ("footer" if is_footer else "paragraph")

                # Add a 2pt horizontal and 1pt vertical comfort padding
                padded_bbox = [
                    round(max(0.0, float(x0) - 2.0), 2),
                    round(max(0.0, float(y0) - 1.0), 2),
                    round(min(page_width, float(x1) + 2.0), 2),
                    round(min(page_height, float(y1) + 1.0), 2),
                ]

                elements.append(
                    {
                        "id": f"page-{page_number}-block-{index}",
                        "type": element_type,
                        "text": cleaned_text,
                        "bbox": padded_bbox,
                    }
                )

            pages.append(
                {
                    "page_number": page_number,
                    "width": page_width,
                    "height": page_height,
                    "elements": elements,
                }
            )
    return pages
