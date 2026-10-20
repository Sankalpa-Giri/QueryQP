import os
from pathlib import Path

from app.ingestion.llama_parse_extractor import extract_with_llama_parse, is_llama_parse_available
from app.ingestion.pdf_extractor import extract_pdf_pages


def extract_document(path: Path) -> list[dict]:
    """Route a stored file to its appropriate extractor.

    When LLAMA_CLOUD_API_KEY is configured (or DOCUMENT_PARSER=llama_parse),
    LlamaParse is used to parse documents with advanced OCR, table recognition,
    and layout analysis. Otherwise, the fast local PyMuPDF extractor is used for PDFs.
    """
    parser_preference = os.environ.get("DOCUMENT_PARSER", "auto").lower()

    if parser_preference == "pymupdf":
        if path.suffix.lower() == ".pdf":
            return extract_pdf_pages(path)
        raise ValueError(f"PyMuPDF only supports .pdf files; received {path.suffix}.")

    if parser_preference == "llama_parse" or is_llama_parse_available():
        return extract_with_llama_parse(path)

    if path.suffix.lower() == ".pdf":
        return extract_pdf_pages(path)

    raise ValueError(
        f"No local extractor is registered for {path.suffix}. "
        f"Set LLAMA_CLOUD_API_KEY in your .env to parse {path.suffix} files with LlamaParse."
    )
