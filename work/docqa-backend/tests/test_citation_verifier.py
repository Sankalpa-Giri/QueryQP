import unittest

from app.llm.citation_verifier import verify_and_assemble_citations


class CitationVerifierTests(unittest.TestCase):
    def setUp(self) -> None:
        self.mock_chunks = [
            {
                "chunk_id": "doc1:chunk:1",
                "document_id": "doc1",
                "text": "Deadlock prevention requires negating at least one of the Coffman conditions: mutual exclusion, hold and wait, no preemption, circular wait.",
                "page_number": 2,
                "page_width": 612.0,
                "page_height": 792.0,
                "bbox": [50.0, 100.0, 500.0, 200.0],
                "source_element_ids": ["el1"],
            },
            {
                "chunk_id": "doc1:chunk:2",
                "document_id": "doc1",
                "text": "Banker's algorithm is an avoidance technique that checks for a safe state before granting resource allocation.",
                "page_number": 3,
                "page_width": 612.0,
                "page_height": 792.0,
                "bbox": [60.0, 120.0, 520.0, 220.0],
                "source_element_ids": ["el2"],
            },
        ]

    def test_verifies_valid_citation_and_formats_for_reader(self) -> None:
        raw_answer = "Deadlock prevention eliminates one of Coffman conditions [doc1:chunk:1]."
        result = verify_and_assemble_citations(raw_answer, self.mock_chunks)

        self.assertTrue(result.is_grounded)
        self.assertEqual(len(result.citations), 1)
        self.assertEqual(result.citations[0].page_number, 2)
        self.assertEqual(result.citations[0].bbox, [50.0, 100.0, 500.0, 200.0])
        self.assertEqual(result.citations[0].page_width, 612.0)
        self.assertIn("[Page 2]", result.formatted_answer)
        self.assertNotIn("doc1:chunk:1", result.formatted_answer)

    def test_rejects_hallucinated_chunk_ids(self) -> None:
        raw_answer = "Paging uses a page table [fake:doc:999] while deadlock uses Coffman conditions [doc1:chunk:1]."
        result = verify_and_assemble_citations(raw_answer, self.mock_chunks)

        self.assertIn("fake:doc:999", result.rejected_ids)
        self.assertIn("doc1:chunk:1", result.verified_ids)
        self.assertEqual(len(result.citations), 1)
        self.assertNotIn("fake:doc:999", result.formatted_answer)
        self.assertIn("[Page 2]", result.formatted_answer)

    def test_rejects_ungrounded_citations(self) -> None:
        # The cited statement talks about databases/SQL which has zero overlap with the cited OS deadlock chunk
        raw_answer = "Relational SQL databases use foreign keys to enforce referential integrity [doc1:chunk:1]."
        result = verify_and_assemble_citations(raw_answer, self.mock_chunks)

        # Should be rejected because claim has zero grounding in the deadlock chunk
        self.assertIn("doc1:chunk:1", result.rejected_ids)
        self.assertEqual(len(result.citations), 0)

    def test_handles_empty_chunks_gracefully(self) -> None:
        result = verify_and_assemble_citations("Some answer [doc1:chunk:1]", [])
        self.assertFalse(result.is_grounded)
        self.assertEqual(len(result.citations), 0)


if __name__ == "__main__":
    unittest.main()
