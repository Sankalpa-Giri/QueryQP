import re
import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.document import QuestionPaper
from app.models.question import Question, QuestionTopic, Topic
from app.models.subject import Subject
from app.schemas.subject import SubjectCreate, SubjectResponse, SubjectUpdate, TopicResponse



def list_subjects(db: Session, active_only: bool = True) -> list[SubjectResponse]:
    """Retrieve subjects with paper and question counts."""
    query = db.query(Subject)
    if active_only:
        query = query.filter(Subject.is_active.is_(True))

    subjects = query.order_by(Subject.name.asc()).all()
    results: list[SubjectResponse] = []

    for s in subjects:
        paper_cnt = db.query(func.count(QuestionPaper.id)).filter(QuestionPaper.subject_id == s.id).scalar() or 0
        question_cnt = db.query(func.count(Question.id)).filter(Question.subject_id == s.id).scalar() or 0
        resp = SubjectResponse.model_validate(s)
        resp.paper_count = paper_cnt
        resp.question_count = question_cnt
        results.append(resp)

    return results


def get_subject_by_id(subject_id: str, db: Session) -> Subject:
    """Fetch subject by ID or raise 404."""
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found.")
    return subject


def create_subject(data: SubjectCreate, db: Session) -> SubjectResponse:
    """Create a new subject ensuring uniqueness of subject code."""
    normalized_code = data.code.strip().upper()
    existing = db.query(Subject).filter(func.upper(Subject.code) == normalized_code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Subject with code '{normalized_code}' already exists.",
        )

    subject = Subject(
        name=data.name.strip(),
        code=normalized_code,
        department=data.department.strip() if data.department else None,
        semester=data.semester,
        description=data.description.strip() if data.description else None,
        is_active=True,
    )
    db.add(subject)
    db.commit()
    db.refresh(subject)
    resp = SubjectResponse.model_validate(subject)
    resp.paper_count = 0
    resp.question_count = 0
    return resp


def update_subject(subject_id: str, data: SubjectUpdate, db: Session) -> SubjectResponse:
    """Update subject properties or active status."""
    subject = get_subject_by_id(subject_id, db)

    if data.name is not None:
        subject.name = data.name.strip()
    if data.code is not None:
        normalized_code = data.code.strip().upper()
        existing = db.query(Subject).filter(Subject.code == normalized_code, Subject.id != subject.id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Subject code '{normalized_code}' is already assigned to '{existing.name}'.",
            )
        subject.code = normalized_code
    if data.department is not None:
        subject.department = data.department.strip() if data.department else None
    if data.semester is not None:
        subject.semester = data.semester
    if data.description is not None:
        subject.description = data.description.strip() if data.description else None
    if data.is_active is not None:
        subject.is_active = data.is_active

    db.commit()
    db.refresh(subject)

    paper_cnt = db.query(func.count(QuestionPaper.id)).filter(QuestionPaper.subject_id == subject.id).scalar() or 0
    question_cnt = db.query(func.count(Question.id)).filter(Question.subject_id == subject.id).scalar() or 0
    resp = SubjectResponse.model_validate(subject)
    resp.paper_count = paper_cnt
    resp.question_count = question_cnt
    return resp


def delete_subject_permanent(subject_id: str, db: Session) -> dict:
    """Permanently delete a subject if no question papers are attached to it."""
    subject = get_subject_by_id(subject_id, db)
    paper_cnt = db.query(QuestionPaper).filter(QuestionPaper.subject_id == subject.id).count()
    if paper_cnt > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete subject '{subject.name}' because {paper_cnt} question papers are attached to it. Please deactivate the subject instead or delete its question papers first.",
        )
    # Delete associated topics
    db.query(Topic).filter(Topic.subject_id == subject.id).delete()
    db.delete(subject)
    db.commit()
    return {"status": "ok", "message": f"Subject '{subject.name}' deleted successfully"}



def deactivate_subject(subject_id: str, db: Session) -> SubjectResponse:
    """Deactivate subject to prevent new uploads while preserving historical data."""
    return update_subject(subject_id, SubjectUpdate(is_active=False), db)


def list_subject_topics(subject_id: str, db: Session) -> list[TopicResponse]:
    """Retrieve structured topic taxonomy for a subject with question counts."""
    subject = get_subject_by_id(subject_id, db)
    topics = db.query(Topic).filter(Topic.subject_id == subject.id).order_by(Topic.name.asc()).all()

    results: list[TopicResponse] = []
    for t in topics:
        q_cnt = db.query(func.count(QuestionTopic.id)).filter(QuestionTopic.topic_id == t.id).scalar() or 0
        resp = TopicResponse.model_validate(t)
        resp.question_count = q_cnt
        results.append(resp)

    return results


DEFAULT_SUBJECTS = [
    {
        "name": "Data Structures",
        "code": "CS201",
        "department": "Computer Science & Engineering",
        "semester": 3,
        "description": "Arrays, Stacks, Queues, Linked Lists, Trees, Graphs, Hashing, Sorting, and Algorithm Complexity.",
    },
    {
        "name": "Database Management Systems",
        "code": "CS302",
        "department": "Computer Science & Engineering",
        "semester": 4,
        "description": "Relational Model, SQL, Relational Algebra, Normalization, ACID Transactions, Concurrency Control, and Indexing.",
    },
    {
        "name": "Operating System",
        "code": "CS401",
        "department": "Computer Science & Engineering",
        "semester": 4,
        "description": "Processes, Threads, CPU Scheduling, Synchronization, Deadlocks, Memory Management, Virtual Memory, and File Systems.",
    },
    {
        "name": "Software Engineering",
        "code": "CS303",
        "department": "Computer Science & Engineering",
        "semester": 5,
        "description": "Software Development Life Cycle (SDLC), Agile Scrum, System Modeling, Architecture, Testing Strategies, and Maintenance.",
    },
    {
        "name": "Natural Language Processing",
        "code": "CS504",
        "department": "Computer Science & Engineering",
        "semester": 6,
        "description": "Text Processing, N-gram Language Models, Part-of-Speech Tagging, Parsing, Sentiment Analysis, Word Embeddings, and Transformers.",
    },
]

SUBJECT_TAXONOMY: dict[str, dict[str, list[str]]] = {
    "CS201": {
        "Arrays": ["array", "arrays", "subarrays", "multidimensional array", "matrix representation"],
        "Linked Lists": ["linked list", "linked lists", "singly linked", "doubly linked", "circular linked", "node pointer", "head pointer", "next pointer", "self-referential structure"],
        "Stacks": ["stack", "stacks", "push", "pop", "lifo", "postfix", "prefix", "infix", "parentheses matching", "balanced parentheses"],
        "Queues": ["queue", "queues", "enqueue", "dequeue", "fifo", "circular queue", "double ended queue", "deque", "priority queue"],
        "Trees": ["binary tree", "tree traversal", "inorder", "preorder", "postorder", "height of tree", "root node", "leaf node", "binary trees", "trees", "tree"],
        "Binary Search Trees": ["binary search tree", "binary search trees", "bst", "inorder traversal bst", "search tree"],
        "AVL Trees": ["avl tree", "avl trees", "avl", "balance factor", "ll rotation", "rr rotation", "lr rotation", "rl rotation", "balanced search tree"],
        "Graphs": ["graph", "graphs", "breadth first search", "depth first search", "bfs", "dfs", "dijkstra", "minimum spanning tree", "mst", "kruskal", "prim", "topological sort", "adjacency matrix", "adjacency list"],
        "Hashing": ["hashing", "hash table", "hash tables", "hash function", "hash collision", "collision resolution", "open addressing", "linear probing", "quadratic probing", "double hashing", "chaining"],
        "Sorting": ["sorting", "sort", "quicksort", "merge sort", "bubble sort", "insertion sort", "selection sort", "radix sort", "heap sort", "sorting algorithm", "sorted order"],
        "Searching": ["searching", "search", "binary search", "linear search", "interpolation search", "search algorithm"],
        "Heaps": ["heap", "heaps", "max-heap", "min-heap", "max heap", "min heap", "heapify", "heapsort", "binary heap"],
    },
    "CS302": {
        "ER Model": ["er model", "entity relationship", "entity-relationship", "er diagram", "entity set", "relationship set", "cardinality ratio", "weak entity"],
        "Relational Algebra": ["relational algebra", "relational calculus", "tuple relational", "domain relational", "select operator", "project operator", "cartesian product", "theta join", "natural join"],
        "Functional Dependencies": ["functional dependency", "functional dependencies", "attribute closure", "armstrong's axioms", "armstrong axioms", "canonical cover", "minimal cover"],
        "Normalization": ["normalization", "normal form", "1nf", "2nf", "3nf", "bcnf", "4nf", "5nf", "lossless decomposition", "dependency preservation"],
        "Transactions": ["transaction", "transactions", "acid properties", "atomicity", "consistency", "isolation", "durability", "commit", "rollback", "savepoint"],
        "Concurrency Control": ["concurrency control", "serializability", "conflict serializable", "view serializable", "two-phase locking", "2pl", "timestamp ordering", "deadlock detection", "deadlock prevention"],
        "Indexing": ["indexing", "index", "indices", "b+ tree", "b+ trees", "b-tree", "b-trees", "dense index", "sparse index", "primary index", "clustering index", "hash index"],
        "SQL": ["sql", "select statement", "group by", "having clause", "nested subquery", "correlated query", "ddl", "dml", "dcl", "foreign key", "join query"],
        "Query Optimization": ["query optimization", "query optimizer", "query tree", "relational algebra optimization", "cost-based optimization", "heuristic optimization", "evaluation plan"],
    },
    "CS401": {
        "Processes": ["process", "processes", "process control block", "pcb", "fork", "exec", "process state", "context switch", "inter-process communication", "ipc"],
        "Threads": ["thread", "threads", "multithreading", "user-level thread", "kernel-level thread", "pthread", "hyper-threading"],
        "CPU Scheduling": ["cpu scheduling", "scheduling algorithm", "round robin", "first come first served", "fcfs", "shortest job first", "sjf", "srtf", "priority scheduling", "multilevel queue", "turnaround time", "waiting time"],
        "Synchronization": ["process synchronization", "synchronization", "critical section", "semaphore", "semaphores", "mutex", "peterson's algorithm", "race condition", "monitor", "dining philosophers", "readers writers"],
        "Deadlocks": ["deadlock", "deadlocks", "banker's algorithm", "deadlock prevention", "deadlock avoidance", "deadlock detection", "deadlock recovery", "resource allocation graph", "safe state", "starvation"],
        "Memory Management": ["memory management", "paging", "segmentation", "internal fragmentation", "external fragmentation", "page table", "mmu", "contiguous memory", "buddy system"],
        "Virtual Memory": ["virtual memory", "demand paging", "page fault", "page replacement", "fifo page replacement", "lru", "belady's anomaly", "thrashing", "translation lookaside buffer", "tlb", "working set"],
        "File Systems": ["file system", "file systems", "directory structure", "file allocation table", "fat", "inode", "indexed allocation", "linked allocation", "disk scheduling", "fcfs disk", "sstf", "scan", "c-scan", "look"],
    },
    "CS303": {
        "SDLC": ["sdlc", "software development life cycle", "waterfall model", "spiral model", "v-model", "incremental model", "prototyping model", "rad model"],
        "Agile Scrum": ["agile", "scrum", "sprint", "kanban", "user stories", "product backlog", "sprint backlog", "daily standup", "scrum master", "velocity"],
        "Requirements Engineering": ["requirements engineering", "software requirements specification", "srs", "functional requirements", "non-functional requirements", "feasibility study", "elicitation", "traceability matrix"],
        "System Modeling": ["system modeling", "unified modeling language", "uml", "use case diagram", "class diagram", "sequence diagram", "activity diagram", "state chart", "data flow diagram", "dfd"],
        "Software Architecture": ["software architecture", "architectural styles", "microservices", "monolithic", "model-view-controller", "mvc", "client-server", "layered architecture", "design patterns", "gof patterns"],
        "Software Testing": ["software testing", "test cases", "unit testing", "integration testing", "system testing", "acceptance testing", "black-box testing", "white-box testing", "cyclomatic complexity", "basis path testing", "regression testing"],
        "Software Maintenance": ["software maintenance", "corrective maintenance", "adaptive maintenance", "perfective maintenance", "preventive maintenance", "software reengineering", "reverse engineering", "code refactoring"],
    },
    "CS504": {
        "Text Processing": ["tokenization", "lemmatization", "stemming", "porter stemmer", "stop word removal", "regular expression", "edit distance", "levenshtein distance", "text normalization", "byte pair encoding", "bpe"],
        "N-gram Language Models": ["n-gram", "language model", "language models", "unigram", "bigram", "trigram", "perplexity", "laplace smoothing", "add-one smoothing", "good-turing", "kneser-ney"],
        "Part-of-Speech Tagging": ["pos tagging", "part-of-speech", "pos tagger", "hidden markov model", "hmm", "viterbi algorithm", "maximum entropy markov model", "memm", "crf", "conditional random fields"],
        "Syntactic Parsing": ["syntactic parsing", "syntax tree", "context-free grammar", "cfg", "chomsky normal form", "cnf", "cyk algorithm", "cocke-younger-kasami", "dependency parsing", "shift-reduce parsing"],
        "Word Embeddings": ["word embeddings", "word embedding", "distributed representations", "word2vec", "skip-gram", "continuous bag of words", "cbow", "glove", "fasttext", "vector space model"],
        "Transformers": ["transformer", "transformers", "self-attention", "multi-head attention", "scaled dot-product", "bert", "gpt", "roberta", "t5", "encoder-decoder", "positional encoding"],
        "Sentiment Analysis": ["sentiment analysis", "opinion mining", "text classification", "polarity classification", "vader", "naive bayes classifier", "subjectivity analysis"],
    },
}


def classify_question_topics(subject_code: str, text: str) -> list[str]:
    """Identify matched curriculum topics for question text based on subject taxonomy."""
    tax = SUBJECT_TAXONOMY.get(subject_code.upper())
    if not tax:
        return []

    text_lower = text.lower()
    matched: list[str] = []

    for topic_name, keywords in tax.items():
        for kw in keywords:
            pattern = r"\b" + re.escape(kw.lower()) + r"\b"
            if re.search(pattern, text_lower):
                matched.append(topic_name)
                break

    return matched


def assign_question_topics(db: Session, question: Question, subject: Subject | None = None) -> list[str]:
    """Classify and persist topic tags and QuestionTopic associations for a question, preserving existing tags."""
    if not subject:
        subject = db.query(Subject).filter(Subject.id == question.subject_id).first()
    if not subject:
        return []

    # Preserve any existing tags (added manually or during staging review)
    existing_topics: list[str] = [t.strip() for t in (question.topics or []) if t and t.strip()]

    matched_names = classify_question_topics(subject.code, question.question_text)
    if not matched_names and question.normalized_text:
        matched_names = classify_question_topics(subject.code, question.normalized_text)

    # Union existing tags with auto-matched taxonomy topics (existing tags preserved first)
    combined = list(dict.fromkeys(existing_topics + matched_names))

    # Persist in question JSON
    question.topics = combined

    # Clean old associations
    db.query(QuestionTopic).filter(QuestionTopic.question_id == question.id).delete()

    # Create QuestionTopic associations
    for t_name in combined:
        topic_record = db.query(Topic).filter(
            Topic.subject_id == subject.id,
            func.lower(Topic.name) == t_name.lower(),
        ).first()
        if not topic_record:
            topic_record = Topic(
                id=str(uuid.uuid4()),
                subject_id=subject.id,
                name=t_name,
            )
            db.add(topic_record)
            db.flush()
        qt = QuestionTopic(
            question_id=question.id,
            topic_id=topic_record.id,
        )
        db.add(qt)

    db.flush()
    return combined


def init_default_topics(db: Session) -> list[Topic]:
    """Ensure subject-specific topic taxonomies are seeded for all default subjects."""
    seeded_topics: list[Topic] = []

    for code, taxonomy in SUBJECT_TAXONOMY.items():
        subject = db.query(Subject).filter(func.upper(Subject.code) == code.upper()).first()
        if not subject:
            continue

        for topic_name in taxonomy.keys():
            existing = db.query(Topic).filter(
                Topic.subject_id == subject.id,
                func.lower(Topic.name) == topic_name.lower(),
            ).first()
            if not existing:
                topic = Topic(
                    id=str(uuid.uuid4()),
                    subject_id=subject.id,
                    name=topic_name,
                )
                db.add(topic)
                seeded_topics.append(topic)

    db.commit()
    return seeded_topics


def backfill_all_question_topics(db: Session, only_empty: bool = True) -> int:
    """Classify and link topics for questions that do not have any tags yet."""
    query = db.query(Question)
    if only_empty:
        query = query.filter((Question.topics == None) | (Question.topics == []))
    questions = query.all()
    count = 0
    for q in questions:
        if not q.topics:
            assign_question_topics(db, q)
            count += 1
    if count > 0:
        db.commit()
    return count


def init_default_subjects(db: Session) -> list[Subject]:
    """Ensure standard curriculum subjects and their topic taxonomies are seeded in database."""
    seeded: list[Subject] = []
    for item in DEFAULT_SUBJECTS:
        existing = db.query(Subject).filter(
            (func.upper(Subject.code) == item["code"].upper())
            | (func.lower(Subject.name) == item["name"].lower())
        ).first()
        if not existing:
            subject = Subject(
                name=item["name"],
                code=item["code"],
                department=item["department"],
                semester=item["semester"],
                description=item["description"],
                is_active=True,
            )
            db.add(subject)
            seeded.append(subject)
        else:
            if not existing.is_active:
                existing.is_active = True
    db.commit()

    # Seed topics taxonomy for all subjects
    init_default_topics(db)

    # Note: Never overwrite existing question topics on startup
    return seeded


