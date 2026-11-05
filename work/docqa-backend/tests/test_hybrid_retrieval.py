import unittest
from pathlib import Path
import tempfile
import sqlite3

from app.query_processing import process_student_query
from app.retrieval.keyword_store import index_keyword_chunks, search_keyword_chunks
from app.retrieval.hybrid_graph import (
    reciprocal_rank_fusion,
    retrieve_candidate_chunks,
    candidate_fusion_node,
    RetrievalState,
)


class KeywordStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_keywords.db"
        self.sample_chunks = [
            {
                "chunk_id": "doc1:chunk:1",
                "document_id": "doc-alpha",
                "text": "TCP Reno utilizes additive increase and multiplicative decrease for congestion avoidance.",
                "page_number": 1,
                "bbox": [10.0, 20.0, 100.0, 200.0],
                "source_element_ids": ["el1"],
            },
            {
                "chunk_id": "doc1:chunk:2",
                "document_id": "doc-alpha",
                "text": "Deadlock prevention eliminates at least one of the four Coffman conditions.",
                "page_number": 2,
                "bbox": [15.0, 25.0, 150.0, 250.0],
                "source_element_ids": ["el2"],
            },
            {
                "chunk_id": "doc2:chunk:1",
                "document_id": "doc-beta",
                "text": "Virtual memory segmentation partitions address space into variable-sized segments.",
                "page_number": 3,
                "bbox": [5.0, 15.0, 80.0, 180.0],
                "source_element_ids": ["el3"],
            },
        ]
        index_keyword_chunks(self.sample_chunks, db_path=self.db_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_indexes_and_retrieves_by_keyword(self) -> None:
        query = process_student_query("How does TCP Reno handle congestion avoidance?")
        results = search_keyword_chunks(query, limit=5, db_path=self.db_path)

        self.assertGreater(len(results), 0)
        top_chunk = results[0]
        self.assertEqual(top_chunk["chunk_id"], "doc1:chunk:1")
        self.assertEqual(top_chunk["page_number"], 1)
        self.assertIn("additive increase", top_chunk["text"])

    def test_respects_document_id_filter(self) -> None:
        # Search for a general term present in doc-alpha with filter set to doc-beta
        query = process_student_query("prevention and congestion")
        results = search_keyword_chunks(query, document_id="doc-beta", limit=5, db_path=self.db_path)

        # doc-alpha chunks should be excluded by the filter
        for r in results:
            self.assertEqual(r["document_id"], "doc-beta")

    def test_matches_exact_quoted_phrases(self) -> None:
        query = process_student_query('Tell me about "Deadlock prevention"')
        results = search_keyword_chunks(query, limit=5, db_path=self.db_path)

        self.assertGreater(len(results), 0)
        self.assertEqual(results[0]["chunk_id"], "doc1:chunk:2")

    def test_handles_empty_or_stop_word_only_gracefully(self) -> None:
        # When query terms are stop-words, fallback to normalized text safely
        query = process_student_query("What is it?")
        results = search_keyword_chunks(query, limit=5, db_path=self.db_path)
        # Shouldn't raise any sqlite error
        self.assertIsInstance(results, list)


class ReciprocalRankFusionTests(unittest.TestCase):
    def test_rrf_scoring_and_deduplication(self) -> None:
        list_vector = [
            {"chunk_id": "c1", "text": "Chunk 1", "page_number": 1, "bbox": [0, 0, 1, 1], "source_element_ids": []},
            {"chunk_id": "c2", "text": "Chunk 2", "page_number": 2, "bbox": [0, 0, 1, 1], "source_element_ids": []},
        ]
        list_keyword = [
            {"chunk_id": "c2", "text": "Chunk 2", "page_number": 2, "bbox": [0, 0, 1, 1], "source_element_ids": []},
            {"chunk_id": "c3", "text": "Chunk 3", "page_number": 3, "bbox": [0, 0, 1, 1], "source_element_ids": []},
        ]

        # c2 is rank 2 in vector (1/(60+2) = 1/62) and rank 1 in keyword (1/(60+1) = 1/61)
        # c1 is rank 1 in vector only (1/61)
        # c3 is rank 2 in keyword only (1/62)
        # c2 should have the highest fused score!
        fused = reciprocal_rank_fusion([list_vector, list_keyword], k=60, limit=3)

        self.assertEqual(len(fused), 3)
        self.assertEqual(fused[0]["chunk_id"], "c2")
        self.assertEqual(fused[1]["chunk_id"], "c1")
        self.assertEqual(fused[2]["chunk_id"], "c3")

        expected_c2_score = round((1.0 / 62) + (1.0 / 61), 5)
        self.assertAlmostEqual(fused[0]["score"], expected_c2_score, places=4)

    def test_rrf_respects_limit(self) -> None:
        list_a = [{"chunk_id": f"chunk_{i}", "text": f"Text {i}"} for i in range(10)]
        fused = reciprocal_rank_fusion([list_a], limit=3)
        self.assertEqual(len(fused), 3)


class HybridGraphPipelineTests(unittest.TestCase):
    def test_candidate_fusion_node(self) -> None:
        state: RetrievalState = {
            "question": "What is memory segmentation?",
            "document_id": None,
            "limit": 2,
            "processed_query": None,
            "vector_results": [
                {"chunk_id": "c1", "text": "text1", "page_number": 1, "bbox": [0, 0, 1, 1], "source_element_ids": []}
            ],
            "keyword_results": [
                {"chunk_id": "c1", "text": "text1", "page_number": 1, "bbox": [0, 0, 1, 1], "source_element_ids": []},
                {"chunk_id": "c2", "text": "text2", "page_number": 2, "bbox": [0, 0, 1, 1], "source_element_ids": []}
            ],
            "candidate_chunks": [],
        }

        output = candidate_fusion_node(state)
        self.assertIn("candidate_chunks", output)
        candidates = output["candidate_chunks"]
        self.assertEqual(len(candidates), 2)
        self.assertEqual(candidates[0]["chunk_id"], "c1")


if __name__ == "__main__":
    unittest.main()
