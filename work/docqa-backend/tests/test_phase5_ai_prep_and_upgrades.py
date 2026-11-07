import pytest
from app.ingestion.question_segmenter import _segment_from_markdown
from app.retrieval.hybrid_search import extract_nl_search_filters


class TestUpgradedFeaturesAndAIPrep:
    def test_markdown_page_marker_provenance(self):
        md = (
            "<!-- Page 1 -->\n\n"
            "Q1. Define AVL tree balance factor. [2 marks]\n\n"
            "<!-- Page 3 -->\n\n"
            "Q2. Explain Banker's algorithm for deadlock avoidance. [10 marks]"
        )
        questions = _segment_from_markdown(md)
        assert len(questions) == 2
        assert questions[0].page_number == 1
        assert questions[0].bbox is not None
        assert questions[1].page_number == 3
        assert questions[1].bbox is not None

    def test_nl_filter_extraction(self):
        hints = extract_nl_search_filters("Explain Q2(b) from 2023 endsem step by step")
        assert hints["year"] == 2023
        assert hints["exam_type"] == "ENDSEM"
        assert hints["question_number"] == "Q2(B)"

    def test_ai_prep_endpoints(self, client):
        # 1. Fetch active subjects
        subj_res = client.get("/api/v1/subjects")
        assert subj_res.status_code == 200
        subjects = subj_res.json()
        assert len(subjects) >= 1
        subj_id = subjects[0]["id"]

        # 2. Subject Analytics & Score Predictor
        ana_res = client.get(f"/api/v1/ai/subjects/{subj_id}/analytics")
        assert ana_res.status_code == 200
        ana_data = ana_res.json()
        assert ana_data["subject_id"] == subj_id
        assert len(ana_data["topics"]) >= 1

        # 3. Topic Quiz Generator
        quiz_res = client.post(
            "/api/v1/ai/quiz",
            json={"subject_id": subj_id, "num_questions": 5},
        )
        assert quiz_res.status_code == 200
        quiz_data = quiz_res.json()
        assert len(quiz_data["questions"]) == 5

        # 4. Mock Exam Paper Generator (Midsem 20M & Endsem 50M)
        mock_mid = client.post(
            "/api/v1/ai/mock-paper",
            json={"subject_id": subj_id, "exam_type": "MIDSEM"},
        )
        assert mock_mid.status_code == 200
        assert mock_mid.json()["total_marks"] == 20.0

        mock_end = client.post(
            "/api/v1/ai/mock-paper",
            json={"subject_id": subj_id, "exam_type": "ENDSEM"},
        )
        assert mock_end.status_code == 200
        assert mock_end.json()["total_marks"] == 50.0

        # 5. Conversational PYQ AI Assistant
        chat_res = client.post(
            "/api/v1/ai/chat",
            json={"message": "Explain linked list reversal and AVL rotations", "subject_id": subj_id},
        )
        assert chat_res.status_code == 200
        assert "answer" in chat_res.json()
