import unittest

from app.llm.prompts import build_structured_prompt
from app.query_processing.models import SearchIntent


class StructuredPromptBuilderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.mock_chunks = [
            {
                "chunk_id": "chunk:1",
                "page_number": 1,
                "text": "TCP is connection-oriented, whereas UDP is connectionless.",
            }
        ]

    def test_builds_comparison_prompt(self) -> None:
        prompt = build_structured_prompt(
            question="Compare TCP vs UDP",
            chunks=self.mock_chunks,
            intent=SearchIntent.COMPARISON,
        )
        self.assertIn("COMPARISON", prompt)
        self.assertIn("SOURCE_ID: chunk:1", prompt)
        self.assertIn("QUESTION:\nCompare TCP vs UDP", prompt)

    def test_builds_lookup_prompt(self) -> None:
        prompt = build_structured_prompt(
            question="Find the definition of port 80",
            chunks=self.mock_chunks,
            intent=SearchIntent.LOOKUP,
        )
        self.assertIn("LOOKUP", prompt)
        self.assertIn("direct, concise", prompt)

    def test_builds_explanation_prompt(self) -> None:
        prompt = build_structured_prompt(
            question="Explain how three-way handshake works",
            chunks=self.mock_chunks,
            intent=SearchIntent.EXPLANATION,
        )
        self.assertIn("EXPLANATION", prompt)
        self.assertIn("educational clarity", prompt)


if __name__ == "__main__":
    unittest.main()
