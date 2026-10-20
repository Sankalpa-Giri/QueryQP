# The purpose of this file is to create coherent, page-local retrieval chunks
# without splitting text blocks or leaking running headers/footers into content boxes.

from __future__ import annotations

import re
from uuid import UUID

# Generous chunk threshold preserving complete sections, problem statements, and tables
MAX_CHUNK_CHARACTERS = 1_800
MIN_SECTION_CHUNK_CHARACTERS = 300

_HEADING_REGEX = re.compile(r"^(\d+(\.\d+)*\.?\s+[A-Z]|\bStep\s+\d+[:\s])")


def _is_major_section_heading(text: str) -> bool:
    """Identify section and step headings that naturally start a new conceptual topic."""
    first_line = text.strip().split("\n")[0].strip()
    return bool(_HEADING_REGEX.match(first_line) and len(first_line) < 80)


def chunk_pages(document_id: UUID, pages: list[dict]) -> list[dict]:
    """Create page-local retrieval chunks without splitting extracted text blocks.

    Excludes running headers and footers from body content chunks so they do not
    inflate bounding boxes across page margins or pollute educational answers.
    Also splits cleanly at major section/step headings to keep bounding boxes tight.
    """
    chunks: list[dict] = []

    for page in pages:
        current_elements: list[dict] = []
        current_length = 0
        page_width = page.get("width")
        page_height = page.get("height")

        # Only group body elements into content chunks
        all_elements = page.get("elements", [])
        body_elements = [el for el in all_elements if el.get("type") not in ("header", "footer")]
        # Fallback to all elements if page consists only of untagged blocks
        elements_to_chunk = body_elements if body_elements else all_elements

        for element in elements_to_chunk:
            text = element["text"]
            projected_length = current_length + len(text) + (2 if current_elements else 0)
            is_new_section = _is_major_section_heading(text)

            # Split if maximum chunk size reached or if a new major section heading begins
            should_split = current_elements and (
                projected_length > MAX_CHUNK_CHARACTERS
                or (is_new_section and current_length >= MIN_SECTION_CHUNK_CHARACTERS)
            )

            if should_split:
                chunks.append(
                    _build_chunk(
                        document_id,
                        page["page_number"],
                        current_elements,
                        len(chunks) + 1,
                        page_width,
                        page_height,
                    )
                )
                current_elements = []
                current_length = 0

            current_elements.append(element)
            current_length += len(text) + (2 if current_length else 0)

        if current_elements:
            chunks.append(
                _build_chunk(
                    document_id,
                    page["page_number"],
                    current_elements,
                    len(chunks) + 1,
                    page_width,
                    page_height,
                )
            )

    return chunks


def _build_chunk(
    document_id: UUID,
    page_number: int,
    elements: list[dict],
    sequence: int,
    page_width: float | None = None,
    page_height: float | None = None,
) -> dict:
    return {
        "chunk_id": f"{document_id}:chunk:{sequence}",
        "document_id": str(document_id),
        "text": "\n\n".join(element["text"] for element in elements),
        "page_number": page_number,
        "page_width": page_width,
        "page_height": page_height,
        "bbox": _union_bbox([element["bbox"] for element in elements]),
        "source_element_ids": [element["id"] for element in elements],
    }


def _union_bbox(boxes: list[list[float]]) -> list[float]:
    """Return one tight rectangle covering all source rectangles."""
    if not boxes:
        return [0.0, 0.0, 0.0, 0.0]
    return [
        round(min(box[0] for box in boxes), 2),
        round(min(box[1] for box in boxes), 2),
        round(max(box[2] for box in boxes), 2),
        round(max(box[3] for box in boxes), 2),
    ]
