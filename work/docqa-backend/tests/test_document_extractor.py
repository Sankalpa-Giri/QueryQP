import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.ingestion.llama_parse_extractor import (
    _normalize_llama_parse_json,
    extract_with_llama_parse,
    is_llama_parse_available,
)
from app.ingestion.router import extract_document


def _find_test_pdf():
    candidates = [
        Path("test_sample_paper.pdf"),
        Path("work/docqa-backend/test_sample_paper.pdf"),
        Path("data/uploads/c789c698-e0df-4a4a-ba1a-24152bec14ae.pdf"),
        Path("work/docqa-backend/data/uploads/c789c698-e0df-4a4a-ba1a-24152bec14ae.pdf"),
    ]
    for p in candidates:
        if p.exists():
            return p
    return Path("test_sample_paper.pdf")


class TestDocumentExtractor:
    def test_router_uses_pymupdf_by_default(self, monkeypatch):
        monkeypatch.delenv("LLAMA_CLOUD_API_KEY", raising=False)
        monkeypatch.setenv("DOCUMENT_PARSER", "auto")

        pdf_path = _find_test_pdf()
        pages = extract_document(pdf_path)


        assert len(pages) > 0
        first_page = pages[0]
        assert "page_number" in first_page
        assert first_page["width"] > 0
        assert first_page["height"] > 0
        assert len(first_page["elements"]) > 0

    def test_router_rejects_non_pdf_when_no_llama_cloud_key(self, monkeypatch):
        monkeypatch.delenv("LLAMA_CLOUD_API_KEY", raising=False)
        monkeypatch.setenv("DOCUMENT_PARSER", "auto")

        with pytest.raises(ValueError, match="Set LLAMA_CLOUD_API_KEY"):
            extract_document(Path("sample_document.docx"))

    def test_normalize_llama_parse_json_converts_layout_and_bboxes(self):
        sample_json_response = [
            {
                "pages": [
                    {
                        "page": 1,
                        "width": 600.0,
                        "height": 800.0,
                        "items": [
                            {
                                "type": "header",
                                "value": "Running Header Title",
                                "bBox": {"x": 50.0, "y": 20.0, "w": 300.0, "h": 20.0},
                            },
                            {
                                "type": "heading",
                                "value": "1. Architecture Overview",
                                "md": "# 1. Architecture Overview",
                                "bBox": {"x": 50.0, "y": 100.0, "w": 400.0, "h": 30.0},
                            },
                            {
                                "type": "table",
                                "value": "Element | Value\nServer | Linux",
                                "md": "| Element | Value |\n|---|---|\n| Server | Linux |",
                                "bBox": {"x": 50.0, "y": 150.0, "w": 500.0, "h": 120.0},
                            },
                        ],
                    }
                ]
            }
        ]

        normalized = _normalize_llama_parse_json(sample_json_response, Path("test.pdf"))

        assert len(normalized) == 1
        page1 = normalized[0]
        assert page1["page_number"] == 1
        assert page1["width"] == 600.0
        assert page1["height"] == 800.0

        elements = page1["elements"]
        assert len(elements) == 3

        # Header detection
        assert elements[0]["type"] == "header"

        # Heading element with markdown preserved
        assert elements[1]["type"] == "heading"
        assert elements[1]["text"] == "# 1. Architecture Overview"
        # Bbox is [x0, y0, x1, y1] with padding
        assert elements[1]["bbox"][0] <= 50.0
        assert elements[1]["bbox"][2] >= 450.0

        # Table element with rich markdown table structure
        assert elements[2]["type"] == "table"
        assert "| Element | Value |" in elements[2]["text"]

    def test_llama_parse_falls_back_to_pymupdf_on_cloud_failure(self, monkeypatch):
        monkeypatch.setenv("LLAMA_CLOUD_API_KEY", "mock_key")
        pdf_path = _find_test_pdf()

        # Simulate LlamaParse throwing a network or quota error

        with patch("llama_parse.LlamaParse") as mock_parser_class:
            mock_instance = MagicMock()
            mock_instance.get_json_result.side_effect = RuntimeError("Quota exceeded or network timeout")
            mock_parser_class.return_value = mock_instance

            # Fallback should kick in and successfully parse the PDF using PyMuPDF
            pages = extract_with_llama_parse(pdf_path)
            assert len(pages) > 0
            assert pages[0]["page_number"] == 1
