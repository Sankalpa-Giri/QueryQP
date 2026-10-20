# The purpose of this file is to integrate LlamaCloud / LlamaParse into the ingestion
# pipeline, allowing high-fidelity extraction of complex documents (tables, scans,
# forms, multi-column layouts, DOCX, PPTX) while preserving our downstream
# LangGraph hybrid retrieval, reranking, and bounding-box citation architecture.

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from app.ingestion.pdf_extractor import extract_pdf_pages

logger = logging.getLogger(__name__)


def is_llama_parse_available() -> bool:
    """Check if LlamaCloud API key is configured."""
    return bool(os.environ.get("LLAMA_CLOUD_API_KEY", "").strip())


def extract_with_llama_parse(path: Path) -> list[dict]:
    """Parse documents using LlamaParse and map results into canonical page elements."""
    api_key = os.environ.get("LLAMA_CLOUD_API_KEY", "").strip()
    if not api_key:
        if path.suffix.lower() == ".pdf":
            logger.info("LLAMA_CLOUD_API_KEY not configured. Falling back to local PyMuPDF extractor.")
            return extract_pdf_pages(path)
        raise ValueError(
            f"LLAMA_CLOUD_API_KEY is required to process {path.suffix} files with LlamaParse."
        )

    try:
        from llama_parse import LlamaParse
    except ImportError:
        if path.suffix.lower() == ".pdf":
            logger.warning("llama-parse package not found. Falling back to local PyMuPDF extractor.")
            return extract_pdf_pages(path)
        raise ImportError(
            "llama-parse package is required. Install with `pip install llama-parse`."
        )

    try:
        # Initialize LlamaParse in structured JSON mode with layout extraction enabled
        parser = LlamaParse(
            api_key=api_key,
            result_type="json",
            extract_layout=True,
            split_by_page=True,
            auto_mode=False,
            verbose=False,
        )

        json_results = parser.get_json_result(str(path))
        if not json_results:
            raise ValueError("LlamaParse returned an empty result.")

        return _normalize_llama_parse_json(json_results, path)
    except Exception as err:
        logger.error("LlamaParse processing failed: %s", err)
        # Graceful fallback for PDFs if cloud parsing encounters network/quota errors
        if path.suffix.lower() == ".pdf":
            logger.info("Falling back to local PyMuPDF extractor following LlamaParse failure.")
            return extract_pdf_pages(path)
        raise


def _normalize_llama_parse_json(json_results: list[dict], source_path: Path) -> list[dict]:
    """Convert LlamaParse JSON results to standardized page and element structures."""
    normalized_pages: list[dict] = []

    for doc_idx, doc_res in enumerate(json_results):
        raw_pages = doc_res.get("pages", [])
        for page_idx, raw_page in enumerate(raw_pages, start=1):
            page_num = raw_page.get("page")
            if page_num is None or page_num == 0:
                page_num = page_idx

            page_width = float(raw_page.get("width") or 595.3)
            page_height = float(raw_page.get("height") or 841.9)

            elements: list[dict] = []
            items = raw_page.get("items", [])

            if items:
                for item_idx, item in enumerate(items, start=1):
                    item_type = item.get("type", "paragraph")
                    # Use markdown representation if available for rich table/heading formatting
                    text = (item.get("md") or item.get("value") or "").strip()
                    if not text:
                        continue

                    # Extract item bounding box
                    bbox_dict = item.get("bBox") or item.get("bbox") or {}
                    if isinstance(bbox_dict, dict):
                        x = float(bbox_dict.get("x", 70.0))
                        y = float(bbox_dict.get("y", 100.0))
                        w = float(bbox_dict.get("w", page_width - 140.0))
                        h = float(bbox_dict.get("h", 40.0))
                        bbox = [
                            round(max(0.0, x - 2.0), 2),
                            round(max(0.0, y - 1.0), 2),
                            round(min(page_width, x + w + 2.0), 2),
                            round(min(page_height, y + h + 1.0), 2),
                        ]
                    elif isinstance(bbox_dict, list) and len(bbox_dict) == 4:
                        bbox = [round(float(coord), 2) for coord in bbox_dict]
                    else:
                        bbox = [70.0, 100.0, page_width - 70.0, 150.0]

                    # Distinguish header/footer zones
                    if bbox[3] <= 0.075 * page_height:
                        item_type = "header"
                    elif bbox[1] >= 0.925 * page_height:
                        item_type = "footer"

                    elements.append(
                        {
                            "id": f"page-{page_num}-item-{item_idx}",
                            "type": item_type,
                            "text": text,
                            "bbox": bbox,
                        }
                    )
            else:
                # Fallback if LlamaParse only returned page markdown or raw text
                page_text = (raw_page.get("md") or raw_page.get("text") or "").strip()
                if page_text:
                    paragraphs = [p.strip() for p in page_text.split("\n\n") if p.strip()]
                    approx_h = (page_height * 0.8) / max(len(paragraphs), 1)
                    for p_idx, para in enumerate(paragraphs, start=1):
                        y0 = (page_height * 0.1) + ((p_idx - 1) * approx_h)
                        y1 = min(page_height * 0.9, y0 + approx_h)
                        elements.append(
                            {
                                "id": f"page-{page_num}-item-{p_idx}",
                                "type": "paragraph",
                                "text": para,
                                "bbox": [70.0, round(y0, 2), page_width - 70.0, round(y1, 2)],
                            }
                        )

            normalized_pages.append(
                {
                    "page_number": page_num,
                    "width": page_width,
                    "height": page_height,
                    "elements": elements,
                }
            )

    return normalized_pages
