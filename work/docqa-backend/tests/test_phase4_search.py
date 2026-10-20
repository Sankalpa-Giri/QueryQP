import pytest
from app.models.document import QuestionPaper
from app.models.enums import ExamType, PublicationStatus, ReviewStatus, StageStatus
from app.models.question import Question, QuestionTopic, Topic
from app.models.subject import Subject


@pytest.fixture
def sample_question_bank(db_session):
    # 1. Create or get Subject
    subj = db_session.query(Subject).filter(Subject.code == "CS401").first()
    if not subj:
        subj = Subject(
            name="Operating Systems",
            code="CS401",
            department="Computer Science",
            semester=4,
            description="Core OS course",
        )
        db_session.add(subj)
        db_session.flush()

    # 2. Create or get QuestionPaper
    doc = db_session.query(QuestionPaper).filter(QuestionPaper.checksum == "checksum-12345").first()
    if not doc:
        doc = QuestionPaper(
            batch_id="batch-test-1",
            subject_id=subj.id,
            exam_year=2024,
            exam_type=ExamType.MIDSEM,
            filename="CS401_2024_Midsem.pdf",
            storage_key="documents/CS401_2024_Midsem.pdf",
            checksum="checksum-12345",
            page_count=2,
            parser_status=StageStatus.COMPLETED,
            extraction_status=StageStatus.COMPLETED,
            indexing_status=StageStatus.COMPLETED,
            publication_status=PublicationStatus.PUBLISHED,
        )
        db_session.add(doc)
        db_session.flush()


    # 3. Create Questions if not existing
    q1 = db_session.query(Question).filter(Question.document_id == doc.id, Question.question_number == "Q1").first()
    q2 = db_session.query(Question).filter(Question.document_id == doc.id, Question.question_number == "Q2").first()
    if not q1:
        q1 = Question(
            document_id=doc.id,
            subject_id=subj.id,
            question_number="Q1",
            question_text="Explain the Banker's Algorithm for deadlock avoidance with an example.",
            normalized_text="explain the banker's algorithm for deadlock avoidance with an example.",
            page_number=1,
            page_end=1,
            marks=10.0,
            review_status=ReviewStatus.APPROVED,
            publication_status=PublicationStatus.PUBLISHED,
        )
        q2 = Question(
            document_id=doc.id,
            subject_id=subj.id,
            question_number="Q2",
            question_text="Compare preemptive and non-preemptive CPU scheduling algorithms.",
            normalized_text="compare preemptive and non-preemptive cpu scheduling algorithms.",
            page_number=2,
            page_end=2,
            marks=5.0,
            review_status=ReviewStatus.PENDING,
            publication_status=PublicationStatus.DRAFT,
        )
        db_session.add_all([q1, q2])
        db_session.flush()

    # 4. Attach topic
    topic = db_session.query(Topic).filter(Topic.subject_id == subj.id, Topic.name == "Deadlock").first()
    if not topic:
        topic = Topic(subject_id=subj.id, name="Deadlock")
        db_session.add(topic)
        db_session.flush()
        db_session.add(QuestionTopic(question_id=q1.id, topic_id=topic.id))
    db_session.commit()



    return {
        "subject": subj,
        "document": doc,
        "q1": q1,
        "q2": q2,
        "topic": topic,
    }


class TestQuestionBankAndSearch:
    def test_admin_list_questions(self, client, admin_headers, sample_question_bank):
        res = client.get("/api/v1/admin/questions", headers=admin_headers)
        assert res.status_code == 200
        items = res.json()
        assert len(items) >= 2
        q1_item = next((i for i in items if i["question_number"] == "Q1"), None)
        assert q1_item is not None
        assert q1_item["marks"] == 10.0
        assert q1_item["subject_name"] == "Operating Systems"
        assert q1_item["exam_year"] == 2024
        assert q1_item["publication_status"] == "PUBLISHED"

    def test_admin_update_question(self, client, admin_headers, sample_question_bank):
        q2_id = sample_question_bank["q2"].id
        res = client.patch(
            f"/api/v1/admin/questions/{q2_id}",
            headers=admin_headers,
            json={
                "question_text": "Updated: Compare preemptive and non-preemptive CPU scheduling with Gantt charts.",
                "marks": 8.0,
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["marks"] == 8.0
        assert "Gantt charts" in data["question_text"]

    def test_admin_approve_and_publish_question(self, client, admin_headers, sample_question_bank):
        q2_id = sample_question_bank["q2"].id

        # Approve
        app_res = client.post(f"/api/v1/admin/questions/{q2_id}/approve", headers=admin_headers)
        assert app_res.status_code == 200
        assert app_res.json()["review_status"] == "APPROVED"

        # Publish
        pub_res = client.post(
            f"/api/v1/admin/questions/{q2_id}/publish",
            headers=admin_headers,
            json={"publish": True},
        )
        assert pub_res.status_code == 200
        assert pub_res.json()["publication_status"] == "PUBLISHED"

    def test_student_search_endpoint(self, client, sample_question_bank):
        subj_id = sample_question_bank["subject"].id

        # Search for deadlock questions
        res = client.post(
            "/api/v1/search",
            json={
                "query": "banker deadlock avoidance",
                "subject_id": subj_id,
                "exam_type": "MIDSEM",
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total_results"] >= 1
        top_match = data["results"][0]
        assert "banker" in top_match["question_text"].lower()
        assert top_match["exam_year"] == 2024
        assert top_match["subject_name"] == "Operating Systems"
        assert top_match["marks"] == 10.0

    def test_public_questions_retrieval(self, client, sample_question_bank):
        subj_id = sample_question_bank["subject"].id
        res = client.get(f"/api/v1/questions?subject_id={subj_id}")
        assert res.status_code == 200
        items = res.json()
        # All returned questions must be published
        assert all(item["publication_status"] == "PUBLISHED" for item in items)
