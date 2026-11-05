import io
import pytest
from app.ingestion.providers import ParsedDocumentResult, ParsedElement, ParsedPage
from app.ingestion.question_segmenter import (
    _segment_from_markdown,
    extract_marks,
    normalize_query_text,
    segment_questions_from_parsed,
    union_bboxes,
)


class TestQuestionSegmentation:
    def test_extract_marks(self):
        assert extract_marks("Explain Dijkstra's algorithm. [10 marks]") == 10.0
        assert extract_marks("What is binary search tree? (5 Marks)") == 5.0
        assert extract_marks("State Master Theorem. [7.5 pts]") == 7.5
        assert extract_marks("No marks mentioned here.") is None

    def test_normalize_query_text(self):
        raw = "  What   is   QUICKSORT? \n\n Explain its worst-case complexity!  "
        normalized = normalize_query_text(raw)
        assert "what is quicksort?" in normalized
        assert "  " not in normalized

    def test_union_bboxes(self):
        boxes = [
            [50.0, 100.0, 200.0, 150.0],
            [50.0, 160.0, 250.0, 220.0],
        ]
        union = union_bboxes(boxes)
        assert union == [50.0, 100.0, 250.0, 220.0]

    def test_segment_from_markdown_fallback(self):
        md = (
            "Q1. Explain QuickSort and its time complexity in average and worst case. [5 marks]\n\n"
            "Q2. What is an AVL tree? How is balancing achieved through rotations? [10 marks]\n\n"
            "Q3. Describe the Floyd-Warshall algorithm for all-pairs shortest paths. [8 marks]"
        )
        questions = _segment_from_markdown(md)
        assert len(questions) == 3
        assert questions[0].question_number.upper().startswith("Q1")
        assert questions[0].marks == 5.0
        assert "QuickSort" in questions[0].question_text
        assert questions[1].question_number.upper().startswith("Q2")
        assert questions[1].marks == 10.0
        assert questions[2].marks == 8.0

    def test_segment_from_parsed_document(self):
        page1 = ParsedPage(
            page_number=1,
            width=612.0,
            height=792.0,
            elements=[
                ParsedElement(
                    id="el1",
                    type="question",
                    text="Q1. Explain the differences between BFS and DFS. [6 Marks]",
                    bbox=[50.0, 50.0, 500.0, 100.0],
                    page_number=1,
                ),
                ParsedElement(
                    id="el2",
                    type="question",
                    text="Q2. Write an algorithm to detect a cycle in a directed graph. [8 Marks]",
                    bbox=[50.0, 120.0, 500.0, 180.0],
                    page_number=1,
                ),
            ],
        )
        doc = ParsedDocumentResult(
            page_count=1,
            markdown="Q1. ...\n\nQ2. ...",
            pages=[page1],
        )
        questions = segment_questions_from_parsed(doc)
        assert len(questions) == 2
        assert questions[0].marks == 6.0
        assert questions[1].marks == 8.0
        assert questions[0].bbox == [50.0, 50.0, 500.0, 100.0]



class TestBulkUploadAndBatchProcessing:
    @pytest.fixture
    def test_subject(self, client, admin_headers):
        res = client.post(
            "/api/v1/admin/subjects",
            headers=admin_headers,
            json={
                "name": "Design and Analysis of Algorithms",
                "code": "CS301",
                "department": "Computer Science",
                "semester": 5,
                "description": "Core algorithms course",
            },
        )
        assert res.status_code in (201, 400)
        # Fetch subject list to get the id
        list_res = client.get("/api/v1/subjects")
        subjects = list_res.json()
        subject = next((s for s in subjects if s["code"] == "CS301"), None)
        assert subject is not None
        return subject

    def test_bulk_upload_and_duplicate_detection(self, client, admin_headers, test_subject):
        pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000117 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n187\n%%EOF"

        file_payload = ("CS301_2023_Midsem.pdf", io.BytesIO(pdf_content), "application/pdf")

        # 1. First upload
        res = client.post(
            "/api/v1/admin/documents/upload",
            headers=admin_headers,
            files={"files": file_payload},
            data={
                "subject_id": test_subject["id"],
                "exam_year": "2023",
                "exam_type": "MIDSEM",
                "parser_type": "pymupdf",
            },
        )
        assert res.status_code == 201
        batch_data = res.json()
        assert batch_data["total_files"] == 1
        batch_id = batch_data["id"]
        doc_id = batch_data["documents"][0]["id"]

        # 2. Query batch status
        batch_res = client.get(f"/api/v1/admin/batches/{batch_id}", headers=admin_headers)
        assert batch_res.status_code == 200
        assert batch_res.json()["id"] == batch_id

        # 3. Query document status
        doc_res = client.get(f"/api/v1/admin/documents/{doc_id}/status", headers=admin_headers)
        assert doc_res.status_code == 200

        # 4. Duplicate upload attempt with identical checksum, subject, year, exam_type
        file_payload_dup = ("CS301_2023_Midsem_copy.pdf", io.BytesIO(pdf_content), "application/pdf")
        dup_res = client.post(
            "/api/v1/admin/documents/upload",
            headers=admin_headers,
            files={"files": file_payload_dup},
            data={
                "subject_id": test_subject["id"],
                "exam_year": "2023",
                "exam_type": "MIDSEM",
                "parser_type": "pymupdf",
            },
        )
        assert dup_res.status_code == 409
        assert "duplicate" in dup_res.json()["detail"].lower()

