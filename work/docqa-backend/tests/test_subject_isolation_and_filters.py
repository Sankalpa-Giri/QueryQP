import pytest
from app.models.batch import QuestionPaperBatch
from app.models.document import QuestionPaper
from app.models.enums import BatchStatus, ExamType, PublicationStatus, ReviewStatus, StageStatus
from app.models.question import Question, QuestionTopic, Topic
from app.models.subject import Subject


@pytest.fixture
def multi_subject_fixtures(db_session):
    """Seed two distinct subjects (Data Structures and DBMS) with distinct papers and questions."""
    ds_subj = db_session.query(Subject).filter(Subject.code == "CS_DS_TEST").first()
    dbms_subj = db_session.query(Subject).filter(Subject.code == "CS_DBMS_TEST").first()

    if ds_subj and dbms_subj:
        batch = db_session.query(QuestionPaperBatch).filter(QuestionPaperBatch.admin_id == "admin-test").first()
        doc_ds_2024 = db_session.query(QuestionPaper).filter(QuestionPaper.checksum == "chk-ds-2024").first()
        doc_ds_2022 = db_session.query(QuestionPaper).filter(QuestionPaper.checksum == "chk-ds-2022").first()
        doc_dbms_2023 = db_session.query(QuestionPaper).filter(QuestionPaper.checksum == "chk-dbms-2023").first()
        return {
            "ds": ds_subj,
            "dbms": dbms_subj,
            "batch": batch,
            "doc_ds_2024": doc_ds_2024,
            "doc_ds_2022": doc_ds_2022,
            "doc_dbms_2023": doc_dbms_2023,
        }

    # 1. Subjects
    ds_subj = Subject(
        name="Data Structures Test",
        code="CS_DS_TEST",
        department="Computer Science",
        semester=3,
        is_active=True,
    )
    dbms_subj = Subject(
        name="Database Systems Test",
        code="CS_DBMS_TEST",
        department="Computer Science",
        semester=4,
        is_active=True,
    )
    db_session.add_all([ds_subj, dbms_subj])
    db_session.flush()


    # 2. Batch
    batch = QuestionPaperBatch(
        admin_id="admin-test",
        status=BatchStatus.COMPLETED,
        total_files=3,
        processed_count=3,
        failed_count=0,
    )
    db_session.add(batch)
    db_session.flush()

    # 3. Question Papers: DS 2024 Endsem, DS 2022 Midsem, DBMS 2023 Endsem
    doc_ds_2024 = QuestionPaper(
        batch_id=batch.id,
        subject_id=ds_subj.id,
        exam_year=2024,
        exam_type=ExamType.ENDSEM,
        filename="DS_2024_Endsem.pdf",
        storage_key="docs/ds_2024.pdf",
        checksum="chk-ds-2024",
        page_count=3,
        parser_status=StageStatus.COMPLETED,
        extraction_status=StageStatus.COMPLETED,
        indexing_status=StageStatus.COMPLETED,
        publication_status=PublicationStatus.PUBLISHED,
    )
    doc_ds_2022 = QuestionPaper(
        batch_id=batch.id,
        subject_id=ds_subj.id,
        exam_year=2022,
        exam_type=ExamType.MIDSEM,
        filename="DS_2022_Midsem.pdf",
        storage_key="docs/ds_2022.pdf",
        checksum="chk-ds-2022",
        page_count=2,
        parser_status=StageStatus.COMPLETED,
        extraction_status=StageStatus.COMPLETED,
        indexing_status=StageStatus.COMPLETED,
        publication_status=PublicationStatus.PUBLISHED,
    )
    doc_dbms_2023 = QuestionPaper(
        batch_id=batch.id,
        subject_id=dbms_subj.id,
        exam_year=2023,
        exam_type=ExamType.ENDSEM,
        filename="DBMS_2023_Endsem.pdf",
        storage_key="docs/dbms_2023.pdf",
        checksum="chk-dbms-2023",
        page_count=2,
        parser_status=StageStatus.COMPLETED,
        extraction_status=StageStatus.COMPLETED,
        indexing_status=StageStatus.COMPLETED,
        publication_status=PublicationStatus.PUBLISHED,
    )
    db_session.add_all([doc_ds_2024, doc_ds_2022, doc_dbms_2023])
    db_session.flush()

    # 4. Questions
    # DS Questions
    q_ds_1 = Question(
        document_id=doc_ds_2024.id,
        subject_id=ds_subj.id,
        question_number="Q1(a)",
        question_text="Write a C function to reverse a singly linked list in O(n) time.",
        normalized_text="write a c function to reverse a singly linked list in o(n) time.",
        page_number=1,
        page_end=1,
        marks=5.0,
        topics=["Linked Lists"],
        review_status=ReviewStatus.APPROVED,
        publication_status=PublicationStatus.PUBLISHED,
    )
    q_ds_2 = Question(
        document_id=doc_ds_2022.id,
        subject_id=ds_subj.id,
        question_number="Q2",
        question_text="Explain insertion and deletion operations in a circular linked list.",
        normalized_text="explain insertion and deletion operations in a circular linked list.",
        page_number=1,
        page_end=1,
        marks=8.0,
        topics=["Linked Lists"],
        review_status=ReviewStatus.APPROVED,
        publication_status=PublicationStatus.PUBLISHED,
    )
    q_ds_3 = Question(
        document_id=doc_ds_2024.id,
        subject_id=ds_subj.id,
        question_number="Q3",
        question_text="Construct an AVL tree for the following key sequence: 10, 20, 30, 40, 50.",
        normalized_text="construct an avl tree for the following key sequence: 10, 20, 30, 40, 50.",
        page_number=2,
        page_end=2,
        marks=10.0,
        topics=["Trees", "AVL Trees"],
        review_status=ReviewStatus.APPROVED,
        publication_status=PublicationStatus.PUBLISHED,
    )

    # DBMS Questions
    q_dbms_1 = Question(
        document_id=doc_dbms_2023.id,
        subject_id=dbms_subj.id,
        question_number="Q1",
        question_text="Explain 3NF and BCNF normalization with suitable relational schema examples.",
        normalized_text="explain 3nf and bcnf normalization with suitable relational schema examples.",
        page_number=1,
        page_end=1,
        marks=10.0,
        topics=["Normalization"],
        review_status=ReviewStatus.APPROVED,
        publication_status=PublicationStatus.PUBLISHED,
    )
    q_dbms_2 = Question(
        document_id=doc_dbms_2023.id,
        subject_id=dbms_subj.id,
        question_number="Q2",
        question_text="What are ACID properties of database transactions? Explain serializability.",
        normalized_text="what are acid properties of database transactions explain serializability.",
        page_number=2,
        page_end=2,
        marks=8.0,
        topics=["Transactions", "Concurrency Control"],
        review_status=ReviewStatus.APPROVED,
        publication_status=PublicationStatus.PUBLISHED,
    )

    db_session.add_all([q_ds_1, q_ds_2, q_ds_3, q_dbms_1, q_dbms_2])
    db_session.flush()

    # 5. Topics
    top_ll = Topic(subject_id=ds_subj.id, name="Linked Lists")
    top_trees = Topic(subject_id=ds_subj.id, name="AVL Trees")
    top_norm = Topic(subject_id=dbms_subj.id, name="Normalization")
    top_txn = Topic(subject_id=dbms_subj.id, name="Transactions")
    db_session.add_all([top_ll, top_trees, top_norm, top_txn])
    db_session.flush()

    db_session.add_all([
        QuestionTopic(question_id=q_ds_1.id, topic_id=top_ll.id),
        QuestionTopic(question_id=q_ds_2.id, topic_id=top_ll.id),
        QuestionTopic(question_id=q_ds_3.id, topic_id=top_trees.id),
        QuestionTopic(question_id=q_dbms_1.id, topic_id=top_norm.id),
        QuestionTopic(question_id=q_dbms_2.id, topic_id=top_txn.id),
    ])
    db_session.commit()

    return {
        "ds": ds_subj,
        "dbms": dbms_subj,
        "batch": batch,
        "doc_ds_2024": doc_ds_2024,
        "doc_ds_2022": doc_ds_2022,
        "doc_dbms_2023": doc_dbms_2023,
    }


class TestSubjectIsolationAndFilters:
    def test_strict_subject_isolation_ds_query_under_dbms(self, client, multi_subject_fixtures):
        """When student selects DBMS and searches 'linked list', zero results must be returned."""
        dbms_id = multi_subject_fixtures["dbms"].id
        res = client.post(
            "/api/v1/search",
            json={"query": "linked list", "subject_id": dbms_id},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total_results"] == 0
        assert len(data["results"]) == 0
        assert "Database Systems Test" in data["message"]
        assert "No questions matching 'linked list' were found" in data["message"]

    def test_strict_subject_isolation_dbms_query_under_ds(self, client, multi_subject_fixtures):
        """When student selects DS and searches 'normalization', zero results must be returned."""
        ds_id = multi_subject_fixtures["ds"].id
        res = client.post(
            "/api/v1/search",
            json={"query": "normalization 3NF", "subject_id": ds_id},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total_results"] == 0
        assert len(data["results"]) == 0
        assert "Data Structures Test" in data["message"]
        assert "No questions matching 'normalization 3NF' were found" in data["message"]

    def test_successful_scoped_search(self, client, multi_subject_fixtures):
        """When student selects DS and searches 'linked list', only DS questions are returned."""
        ds_id = multi_subject_fixtures["ds"].id
        res = client.post(
            "/api/v1/search",
            json={"query": "linked list", "subject_id": ds_id},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total_results"] == 2
        for q in data["results"]:
            assert q["subject_id"] == ds_id
            assert "linked list" in q["question_text"].lower()

    def test_all_subjects_search(self, client, multi_subject_fixtures):
        """When subject_id is None or 'all', search retrieves from any subject."""
        res = client.post(
            "/api/v1/search",
            json={"query": "linked list", "subject_id": None},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total_results"] >= 2
        assert any(r["subject_name"] == "Data Structures Test" for r in data["results"])

    def test_year_range_filter_and_boundaries(self, client, multi_subject_fixtures):
        """Year range filter limits results strictly within [from_year, to_year]."""
        ds_id = multi_subject_fixtures["ds"].id

        # 2024 only
        res_2024 = client.post(
            "/api/v1/search",
            json={"query": "linked list", "subject_id": ds_id, "from_year": 2024, "to_year": 2024},
        )
        assert res_2024.status_code == 200
        data_2024 = res_2024.json()
        assert data_2024["total_results"] == 1
        assert data_2024["results"][0]["exam_year"] == 2024

        # 2022 only
        res_2022 = client.post(
            "/api/v1/search",
            json={"query": "linked list", "subject_id": ds_id, "from_year": 2022, "to_year": 2022},
        )
        assert res_2022.status_code == 200
        data_2022 = res_2022.json()
        assert data_2022["total_results"] == 1
        assert data_2022["results"][0]["exam_year"] == 2022

        # 2020-2021 (no papers in range)
        res_empty = client.post(
            "/api/v1/search",
            json={"query": "linked list", "subject_id": ds_id, "from_year": 2020, "to_year": 2021},
        )
        assert res_empty.status_code == 200
        data_empty = res_empty.json()
        assert data_empty["total_results"] == 0
        assert "within the selected examination type or academic year range" in data_empty["message"]

    def test_invalid_year_range_rejection(self, client, multi_subject_fixtures):
        """Invalid year range where from_year > to_year must return HTTP 422."""
        res = client.post(
            "/api/v1/search",
            json={"query": "linked list", "from_year": 2025, "to_year": 2020},
        )
        assert res.status_code == 422
        assert "Invalid academic year range" in res.json()["detail"]

    def test_exam_type_filtering(self, client, multi_subject_fixtures):
        """Filter by MIDSEM, ENDSEM, and ALL."""
        ds_id = multi_subject_fixtures["ds"].id

        # MIDSEM only
        res_mid = client.post(
            "/api/v1/search",
            json={"query": "linked list", "subject_id": ds_id, "exam_type": "MIDSEM"},
        )
        assert res_mid.status_code == 200
        assert res_mid.json()["total_results"] == 1
        assert res_mid.json()["results"][0]["exam_type"] == "MIDSEM"

        # ENDSEM only
        res_end = client.post(
            "/api/v1/search",
            json={"query": "linked list", "subject_id": ds_id, "exam_type": "ENDSEM"},
        )
        assert res_end.status_code == 200
        assert res_end.json()["total_results"] == 1
        assert res_end.json()["results"][0]["exam_type"] == "ENDSEM"

        # ALL
        res_all = client.post(
            "/api/v1/search",
            json={"query": "linked list", "subject_id": ds_id, "exam_type": "ALL"},
        )
        assert res_all.status_code == 200
        assert res_all.json()["total_results"] == 2

        # Invalid exam_type
        res_invalid = client.post(
            "/api/v1/search",
            json={"query": "linked list", "subject_id": ds_id, "exam_type": "INVALID_EXAM"},
        )
        assert res_invalid.status_code == 422
        assert "Invalid exam_type" in res_invalid.json()["detail"]

    def test_subject_topics_endpoint(self, client, multi_subject_fixtures):
        """GET /api/v1/subjects/{id}/topics returns structured taxonomy with counts."""
        ds_id = multi_subject_fixtures["ds"].id
        res = client.get(f"/api/v1/subjects/{ds_id}/topics")
        assert res.status_code == 200
        topics = res.json()
        assert len(topics) >= 2
        ll_topic = next((t for t in topics if t["name"] == "Linked Lists"), None)
        assert ll_topic is not None
        assert ll_topic["question_count"] == 2

        # Non-existent subject
        res_404 = client.get("/api/v1/subjects/00000000-0000-0000-0000-000000000000/topics")
        assert res_404.status_code == 404

    def test_suggestions_endpoint(self, client, multi_subject_fixtures):
        """GET /api/v1/search/suggestions handles both scoped and cross-curriculum queries."""
        ds_id = multi_subject_fixtures["ds"].id

        # Scoped to DS
        res_ds = client.get(f"/api/v1/search/suggestions?subject_id={ds_id}")
        assert res_ds.status_code == 200
        data_ds = res_ds.json()
        assert data_ds["subject_name"] == "Data Structures Test"
        assert "Linked Lists" in data_ds["suggestions"]

        # Cross-curriculum
        res_cross = client.get("/api/v1/search/suggestions")
        assert res_cross.status_code == 200
        data_cross = res_cross.json()
        assert len(data_cross["suggestions"]) >= 5

        # Non-existent subject
        res_404 = client.get("/api/v1/search/suggestions?subject_id=00000000-0000-0000-0000-000000000000")
        assert res_404.status_code == 404

    def test_admin_process_triggers(self, client, admin_headers, multi_subject_fixtures):
        """Admin can trigger processing explicitly on a document and a batch."""
        doc_id = multi_subject_fixtures["doc_ds_2024"].id
        batch_id = multi_subject_fixtures["batch"].id

        # 1. Trigger document process
        res_doc = client.post(f"/api/v1/admin/documents/{doc_id}/process", headers=admin_headers)
        assert res_doc.status_code == 200
        assert res_doc.json()["document_id"] == doc_id

        # 2. Trigger batch process
        res_batch = client.post(f"/api/v1/admin/batches/{batch_id}/process", headers=admin_headers)
        assert res_batch.status_code == 200
        assert res_batch.json()["id"] == batch_id
        assert len(res_batch.json()["documents"]) >= 3

        # 3. 404 on missing document/batch
        res_doc_404 = client.post("/api/v1/admin/documents/00000000-0000-0000-0000-000000000000/process", headers=admin_headers)
        assert res_doc_404.status_code == 404

        res_batch_404 = client.post("/api/v1/admin/batches/00000000-0000-0000-0000-000000000000/process", headers=admin_headers)
        assert res_batch_404.status_code == 404
