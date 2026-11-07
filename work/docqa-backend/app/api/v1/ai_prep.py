import json
import os
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.document import QuestionPaper
from app.models.enums import ExamType, PublicationStatus
from app.models.question import Question, Topic
from app.models.subject import Subject
from app.retrieval.hybrid_search import compute_repeat_clusters, search_pyqs
from app.services.subject_service import SUBJECT_TAXONOMY, classify_question_topics

router = APIRouter(prefix="/ai", tags=["student-ai-prep"])


# ----------------- Pydantic Models -----------------


class SolveQuestionResponse(BaseModel):
    question_id: str
    question_number: str
    question_text: str
    subject_name: str
    subject_code: str
    exam_year: int
    exam_type: str
    marks: float
    topics: list[str]
    repeat_count: int
    appearances: list[str]
    solution_steps: list[str]
    key_concepts: list[str]
    marking_scheme: list[str]
    full_explanation: str
    model_used: str


class PYQChatCitation(BaseModel):
    question_id: str
    document_id: str
    question_number: str
    subject_code: str
    exam_year: int
    exam_type: str
    page_number: int
    marks: float | None = None
    snippet: str


class PYQChatRequest(BaseModel):
    message: str = Field(min_length=2, max_length=1000)
    subject_id: str | None = None
    exam_type: str | None = None


class PYQChatResponse(BaseModel):
    answer: str
    citations: list[PYQChatCitation]
    repeat_summary: str
    suggested_followups: list[str]


class TopicAnalyticsItem(BaseModel):
    topic_name: str
    question_count: int
    total_marks: float
    weightage_percent: float
    priority_tier: str  # "HIGH YIELD", "CORE", "SUPPLEMENTARY"
    years_asked: list[int]
    sample_questions: list[dict[str, Any]]


class SubjectAnalyticsResponse(BaseModel):
    subject_id: str
    subject_name: str
    subject_code: str
    total_published_questions: int
    total_historical_marks: float
    distinct_papers_count: int
    topics: list[TopicAnalyticsItem]


class QuizQuestionItem(BaseModel):
    id: int
    topic: str
    difficulty: str
    question: str
    options: list[str]
    correct_index: int
    explanation: str
    source_pyq_ref: str


class QuizGenerateRequest(BaseModel):
    subject_id: str | None = None
    topic_name: str | None = None
    num_questions: int = Field(default=5, ge=3, le=10)


class QuizGenerateResponse(BaseModel):
    subject_name: str
    topic_focus: str
    questions: list[QuizQuestionItem]


class MockPaperQuestionItem(BaseModel):
    q_no: str
    section: str
    question_text: str
    marks: float
    topic: str
    source_ref: str
    solution_hint: str
    question_id: str | None = None
    document_id: str | None = None
    page_number: int = 1


class MockPaperRequest(BaseModel):
    subject_id: str
    exam_type: str = "ENDSEM"  # "MIDSEM" (20M) or "ENDSEM" (50M)


class MockPaperResponse(BaseModel):
    subject_id: str
    subject_name: str
    subject_code: str
    exam_type: str
    total_marks: float
    duration_minutes: int
    instructions: list[str]
    sections: list[dict[str, Any]]
    questions: list[MockPaperQuestionItem]


# ----------------- Helper Functions -----------------


def _try_groq_completion(system_prompt: str, user_prompt: str, max_tokens: int = 800) -> str | None:
    """Attempt Groq LLM call if GROQ_API_KEY is configured; return None on any error."""
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        from langchain_core.output_parsers import StrOutputParser
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_groq import ChatGroq

        llm = ChatGroq(
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            max_tokens=max_tokens,
            temperature=0.2,
        )
        prompt = ChatPromptTemplate.from_messages(
            [("system", system_prompt), ("human", "{user_input}")]
        )
        chain = prompt | llm | StrOutputParser()
        return chain.invoke({"user_input": user_prompt}).strip()
    except Exception:
        return None


def _build_structured_solution(
    q: Question,
    doc: QuestionPaper,
    subj: Subject,
    marks: float,
    topics: list[str],
    appearances: list[str],
) -> tuple[list[str], list[str], list[str], str, str]:
    """Generate step-by-step academic solution with Groq LLM or deterministic curriculum rubric."""
    topic_label = ", ".join(topics) if topics else subj.name
    tax_keywords: list[str] = []
    subj_tax = SUBJECT_TAXONOMY.get(subj.code.upper(), {})
    for t in topics:
        tax_keywords.extend(subj_tax.get(t, [])[:5])
    if not tax_keywords:
        for kw_list in list(subj_tax.values())[:2]:
            tax_keywords.extend(kw_list[:3])

    system_prompt = (
        "You are a senior university professor preparing model examination solutions for B.Tech Computer Science students. "
        "Provide a clear, rigorous step-by-step solution calibrated to the question's mark allocation."
    )
    user_prompt = (
        f"Subject: {subj.name} ({subj.code})\n"
        f"Exam: {doc.exam_year} {doc.exam_type.value}\n"
        f"Question ({marks} Marks): {q.question_text}\n"
        f"Syllabus Topics: {topic_label}\n\n"
        "Provide a structured model solution with:\n"
        "1. Core Definition / Principle\n"
        "2. Step-by-Step Derivation, Algorithm, or Architecture\n"
        "3. Worked Example / Complexity / Trade-offs\n"
        "4. Key Exam Takeaways"
    )

    llm_text = _try_groq_completion(system_prompt, user_prompt, max_tokens=900)
    if llm_text:
        lines = [l.strip() for l in llm_text.split("\n") if l.strip()]
        steps = lines[:6] if len(lines) >= 3 else [llm_text]
        model_used = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        full_exp = llm_text
    else:
        model_used = "QueryQP Academic Rubric Engine"
        kw_str = ", ".join(tax_keywords[:6]) if tax_keywords else topic_label
        if marks <= 2.0:
            steps = [
                f"1. Formal Definition: State the exact definition and primary purpose of {topic_label} in the context of {subj.name}.",
                f"2. Core Property / Formula: Highlight the governing equation, syntax, or invariant ({kw_str}) asked in {q.question_number}.",
                "3. Concise Example: Provide a 1-2 line illustrative example or complexity expression to secure full short-answer credit.",
            ]
        elif marks <= 5.0:
            steps = [
                f"1. Concept Overview: Define the foundational mechanism of {topic_label} and state its assumptions.",
                f"2. Algorithmic / Structural Steps: Break down the procedure or architecture using key terms ({kw_str}).",
                "3. Worked Trace / Diagram Sketch: Show a step-by-step state transition, dry run table, or labeled block diagram.",
                "4. Complexity & Edge Cases: Conclude with time/space complexity or practical trade-offs.",
            ]
        else:
            steps = [
                f"1. Theoretical Foundation: Introduce {topic_label} formally and state why it is critical in {subj.name} ({subj.code}).",
                f"2. Detailed Architecture / Algorithm: Present the complete multi-step workflow, mathematical formulation, or pseudocode covering {kw_str}.",
                "3. Comprehensive Worked Example: Solve the problem instance step by step with intermediate states clearly tabulated.",
                "4. Comparative Analysis & Proof: Contrast with alternative techniques and prove correctness or optimality.",
                "5. Summary & Real-World Application: Summarize performance bounds (best/average/worst case).",
            ]
        full_exp = "\n\n".join(steps)

    if marks <= 2.0:
        scheme = [
            f"1.0 Mark: Accurate technical definition / core statement of {topic_label}",
            f"{max(0.5, marks - 1.0):.1f} Mark(s): Correct formula, complexity, or illustrative example",
        ]
    elif marks <= 5.0:
        scheme = [
            f"1.5 Marks: Formal principle and clear problem setup for {topic_label}",
            "2.0 Marks: Step-by-step derivation, algorithm, or state diagram",
            f"{max(1.0, marks - 3.5):.1f} Marks: Worked example and complexity/trade-off justification",
        ]
    else:
        scheme = [
            f"2.0 Marks: Formal definition & theoretical framework of {topic_label}",
            "4.0 Marks: Complete algorithm / derivation / architectural diagram",
            "2.5 Marks: Step-by-step numerical trace or schema verification",
            f"{max(1.5, marks - 8.5):.1f} Marks: Complexity analysis, edge cases & comparison",
        ]

    concepts = list(dict.fromkeys((topics or [subj.name]) + tax_keywords[:5]))
    return steps, concepts, scheme, full_exp, model_used


# ----------------- Endpoints -----------------


@router.post("/questions/{question_id}/solve", response_model=SolveQuestionResponse)
def solve_question_endpoint(question_id: str, db: Session = Depends(get_db)) -> SolveQuestionResponse:
    """Generate a structured step-by-step solution, marking rubric, and repeat history for a PYQ."""
    row = (
        db.query(Question, QuestionPaper, Subject)
        .join(QuestionPaper, Question.document_id == QuestionPaper.id)
        .join(Subject, Question.subject_id == Subject.id)
        .filter(Question.id == question_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")

    q, doc, subj = row
    all_subj_rows = (
        db.query(Question, QuestionPaper, Subject)
        .join(QuestionPaper, Question.document_id == QuestionPaper.id)
        .join(Subject, Question.subject_id == Subject.id)
        .filter(
            Question.subject_id == subj.id,
            Question.publication_status == PublicationStatus.PUBLISHED,
        )
        .all()
    )
    repeat_map = compute_repeat_clusters([(q, doc, subj)], all_subj_rows)
    rep_cnt, rep_apps = repeat_map.get(q.id, (1, []))

    topics = list(q.topics or [])
    if not topics:
        topics = classify_question_topics(subj.code, q.question_text) or [subj.name]

    effective_marks = float(q.marks) if q.marks is not None else 5.0
    steps, concepts, scheme, full_exp, model_used = _build_structured_solution(
        q, doc, subj, effective_marks, topics, rep_apps
    )

    return SolveQuestionResponse(
        question_id=q.id,
        question_number=q.question_number,
        question_text=q.question_text,
        subject_name=subj.name,
        subject_code=subj.code,
        exam_year=doc.exam_year,
        exam_type=doc.exam_type.value if hasattr(doc.exam_type, "value") else str(doc.exam_type),
        marks=effective_marks,
        topics=topics,
        repeat_count=rep_cnt,
        appearances=rep_apps,
        solution_steps=steps,
        key_concepts=concepts,
        marking_scheme=scheme,
        full_explanation=full_exp,
        model_used=model_used,
    )


@router.post("/chat", response_model=PYQChatResponse)
def pyq_assistant_chat(payload: PYQChatRequest, db: Session = Depends(get_db)) -> PYQChatResponse:
    """Conversational AI assistant grounded in published university past papers."""
    eff_subj_id = payload.subject_id if payload.subject_id not in (None, "", "all", "ALL") else None
    eff_etype = payload.exam_type if payload.exam_type not in (None, "", "all", "ALL") else None

    hits = search_pyqs(
        db=db,
        query_text=payload.message,
        subject_id=eff_subj_id,
        exam_type=eff_etype,
        limit=6,
    )

    citations: list[PYQChatCitation] = []
    for h in hits[:5]:
        citations.append(
            PYQChatCitation(
                question_id=h.question_id,
                document_id=h.document_id,
                question_number=h.question_number,
                subject_code=h.subject_code,
                exam_year=h.exam_year,
                exam_type=h.exam_type,
                page_number=h.page_number,
                marks=h.marks,
                snippet=h.question_text[:200] + ("..." if len(h.question_text) > 200 else ""),
            )
        )

    if hits:
        years = sorted({h.exam_year for h in hits}, reverse=True)
        top_topics = list(dict.fromkeys(t for h in hits for t in (h.topics or [])))
        repeat_summary = (
            f"Matched {len(hits)} verified past paper question(s) across {', '.join(map(str, years))} "
            f"covering {', '.join(top_topics[:3]) if top_topics else hits[0].subject_name}."
        )

        context_block = "\n\n".join(
            f"[{h.exam_year} {h.exam_type} {h.question_number} | {h.marks or 5} Marks | Page {h.page_number}]: {h.question_text}"
            for h in hits[:4]
        )
        sys_prompt = (
            "You are the QueryQP KIIT University PYQ AI Assistant. Answer the student's query strictly using "
            "the retrieved Previous Year Questions below. Cite the exact exam year, session (Midsem/Endsem), "
            "and question number in your explanation, and provide a clear step-by-step solution."
        )
        usr_prompt = f"Student Question: {payload.message}\n\nRetrieved PYQs:\n{context_block}"
        llm_reply = _try_groq_completion(sys_prompt, usr_prompt, max_tokens=800)

        if not llm_reply:
            top = hits[0]
            q_row = db.query(Question).filter(Question.id == top.question_id).first()
            doc_row = db.query(QuestionPaper).filter(QuestionPaper.id == top.document_id).first()
            subj_row = db.query(Subject).filter(Subject.id == top.subject_id).first()
            if q_row and doc_row and subj_row:
                steps, _, scheme, _, _ = _build_structured_solution(
                    q_row, doc_row, subj_row, float(top.marks or 5.0), top.topics, top.appearances
                )
                steps_txt = "\n".join(steps)
                scheme_txt = " | ".join(scheme)
            else:
                steps_txt = "1. Define the core concept.\n2. Present the algorithm or derivation.\n3. Provide a worked example."
                scheme_txt = "5.0 Marks standard university rubric"

            past_list = "\n".join(
                f"• [{h.exam_year} {h.exam_type} • {h.question_number} • {h.marks or 5}M]: {h.question_text}"
                for h in hits[:3]
            )
            llm_reply = (
                f"Based on the indexed KIIT question bank, this topic appears in {len(hits)} past question(s), "
                f"most notably in {top.exam_year} {top.exam_type} ({top.question_number}, Page {top.page_number}).\n\n"
                f"Matching Past Exam Questions:\n{past_list}\n\n"
                f"Step-by-Step Solution Guide for {top.question_number}:\n{steps_txt}\n\n"
                f"Expected Marking Scheme: {scheme_txt}"
            )

        followups = [
            f"Solve {hits[0].question_number} from {hits[0].exam_year} {hits[0].exam_type} step by step",
            f"What are the highest weightage topics in {hits[0].subject_name}?",
            f"Generate a 5-mark practice question on {top_topics[0] if top_topics else hits[0].subject_name}",
        ]
    else:
        repeat_summary = "No direct exact-keyword paper match found in published filter scope; showing curriculum guidance."
        llm_reply = (
            f"No published question paper in the current filter scope directly matched '{payload.message}'. "
            "Try selecting 'All Subjects' or asking about core syllabus topics such as Linked Lists, AVL Trees, "
            "3NF/BCNF Normalization, Banker's Algorithm, CPU Scheduling, or Transformers."
        )
        followups = [
            "Show questions on Linked Lists and AVL Trees",
            "Explain Banker's Algorithm for deadlock avoidance",
            "Show 3NF and BCNF normalization questions",
        ]

    return PYQChatResponse(
        answer=llm_reply,
        citations=citations,
        repeat_summary=repeat_summary,
        suggested_followups=followups,
    )


@router.get("/subjects/{subject_id}/analytics", response_model=SubjectAnalyticsResponse)
def get_subject_analytics(subject_id: str, db: Session = Depends(get_db)) -> SubjectAnalyticsResponse:
    """Compute syllabus topic weightage percentages, mark distribution, and score prediction metrics."""
    subj = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found.")

    rows = (
        db.query(Question, QuestionPaper)
        .join(QuestionPaper, Question.document_id == QuestionPaper.id)
        .filter(
            Question.subject_id == subj.id,
            Question.publication_status == PublicationStatus.PUBLISHED,
        )
        .all()
    )

    taxonomy = SUBJECT_TAXONOMY.get(subj.code.upper(), {})
    topic_buckets: dict[str, dict[str, Any]] = {}

    # Seed buckets from taxonomy and DB topics so every subject has structured topics
    db_topics = db.query(Topic).filter(Topic.subject_id == subj.id).all()
    for t_name in list(taxonomy.keys()) + [t.name for t in db_topics]:
        if t_name not in topic_buckets:
            topic_buckets[t_name] = {
                "question_count": 0,
                "total_marks": 0.0,
                "years": set(),
                "samples": [],
            }

    total_marks_all = 0.0
    distinct_papers: set[str] = set()

    for q, doc in rows:
        distinct_papers.add(doc.id)
        q_marks = float(q.marks) if q.marks is not None else 5.0
        total_marks_all += q_marks

        q_topics = list(q.topics or [])
        if not q_topics:
            q_topics = classify_question_topics(subj.code, q.question_text)
        if not q_topics:
            q_topics = ["General Syllabus Concepts"]

        share_marks = q_marks / max(1, len(q_topics))
        for t_name in q_topics:
            if t_name not in topic_buckets:
                topic_buckets[t_name] = {
                    "question_count": 0,
                    "total_marks": 0.0,
                    "years": set(),
                    "samples": [],
                }
            b = topic_buckets[t_name]
            b["question_count"] += 1
            b["total_marks"] += share_marks
            b["years"].add(doc.exam_year)
            if len(b["samples"]) < 3:
                b["samples"].append(
                    {
                        "question_id": q.id,
                        "question_number": q.question_number,
                        "question_text": q.question_text,
                        "exam_year": doc.exam_year,
                        "exam_type": doc.exam_type.value if hasattr(doc.exam_type, "value") else str(doc.exam_type),
                        "marks": q_marks,
                    }
                )

    # If a subject has 0 published questions yet, provide baseline curriculum weightage distribution
    if total_marks_all == 0.0 and topic_buckets:
        n_top = len(topic_buckets)
        for idx, (t_name, b) in enumerate(topic_buckets.items()):
            default_m = 15.0 if idx < 3 else (10.0 if idx < 6 else 5.0)
            b["total_marks"] = default_m
            total_marks_all += default_m

    items: list[TopicAnalyticsItem] = []
    for t_name, b in topic_buckets.items():
        w_pct = round((b["total_marks"] / max(1.0, total_marks_all)) * 100.0, 1)
        if w_pct >= 14.0:
            tier = "HIGH YIELD"
        elif w_pct >= 8.0:
            tier = "CORE"
        else:
            tier = "SUPPLEMENTARY"

        items.append(
            TopicAnalyticsItem(
                topic_name=t_name,
                question_count=b["question_count"],
                total_marks=round(b["total_marks"], 1),
                weightage_percent=w_pct,
                priority_tier=tier,
                years_asked=sorted(b["years"], reverse=True),
                sample_questions=b["samples"],
            )
        )

    items.sort(key=lambda x: (x.weightage_percent, x.question_count), reverse=True)

    return SubjectAnalyticsResponse(
        subject_id=subj.id,
        subject_name=subj.name,
        subject_code=subj.code,
        total_published_questions=len(rows),
        total_historical_marks=round(total_marks_all, 1),
        distinct_papers_count=len(distinct_papers),
        topics=items,
    )


CURATED_QUIZ_BANK: dict[str, list[dict[str, Any]]] = {
    "CS201": [
        {
            "topic": "Linked Lists",
            "difficulty": "Medium",
            "question": "What is the time complexity to reverse a singly linked list of n nodes in-place using three pointers?",
            "options": ["O(1) time and O(1) space", "O(n) time and O(1) auxiliary space", "O(n log n) time and O(1) space", "O(n) time and O(n) stack space"],
            "correct_index": 1,
            "explanation": "Iterative pointer reversal traverses each of the n nodes exactly once using prev, curr, and next pointers, taking O(n) time and O(1) space.",
            "source_pyq_ref": "CS201 Past Midsem / Endsem Pattern",
        },
        {
            "topic": "AVL Trees",
            "difficulty": "Hard",
            "question": "Inserting keys 10, 20, 30 sequentially into an initially empty AVL tree triggers which rotation?",
            "options": ["LL (Right) Rotation", "RR (Left) Rotation", "LR (Left-Right) Rotation", "RL (Right-Left) Rotation"],
            "correct_index": 1,
            "explanation": "Inserting 10, 20, 30 creates a right-heavy chain (balance factor -2 at node 10), which is resolved by a single RR (Left) rotation around 10.",
            "source_pyq_ref": "CS201 Endsem Tree Balancing PYQ",
        },
        {
            "topic": "Sorting",
            "difficulty": "Medium",
            "question": "In QuickSort, when does the worst-case time complexity of O(n^2) occur?",
            "options": ["When the pivot always divides the array into two equal halves", "When the input array is already sorted and the first/last element is chosen as pivot", "When MergeSort is used for small subarrays", "When all elements are distinct"],
            "correct_index": 1,
            "explanation": "Choosing an extreme element on an already sorted array produces partitions of size 0 and n-1, yielding T(n) = T(n-1) + O(n) = O(n^2).",
            "source_pyq_ref": "CS201 Algorithm Complexity PYQ",
        },
        {
            "topic": "Hashing",
            "difficulty": "Medium",
            "question": "Which open-addressing collision resolution technique eliminates primary clustering?",
            "options": ["Linear Probing", "Quadratic Probing & Double Hashing", "Separate Chaining with Arrays", "FIFO Bucket Overflow"],
            "correct_index": 1,
            "explanation": "Linear probing suffers from primary clustering because consecutive slots coalesce; Quadratic Probing and Double Hashing disperse probe sequences.",
            "source_pyq_ref": "CS201 Hashing & Collisions PYQ",
        },
        {
            "topic": "Graphs",
            "difficulty": "Easy",
            "question": "Which data structure is used by Breadth-First Search (BFS) to traverse a graph of V vertices and E edges?",
            "options": ["Stack (LIFO)", "FIFO Queue", "Min-Heap Priority Queue", "Disjoint Set Union"],
            "correct_index": 1,
            "explanation": "BFS explores vertices level-by-level in order of distance from the source using a FIFO Queue in O(V + E) time.",
            "source_pyq_ref": "CS201 Graph Traversal PYQ",
        },
    ],
    "CS302": [
        {
            "topic": "Normalization",
            "difficulty": "Hard",
            "question": "A relation R is in Boyce-Codd Normal Form (BCNF) if and only if for every non-trivial functional dependency X -> Y:",
            "options": ["Y is a prime attribute", "X is a superkey of R", "No transitive dependency exists on non-prime attributes", "All attributes are atomic"],
            "correct_index": 1,
            "explanation": "BCNF is stricter than 3NF: every determinant X in a non-trivial dependency X -> Y must be a superkey of the relation.",
            "source_pyq_ref": "CS302 Normalization Endsem PYQ",
        },
        {
            "topic": "Transactions",
            "difficulty": "Easy",
            "question": "Which ACID property ensures that once a transaction commits, its changes persist even after a system crash?",
            "options": ["Atomicity", "Consistency", "Isolation", "Durability"],
            "correct_index": 3,
            "explanation": "Durability guarantees that committed updates are permanently recorded in non-volatile storage and write-ahead logs.",
            "source_pyq_ref": "CS302 ACID Transactions PYQ",
        },
        {
            "topic": "Concurrency Control",
            "difficulty": "Medium",
            "question": "How is Conflict Serializability of a concurrent transaction schedule verified?",
            "options": ["By checking if the Precedence (Serialization) Graph is acyclic (has no cycles)", "By checking if all transactions use shared locks only", "By verifying 1NF compliance", "By sorting timestamps in descending order"],
            "correct_index": 0,
            "explanation": "A schedule is conflict serializable iff its precedence graph is a Directed Acyclic Graph (DAG), which can be topologically sorted.",
            "source_pyq_ref": "CS302 Serializability PYQ",
        },
        {
            "topic": "Indexing",
            "difficulty": "Medium",
            "question": "Why are B+ Trees preferred over B-Trees for database disk indexing?",
            "options": ["B+ Trees store data pointers only at leaf nodes, allowing higher fan-out in internal nodes and linked sequential range scans", "B+ Trees do not require rebalancing", "B+ Trees work only in RAM", "B+ Trees use hashing instead of keys"],
            "correct_index": 0,
            "explanation": "Internal nodes in a B+ Tree hold only routing keys (maximizing branching factor), while leaf nodes are linked for fast range queries.",
            "source_pyq_ref": "CS302 Indexing & B+ Trees PYQ",
        },
        {
            "topic": "Functional Dependencies",
            "difficulty": "Medium",
            "question": "Given R(A,B,C,D) and FDs {A -> B, B -> C, C -> D}, what is the attribute closure A+ and candidate key?",
            "options": ["A+ = {A, B}, Candidate Key = AB", "A+ = {A, B, C, D}, Candidate Key = A", "A+ = {A, C, D}, Candidate Key = C", "A+ = {B, C, D}, Candidate Key = D"],
            "correct_index": 1,
            "explanation": "By transitivity (A -> B -> C -> D), A determines all attributes {A, B, C, D}, making A the sole candidate key.",
            "source_pyq_ref": "CS302 Midsem FD Closure PYQ",
        },
    ],
    "CS401": [
        {
            "topic": "Deadlocks",
            "difficulty": "Medium",
            "question": "Which algorithm is used for Deadlock Avoidance by testing whether resource allocation leaves the system in a Safe State?",
            "options": ["Peterson's Algorithm", "Banker's Safety & Resource-Request Algorithm", "Belady's Optimal Replacement", "Round Robin Scheduler"],
            "correct_index": 1,
            "explanation": "Dijkstra's Banker's Algorithm checks if a safe sequence <P1, P2, ..., Pn> exists before granting a resource request.",
            "source_pyq_ref": "CS401 Operating Systems Midsem PYQ",
        },
        {
            "topic": "CPU Scheduling",
            "difficulty": "Easy",
            "question": "Which CPU scheduling algorithm is provably optimal for minimizing average waiting time among a given set of processes?",
            "options": ["First-Come First-Served (FCFS)", "Shortest Job First (SJF / SRTF)", "Round Robin with large time quantum", "Multilevel Feedback Queue"],
            "correct_index": 1,
            "explanation": "Executing shorter bursts ahead of longer bursts reduces the waiting time of all subsequent jobs, making SJF/SRTF optimal.",
            "source_pyq_ref": "CS401 CPU Scheduling PYQ",
        },
        {
            "topic": "Virtual Memory",
            "difficulty": "Medium",
            "question": "What is Belady's Anomaly in page replacement algorithms?",
            "options": ["Page fault rate increases even when the number of allocated physical frames is increased (occurs in FIFO)", "CPU utilization drops due to excessive paging (Thrashing)", "Internal fragmentation in paging", "TLB miss penalty"],
            "correct_index": 0,
            "explanation": "FIFO page replacement does not satisfy the stack property, so adding more frames can paradoxically increase page faults.",
            "source_pyq_ref": "CS401 Virtual Memory Endsem PYQ",
        },
        {
            "topic": "Synchronization",
            "difficulty": "Medium",
            "question": "Which three requirements must any valid solution to the Critical Section Problem satisfy?",
            "options": ["Mutual Exclusion, Progress, and Bounded Waiting", "Hold and Wait, No Preemption, and Circular Wait", "Paging, Segmentation, and Swapping", "Atomicity, Consistency, and Isolation"],
            "correct_index": 0,
            "explanation": "A correct synchronization protocol guarantees Mutual Exclusion, Progress (no deadlock when CS is free), and Bounded Waiting (no starvation).",
            "source_pyq_ref": "CS401 Synchronization PYQ",
        },
        {
            "topic": "Memory Management",
            "difficulty": "Easy",
            "question": "What is the role of the Translation Lookaside Buffer (TLB) in paged memory management?",
            "options": ["A fast associative hardware cache that stores recent virtual-to-physical page frame translations", "A disk swap space manager", "A semaphore queue for blocked threads", "An interrupt vector table"],
            "correct_index": 0,
            "explanation": "The TLB caches page table entries in hardware so effective memory access time (EMAT) avoids a second main-memory lookup on TLB hits.",
            "source_pyq_ref": "CS401 Memory Management PYQ",
        },
    ],
}


@router.post("/quiz", response_model=QuizGenerateResponse)
def generate_topic_quiz(payload: QuizGenerateRequest, db: Session = Depends(get_db)) -> QuizGenerateResponse:
    """Generate an interactive MCQ quiz grounded in subject PYQs and syllabus topics."""
    subj: Subject | None = None
    if payload.subject_id and payload.subject_id not in ("", "all", "ALL"):
        subj = db.query(Subject).filter(Subject.id == payload.subject_id).first()
    if not subj:
        subj = db.query(Subject).filter(Subject.is_active.is_(True)).order_by(Subject.code.asc()).first()

    subj_name = subj.name if subj else "Computer Science & Engineering"
    subj_code = subj.code.upper() if subj else "CS201"
    topic_focus = payload.topic_name.strip() if payload.topic_name else "All Core Syllabus Units"

    # Build quiz from curated bank + dynamically synthesized questions from published PYQs in DB
    base_items = list(CURATED_QUIZ_BANK.get(subj_code, CURATED_QUIZ_BANK["CS201"]))
    if payload.topic_name:
        filtered = [q for q in base_items if payload.topic_name.lower() in q["topic"].lower()]
        if filtered:
            base_items = filtered + [q for q in base_items if q not in filtered]

    # Also inspect real published questions for this subject to create authentic PYQ-linked MCQs
    if subj:
        pub_rows = (
            db.query(Question, QuestionPaper)
            .join(QuestionPaper, Question.document_id == QuestionPaper.id)
            .filter(
                Question.subject_id == subj.id,
                Question.publication_status == PublicationStatus.PUBLISHED,
            )
            .order_by(QuestionPaper.exam_year.desc())
            .limit(5)
            .all()
        )
        for q_row, doc_row in pub_rows:
            q_top = (q_row.topics or [subj_name])[0]
            if payload.topic_name and payload.topic_name.lower() not in q_top.lower() and payload.topic_name.lower() not in q_row.question_text.lower():
                continue
            etype = doc_row.exam_type.value if hasattr(doc_row.exam_type, "value") else str(doc_row.exam_type)
            base_items.insert(
                0,
                {
                    "topic": q_top,
                    "difficulty": "Medium" if (q_row.marks or 5) <= 5 else "Hard",
                    "question": f"[From {doc_row.exam_year} {etype} {q_row.question_number}] Which of the following is the primary technical requirement when answering: '{q_row.question_text[:140]}'?",
                    "options": [
                        f"Provide the formal algorithmic/structural model of {q_top}, step-by-step trace, and time/space complexity bounds",
                        "Provide only an unverified high-level summary without mathematical or structural justification",
                        "Ignore boundary conditions and edge-case constraints",
                        "Assume exponential complexity without analyzing auxiliary structures",
                    ],
                    "correct_index": 0,
                    "explanation": f"In KIIT {doc_row.exam_year} {etype} ({q_row.question_number}, {q_row.marks or 5} Marks), full credit requires formal definition of {q_top}, step-by-step trace/diagram, and complexity analysis.",
                    "source_pyq_ref": f"{doc_row.exam_year} {etype} • {q_row.question_number} (Page {q_row.page_number})",
                },
            )

    selected = base_items[: payload.num_questions]
    quiz_questions = [
        QuizQuestionItem(
            id=idx + 1,
            topic=item["topic"],
            difficulty=item["difficulty"],
            question=item["question"],
            options=item["options"],
            correct_index=item["correct_index"],
            explanation=item["explanation"],
            source_pyq_ref=item["source_pyq_ref"],
        )
        for idx, item in enumerate(selected)
    ]

    return QuizGenerateResponse(
        subject_name=f"{subj_name} ({subj_code})",
        topic_focus=topic_focus,
        questions=quiz_questions,
    )


@router.post("/mock-paper", response_model=MockPaperResponse)
def generate_mock_exam_paper(payload: MockPaperRequest, db: Session = Depends(get_db)) -> MockPaperResponse:
    """Generate a KIIT-pattern Midsem (20M) or Endsem (50M) mock question paper grounded in published PYQs."""
    subj = db.query(Subject).filter(Subject.id == payload.subject_id).first()
    if not subj:
        subj = db.query(Subject).filter(Subject.is_active.is_(True)).first()
    if not subj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found.")

    etype = payload.exam_type.strip().upper()
    if etype not in ("MIDSEM", "ENDSEM"):
        etype = "ENDSEM"

    is_midsem = etype == "MIDSEM"
    total_marks = 20.0 if is_midsem else 50.0
    duration = 90 if is_midsem else 180

    pub_rows = (
        db.query(Question, QuestionPaper)
        .join(QuestionPaper, Question.document_id == QuestionPaper.id)
        .filter(
            Question.subject_id == subj.id,
            Question.publication_status == PublicationStatus.PUBLISHED,
        )
        .order_by(QuestionPaper.exam_year.desc())
        .all()
    )

    taxonomy_topics = list(SUBJECT_TAXONOMY.get(subj.code.upper(), {}).keys()) or [
        "Unit 1: Core Foundations",
        "Unit 2: Algorithms & Design",
        "Unit 3: System Analysis",
        "Unit 4: Advanced Applications",
    ]

    mock_questions: list[MockPaperQuestionItem] = []

    # Section A: Short compulsory conceptual questions (5 x 1M = 5M for Midsem, 10 x 1M = 10M for Endsem)
    sec_a_count = 5 if is_midsem else 10
    short_pool = [(q, d) for q, d in pub_rows if (q.marks or 5.0) <= 2.0]
    other_pool = [(q, d) for q, d in pub_rows if (q.marks or 5.0) > 2.0]

    for i in range(sec_a_count):
        q_label = f"Q1({chr(ord('a') + i)})"
        top_name = taxonomy_topics[i % len(taxonomy_topics)]
        if i < len(short_pool):
            q_obj, d_obj = short_pool[i]
            q_txt = q_obj.question_text
            src_ref = f"{d_obj.exam_year} {d_obj.exam_type.value} ({q_obj.question_number})"
            q_id, d_id, p_num = q_obj.id, d_obj.id, q_obj.page_number
        else:
            q_txt = f"Define the core principle of {top_name} and state its primary complexity or invariant in {subj.name}."
            src_ref = f"KIIT {subj.code} High-Yield Syllabus Pattern"
            q_id, d_id, p_num = None, None, 1

        mock_questions.append(
            MockPaperQuestionItem(
                q_no=q_label,
                section="SECTION - A (Compulsory Short Answer Questions)",
                question_text=q_txt,
                marks=1.0,
                topic=top_name,
                source_ref=src_ref,
                solution_hint=f"State formal definition of {top_name} (0.5M) + key equation/property or example (0.5M).",
                question_id=q_id,
                document_id=d_id,
                page_number=p_num,
            )
        )

    # Section B: Long analytical questions (3 x 5M = 15M for Midsem, 4 x 10M = 40M for Endsem)
    sec_b_count = 3 if is_midsem else 4
    sec_b_marks = 5.0 if is_midsem else 10.0
    long_candidates = other_pool + short_pool

    for j in range(sec_b_count):
        q_label = f"Q{j + 2}"
        top_name = taxonomy_topics[(j + 1) % len(taxonomy_topics)]
        if j < len(long_candidates):
            q_obj, d_obj = long_candidates[j]
            q_txt = q_obj.question_text
            src_ref = f"{d_obj.exam_year} {d_obj.exam_type.value} ({q_obj.question_number}, Page {q_obj.page_number})"
            q_id, d_id, p_num = q_obj.id, d_obj.id, q_obj.page_number
            top_name = (q_obj.topics or [top_name])[0]
        else:
            q_txt = (
                f"Explain the architecture and step-by-step algorithm of {top_name} with a complete worked example "
                f"and analyze its performance trade-offs in {subj.name}."
            )
            src_ref = f"KIIT {subj.code} Predicted High-Weightage Question"
            q_id, d_id, p_num = None, None, 1

        mock_questions.append(
            MockPaperQuestionItem(
                q_no=q_label,
                section="SECTION - B (Analytical & Problem-Solving Questions)",
                question_text=q_txt,
                marks=sec_b_marks,
                topic=top_name,
                source_ref=src_ref,
                solution_hint=(
                    f"1. Concept & Formal Model of {top_name} (2M) | "
                    f"2. Step-by-Step Algorithm / Derivation (4M) | "
                    f"3. Worked Trace & Complexity Analysis ({sec_b_marks - 6.0 if sec_b_marks > 6 else 1.0:.0f}M)."
                ),
                question_id=q_id,
                document_id=d_id,
                page_number=p_num,
            )
        )

    sections_meta = [
        {
            "name": "SECTION - A",
            "description": f"Answer ALL {sec_a_count} short-answer sub-questions ({sec_a_count} x 1 = {sec_a_count} Marks)",
            "marks": float(sec_a_count),
        },
        {
            "name": "SECTION - B",
            "description": f"Answer ALL {sec_b_count} analytical questions ({sec_b_count} x {int(sec_b_marks)} = {int(sec_b_count * sec_b_marks)} Marks)",
            "marks": float(sec_b_count * sec_b_marks),
        },
    ]

    instructions = [
        f"KALINGA INSTITUTE OF INDUSTRIAL TECHNOLOGY (KIIT-DU) — {etype} EXAMINATION",
        f"Course: {subj.name} ({subj.code}) | Full Marks: {int(total_marks)} | Time: {duration // 60} Hours {duration % 60 if duration % 60 else ''}".strip(),
        "Answer all parts of Section A together in sequential order.",
        "Support all Section B answers with clear diagrams, state tables, or complexity proofs.",
    ]

    return MockPaperResponse(
        subject_id=subj.id,
        subject_name=subj.name,
        subject_code=subj.code,
        exam_type=etype,
        total_marks=total_marks,
        duration_minutes=duration,
        instructions=instructions,
        sections=sections_meta,
        questions=mock_questions,
    )
