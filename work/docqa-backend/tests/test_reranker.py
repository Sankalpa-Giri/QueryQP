import unittest

from app.retrieval.reranker import rerank_chunks
from app.retrieval.hybrid_graph import reranker_node, RetrievalState


class RerankerTests(unittest.TestCase):
    def test_rerank_discriminates_relevance(self) -> None:
        query = "How does TCP handle congestion control?"

        candidates = [
            {
                "chunk_id": "chunk:distractor",
                "document_id": "doc1",
                "text": "The delivery company opened a window of time to control shipping and handle customer requests.",
                "page_number": 1,
                "bbox": [10.0, 10.0, 100.0, 100.0],
                "source_element_ids": ["el1"],
            },
            {
                "chunk_id": "chunk:relevant",
                "document_id": "doc1",
                "text": "TCP regulates network congestion using a congestion window, slow start, and additive-increase multiplicative-decrease (AIMD).",
                "page_number": 2,
                "bbox": [20.0, 20.0, 200.0, 200.0],
                "source_element_ids": ["el2"],
            },
        ]

        reranked = rerank_chunks(query=query, chunks=candidates, top_k=2)

        self.assertEqual(len(reranked), 2)
        # Relevant chunk must rank first
        self.assertEqual(reranked[0]["chunk_id"], "chunk:relevant")
        self.assertGreater(reranked[0]["score"], reranked[1]["score"])
        # Scores should be normalized probabilities between 0 and 1
        self.assertGreater(reranked[0]["score"], 0.5)
        self.assertIn("raw_score", reranked[0])

    def test_rerank_preserves_metadata_and_truncates(self) -> None:
        query = "What is deadlock prevention?"
        candidates = [
            {
                "chunk_id": f"chunk:{i}",
                "document_id": "doc_test",
                "text": f"Operating system concept number {i} discussing process scheduling and resources.",
                "page_number": i,
                "bbox": [float(i), 10.0, 50.0, 60.0],
                "source_element_ids": [f"el_{i}"],
            }
            for i in range(1, 6)
        ]

        reranked = rerank_chunks(query=query, chunks=candidates, top_k=3)

        self.assertEqual(len(reranked), 3)
        # Verify scores are sorted in descending order
        scores = [chunk["score"] for chunk in reranked]
        self.assertEqual(scores, sorted(scores, reverse=True))

        # Check metadata preservation
        top_chunk = reranked[0]
        self.assertIn("chunk_id", top_chunk)
        self.assertIn("page_number", top_chunk)
        self.assertIn("bbox", top_chunk)
        self.assertIn("source_element_ids", top_chunk)

    def test_reranker_handles_empty_inputs(self) -> None:
        self.assertEqual(rerank_chunks("query", [], top_k=5), [])
        chunks = [{"chunk_id": "c1", "text": "hello"}]
        self.assertEqual(rerank_chunks("", chunks, top_k=1), chunks)

    def test_reranker_node_in_pipeline_state(self) -> None:
        state: RetrievalState = {
            "question": "What is paging?",
            "document_id": None,
            "limit": 1,
            "processed_query": None,
            "vector_results": [],
            "keyword_results": [],
            "candidate_chunks": [
                {"chunk_id": "c1", "text": "Paging is a memory management scheme eliminating the need for contiguous allocation.", "page_number": 1, "bbox": [0,0,1,1], "source_element_ids": []},
                {"chunk_id": "c2", "text": "Database indexing speeds up search queries on large tables.", "page_number": 2, "bbox": [0,0,1,1], "source_element_ids": []},
            ],
            "top_relevant_chunks": [],
        }

        result = reranker_node(state)
        self.assertIn("top_relevant_chunks", result)
        top_chunks = result["top_relevant_chunks"]
        self.assertEqual(len(top_chunks), 1)
        self.assertEqual(top_chunks[0]["chunk_id"], "c1")


if __name__ == "__main__":
    unittest.main()
