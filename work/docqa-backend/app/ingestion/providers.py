import io
import logging
import os
import shutil
import subprocess
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pymupdf

from app.core.config import settings

logger = logging.getLogger(__name__)


def get_tessdata_path() -> str | None:
    """Locate valid tessdata directory containing eng.traineddata."""
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


@dataclass
class ParsedElement:
    id: str
    type: str  # "heading", "paragraph", "table", "header", "footer"
    text: str
    bbox: list[float]  # [x0, y0, x1, y1]
    page_number: int


@dataclass
class ParsedPage:
    page_number: int
    width: float
    height: float
    elements: list[ParsedElement] = field(default_factory=list)
    markdown: str = ""


@dataclass
class ParsedDocumentResult:
    page_count: int
    markdown: str
    pages: list[ParsedPage]
    assets: list[dict[str, Any]] = field(default_factory=list)
    parser_name: str = "pymupdf"
    parser_version: str = "1.0.0"
    warnings: list[str] = field(default_factory=list)


class BaseDocumentParser(ABC):
    @abstractmethod
    def parse(self, path: Path) -> ParsedDocumentResult:
        """Parse a document file into structured pages, markdown, and layout elements."""
        pass


class PyMuPDFProvider(BaseDocumentParser):
    """Fast, local, offline PDF parser using PyMuPDF with automated OCR for scanned documents."""

    def parse(self, path: Path) -> ParsedDocumentResult:
        doc = pymupdf.open(path)
        page_count = len(doc)
        pages: list[ParsedPage] = []
        full_md_lines: list[str] = []

        for p_idx, page in enumerate(doc, start=1):
            w = float(page.rect.width)
            h = float(page.rect.height)
            raw_blocks = page.get_text("blocks")

            # Extract text blocks only (block_type 0 and text is str)
            valid_text_blocks = [
                b for b in raw_blocks
                if len(b) > 4 and isinstance(b[4], str) and (len(b) <= 6 or b[6] == 0)
            ]
            total_chars = sum(len(b[4].strip()) for b in valid_text_blocks)

            # If page has very little readable text, it is likely a scanned image -> trigger OCR
            if total_chars < 30:
                tess_dir = get_tessdata_path()
                ocr_succeeded = False

                # Strategy 1: PyMuPDF get_textpage_ocr
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
                        logger.info("PyMuPDF OCR successfully extracted %d characters on page %d", ocr_chars, p_idx)
                except Exception as e:
                    logger.debug("PyMuPDF get_textpage_ocr failed on page %d: %s", p_idx, e)

                # Strategy 2: Fallback to pytesseract or tesseract CLI on page pixmap
                if not ocr_succeeded:
                    try:
                        import pytesseract
                        from PIL import Image

                        pix = page.get_pixmap(dpi=200)
                        img = Image.open(io.BytesIO(pix.tobytes("png")))
                        ocr_text = pytesseract.image_to_string(img, lang="eng").strip()
                        if len(ocr_text) >= 20:
                            # Construct synthetic text block spanning the printable page area
                            raw_blocks = [
                                (50.0, 50.0, w - 50.0, h - 50.0, ocr_text, 0, 0)
                            ]
                            ocr_succeeded = True
                            logger.info("pytesseract OCR extracted %d characters on page %d", len(ocr_text), p_idx)
                    except Exception as e:
                        logger.debug("pytesseract OCR fallback failed on page %d: %s", p_idx, e)

                # Strategy 3: Direct tesseract CLI invocation if installed
                if not ocr_succeeded and shutil.which("tesseract"):
                    try:
                        pix = page.get_pixmap(dpi=200)
                        temp_png = f"/tmp/page_{p_idx}_{os.getpid()}.png" if os.name != "nt" else f"page_{p_idx}_{os.getpid()}.png"
                        pix.save(temp_png)
                        proc = subprocess.run(
                            ["tesseract", temp_png, "stdout", "-l", "eng"],
                            capture_output=True,
                            text=True,
                            timeout=30,
                        )
                        if os.path.exists(temp_png):
                            os.remove(temp_png)
                        cli_text = proc.stdout.strip()
                        if len(cli_text) >= 20:
                            raw_blocks = [
                                (50.0, 50.0, w - 50.0, h - 50.0, cli_text, 0, 0)
                            ]
                            logger.info("tesseract CLI extracted %d characters on page %d", len(cli_text), p_idx)
                    except Exception as e:
                        logger.debug("tesseract CLI fallback failed on page %d: %s", p_idx, e)

            # Human visual reading order (top-to-bottom, left-to-right)
            text_blocks_to_sort = [
                b for b in raw_blocks
                if len(b) > 4 and isinstance(b[4], str) and (len(b) <= 6 or b[6] == 0)
            ]
            sorted_blocks = sorted(text_blocks_to_sort, key=lambda b: (round(b[1] / 6) * 6, b[0]))

            page_elements: list[ParsedElement] = []
            page_md_lines: list[str] = []

            for b_idx, block in enumerate(sorted_blocks, start=1):
                x0, y0, x1, y1, text, *_ = block
                cleaned = str(text).strip()
                if not cleaned:
                    continue

                # Header/footer threshold: top 5% or bottom 5%
                is_header = y1 <= 0.05 * h
                is_footer = y0 >= 0.95 * h
                el_type = "header" if is_header else ("footer" if is_footer else "paragraph")

                # Bounding box with 2pt padding
                bbox = [
                    round(max(0.0, float(x0) - 2.0), 2),
                    round(max(0.0, float(y0) - 1.0), 2),
                    round(min(w, float(x1) + 2.0), 2),
                    round(min(h, float(y1) + 1.0), 2),
                ]

                page_elements.append(
                    ParsedElement(
                        id=f"page-{p_idx}-el-{b_idx}",
                        type=el_type,
                        text=cleaned,
                        bbox=bbox,
                        page_number=p_idx,
                    )
                )

                if el_type not in ("header", "footer"):
                    page_md_lines.append(cleaned)

            page_md = "\n\n".join(page_md_lines)
            pages.append(
                ParsedPage(
                    page_number=p_idx,
                    width=w,
                    height=h,
                    elements=page_elements,
                    markdown=page_md,
                )
            )

            full_md_lines.append(f"<!-- Page {p_idx} -->\n" + page_md)

        doc.close()
        return ParsedDocumentResult(
            page_count=page_count,
            markdown="\n\n---\n\n".join(full_md_lines),
            pages=pages,
            parser_name="pymupdf",
            parser_version=pymupdf.__version__,
        )


class LlamaParseProvider(BaseDocumentParser):
    """Cloud-based parser using LlamaCloud v2 Parse API for complex layouts, tables, and scans."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.environ.get("LLAMA_CLOUD_API_KEY", "")

    def parse(self, path: Path) -> ParsedDocumentResult:
        if not self.api_key:
            logger.warning("LLAMA_CLOUD_API_KEY is not set. Falling back to PyMuPDFProvider.")
            return PyMuPDFProvider().parse(path)

        try:
            import time
            from llama_cloud.client import LlamaCloud
            import llama_cloud.types as lct

            client = LlamaCloud(token=self.api_key)
            with open(path, "rb") as f:
                uploaded_file = client.files.upload_file(upload_file=f)

            output_options = lct.LlamaParseOutputOptions(
                markdown=lct.LlamaParseMarkdownOptions(),
                extract_printed_page_number=True,
            )

            job = client.v_2.parse_file(
                file_id=uploaded_file.id,
                tier="fast",
                version="latest",
                output_options=output_options,
            )

            # Poll for completion with timeout
            parse_result = None
            for _ in range(60):
                time.sleep(2)
                res = client.v_2.get_parse_job(job_id=job.id, expand=["markdown", "items"])
                status_str = res.job.status.value if hasattr(res.job.status, "value") else str(res.job.status)
                if status_str in ("COMPLETED", "SUCCESS"):
                    parse_result = res
                    break
                elif status_str in ("FAILED", "ERROR"):
                    raise ValueError(f"LlamaCloud v2 parse job failed: {res.job.error_message}")

            if not parse_result or not parse_result.markdown:
                raise ValueError("LlamaCloud v2 returned empty parse result.")

            pages: list[ParsedPage] = []
            full_md_parts: list[str] = []

            for idx, p in enumerate(parse_result.markdown.pages, start=1):
                p_text = p.markdown or ""
                elements: list[ParsedElement] = [
                    ParsedElement(
                        id=f"page-{idx}-el-1",
                        type="paragraph",
                        text=p_text,
                        bbox=[50.0, 50.0, 545.0, 792.0],
                        page_number=idx,
                    )
                ]
                pages.append(
                    ParsedPage(
                        page_number=idx,
                        width=595.0,
                        height=842.0,
                        elements=elements,
                        markdown=p_text,
                    )
                )
                full_md_parts.append(f"<!-- Page {idx} -->\n" + p_text)

            return ParsedDocumentResult(
                page_count=len(pages),
                markdown="\n\n---\n\n".join(full_md_parts),
                pages=pages,
                parser_name="llama_parse_v2",
                parser_version="2.0.0",
            )
        except Exception as e:
            logger.error("LlamaCloud v2 execution failed: %s. Falling back to PyMuPDF.", e)
            if path.suffix.lower() == ".pdf":
                return PyMuPDFProvider().parse(path)
            raise


def get_document_parser(parser_type: str | None = None) -> BaseDocumentParser:
    """Provider factory selecting parser based on configuration or explicit request."""
    chosen = (parser_type or settings.DOCUMENT_PARSER).lower().replace("-", "_")
    if chosen in ("llama_parse", "llamaparse", "auto") and settings.LLAMA_CLOUD_API_KEY:
        return LlamaParseProvider(api_key=settings.LLAMA_CLOUD_API_KEY)
    return PyMuPDFProvider()
