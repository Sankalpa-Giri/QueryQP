# The purpose of this file is to extract typed text elements and accurate bounding
# boxes from PDF documents, ensuring proper reading order and role tagging.

from __future__ import annotations

from pathlib import Path

import pymupdf


def extract_pdf_pages(path: Path) -> list[dict]:
    """Extract typed text blocks and their PDF-space bounding boxes in reading order."""
    pages: list[dict] = []
    with pymupdf.open(path) as pdf:
        for page_number, page in enumerate(pdf, start=1):  # type: ignore[arg-type]
            page_width = float(page.rect.width)
            page_height = float(page.rect.height)

            raw_blocks = page.get_text("blocks")
            # Sort blocks into human visual reading order (top-to-bottom, left-to-right)
            # Grouping y0 by 6pt avoids jitter on adjacent columns or slight misalignments
            sorted_blocks = sorted(raw_blocks, key=lambda b: (round(b[1] / 6) * 6, b[0]))

            elements = []
            for index, block in enumerate(sorted_blocks, start=1):
                x0, y0, x1, y1, text, *_ = block
                cleaned_text = text.strip()
                if not cleaned_text:
                    continue

                # Identify running headers and footers to keep body chunks clean
                is_header = y1 <= 0.075 * page_height
                is_footer = y0 >= 0.925 * page_height
                element_type = "header" if is_header else ("footer" if is_footer else "paragraph")

                # Add a 2pt horizontal and 1pt vertical comfort padding so text glyphs aren't clipped by borders
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