import logging
import uuid
from collections import defaultdict
from pathlib import Path
from sqlalchemy.orm import Session

from app.models.slide import Slide
from app.models.subject import Subject
from app.schemas.slide import (
    ProfessorSlidesResponse,
    SlideResponse,
    TopicSlidesGroup,
)
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)


def format_slide_response(slide: Slide) -> SlideResponse:
    ext = (slide.file_type or "pdf").lower()
    return SlideResponse(
        id=slide.id,
        subject_id=slide.subject_id,
        subject_name=slide.subject.name if slide.subject else None,
        subject_code=slide.subject.code if slide.subject else None,
        professor_name=slide.professor_name,
        professor_title=slide.professor_title,
        topic_name=slide.topic_name,
        title=slide.title,
        description=slide.description,
        filename=slide.filename,
        file_type=ext,
        file_size_bytes=slide.file_size_bytes or 0,
        semester=slide.semester,
        academic_year=slide.academic_year,
        download_count=slide.download_count or 0,
        file_url=f"/api/v1/slides/{slide.id}/file",
        download_url=f"/api/v1/slides/{slide.id}/download",
        created_at=slide.created_at,
        updated_at=slide.updated_at,
    )


def get_professors_with_slides(db: Session, subject_id: str) -> list[ProfessorSlidesResponse]:
    """Retrieve professor names in Alphabetical order for a subject with their topic-wise slides."""
    slides = (
        db.query(Slide)
        .filter(Slide.subject_id == subject_id)
        .order_by(Slide.professor_name.asc(), Slide.topic_name.asc(), Slide.created_at.asc())
        .all()
    )

    prof_map: dict[str, dict] = {}
    for s in slides:
        p_name = s.professor_name.strip()
        if p_name not in prof_map:
            prof_map[p_name] = {
                "title": s.professor_title,
                "slides_by_topic": defaultdict(list),
                "total": 0,
            }
        resp = format_slide_response(s)
        prof_map[p_name]["slides_by_topic"][s.topic_name.strip()].append(resp)
        prof_map[p_name]["total"] += 1

    result: list[ProfessorSlidesResponse] = []
    # Sort professors strictly in Alphabetical order
    for p_name in sorted(prof_map.keys()):
        data = prof_map[p_name]
        topic_groups = [
            TopicSlidesGroup(topic_name=t_name, slides=slides_list)
            for t_name, slides_list in sorted(data["slides_by_topic"].items())
        ]
        result.append(
            ProfessorSlidesResponse(
                professor_name=p_name,
                professor_title=data["title"],
                total_slides=data["total"],
                topics=topic_groups,
            )
        )
    return result


def init_default_slides(db: Session) -> None:
    """Bootstrap realistic professor slides across university curriculum subjects."""
    if db.query(Slide).count() > 0:
        return

    subjects = db.query(Subject).all()
    if not subjects:
        return

    subj_map = {s.name.lower(): s for s in subjects}

    seed_data = [
        # Data Structures & Algorithms
        (
            "Data Structures & Algorithms",
            "Dr. Debabrata Singh",
            "Associate Professor, School of Computer Engineering",
            "Unit 1: Linear Data Structures",
            "Lecture 01 - Asymptotic Analysis & Recurrences",
            "Big-O, Big-Omega, Theta notation, and Master Theorem recurrence analysis with solved examples.",
            "dsa_lecture_01_asymptotics.pdf",
            "pdf",
            1245000,
            3,
            2024,
        ),
        (
            "Data Structures & Algorithms",
            "Dr. Debabrata Singh",
            "Associate Professor, School of Computer Engineering",
            "Unit 1: Linear Data Structures",
            "Lecture 03 - Singly, Doubly and Circular Linked Lists",
            "Memory models, pointer manipulation, reversal in O(N) time and O(1) auxiliary space.",
            "dsa_lecture_03_linked_lists.pdf",
            "pdf",
            1850000,
            3,
            2024,
        ),
        (
            "Data Structures & Algorithms",
            "Dr. Debabrata Singh",
            "Associate Professor, School of Computer Engineering",
            "Unit 2: Tree Data Structures",
            "Lecture 07 - Binary Search Trees & AVL Rotations",
            "BST insertion, deletion, AVL balance factor calculations and LL/RR/LR/RL rotation algorithms.",
            "dsa_lecture_07_avl_trees.pdf",
            "pdf",
            2140000,
            3,
            2024,
        ),
        (
            "Data Structures & Algorithms",
            "Prof. Ananya Mishra",
            "Assistant Professor, Dept of Information Technology",
            "Unit 3: Graph Algorithms",
            "Lecture 11 - BFS, DFS & Topological Sort",
            "Adjacency list representation, queue-based BFS, recursion-stack DFS, and cycle detection.",
            "dsa_lecture_11_graphs.pdf",
            "pdf",
            1670000,
            3,
            2024,
        ),
        (
            "Data Structures & Algorithms",
            "Prof. Ananya Mishra",
            "Assistant Professor, Dept of Information Technology",
            "Unit 4: Dynamic Programming",
            "Lecture 15 - 0/1 Knapsack & Longest Common Subsequence",
            "Optimal substructure, overlapping subproblems, memoization table vs tabulation state transitions.",
            "dsa_lecture_15_dynamic_programming.pdf",
            "pdf",
            1920000,
            3,
            2024,
        ),
        # Operating Systems
        (
            "Operating Systems",
            "Dr. Manas Ranjan Lenka",
            "Professor & Head of Systems Architecture",
            "Unit 1: Process Management & Scheduling",
            "Lecture 02 - Process State Machine & Context Switching",
            "PCB structure, process lifecycle, CPU context switching overhead, and fork() system call.",
            "os_lecture_02_process_mgmt.pdf",
            "pdf",
            1430000,
            4,
            2024,
        ),
        (
            "Operating Systems",
            "Dr. Manas Ranjan Lenka",
            "Professor & Head of Systems Architecture",
            "Unit 2: Concurrency & Deadlocks",
            "Lecture 06 - Semaphores, Mutex & Classical IPC Problems",
            "Producer-Consumer, Dining Philosophers, Readers-Writers synchronization using wait() and signal().",
            "os_lecture_06_semaphores_mutex.pdf",
            "pdf",
            2310000,
            4,
            2024,
        ),
        (
            "Operating Systems",
            "Dr. Manas Ranjan Lenka",
            "Professor & Head of Systems Architecture",
            "Unit 2: Concurrency & Deadlocks",
            "Lecture 08 - Deadlock Characterization & Banker's Algorithm",
            "Mutual exclusion, hold and wait, no preemption, circular wait, and safety state algorithm.",
            "os_lecture_08_bankers_algorithm.pdf",
            "pdf",
            1780000,
            4,
            2024,
        ),
        (
            "Operating Systems",
            "Prof. Soumya Ray",
            "Assistant Professor, School of Computer Engineering",
            "Unit 3: Memory Management",
            "Lecture 12 - Virtual Memory & Page Replacement",
            "Paging hardware, TLB hit/miss ratio, FIFO, Optimal, and LRU page replacement policies.",
            "os_lecture_12_virtual_memory.pdf",
            "pdf",
            2050000,
            4,
            2024,
        ),
        # Database Management Systems
        (
            "Database Management Systems",
            "Dr. Sasmita Mohapatra",
            "Professor, Database Systems Group",
            "Unit 1: Relational Model & SQL",
            "Lecture 03 - Advanced SQL Joins & Subqueries",
            "Inner, Outer (Left, Right, Full) joins, correlated subqueries, and window aggregate functions.",
            "dbms_lecture_03_sql_joins.pdf",
            "pdf",
            1590000,
            4,
            2024,
        ),
        (
            "Database Management Systems",
            "Dr. Sasmita Mohapatra",
            "Professor, Database Systems Group",
            "Unit 2: Normalization & Functional Dependencies",
            "Lecture 07 - Normal Forms: 1NF, 2NF, 3NF & BCNF",
            "Lossless join decomposition, dependency preservation, canonical cover, and Boyce-Codd Normal Form.",
            "dbms_lecture_07_normalization.pdf",
            "pdf",
            2230000,
            4,
            2024,
        ),
        (
            "Database Management Systems",
            "Prof. Prasant Tripathy",
            "Associate Professor, Dept of Computer Science",
            "Unit 3: Transaction Processing",
            "Lecture 10 - ACID Properties & Serializability",
            "Conflict vs view serializability, precedence graphs, and 2-Phase Locking (2PL) protocol.",
            "dbms_lecture_10_acid_transactions.pdf",
            "pdf",
            1810000,
            4,
            2024,
        ),
        # Computer Networks
        (
            "Computer Networks",
            "Dr. Alok Kumar Jagadev",
            "Professor, Networking & Telecommunications",
            "Unit 1: Physical & Data Link Layer",
            "Lecture 04 - Error Detection: CRC & Checksum",
            "Cyclic Redundancy Check polynomial division, parity checks, and Framing bit stuffing.",
            "cn_lecture_04_error_detection_crc.pdf",
            "pdf",
            1640000,
            5,
            2024,
        ),
        (
            "Computer Networks",
            "Dr. Alok Kumar Jagadev",
            "Professor, Networking & Telecommunications",
            "Unit 2: Network Layer & Routing",
            "Lecture 09 - Distance Vector vs Link State Routing",
            "Bellman-Ford algorithm, Count-to-Infinity problem, Split Horizon, and Dijkstra link-state convergence.",
            "cn_lecture_09_routing_algorithms.pdf",
            "pdf",
            2420000,
            5,
            2024,
        ),
        (
            "Computer Networks",
            "Prof. Tanmay Bhowmik",
            "Assistant Professor, Network Engineering",
            "Unit 3: Transport Layer Protocols",
            "Lecture 14 - TCP 3-Way Handshake & Congestion Control",
            "SYN-ACK sequence number exchange, Slow Start, Congestion Avoidance, Fast Retransmit & Recovery.",
            "cn_lecture_14_tcp_congestion.pdf",
            "pdf",
            2190000,
            5,
            2024,
        ),
    ]

    for subj_name, prof_name, prof_title, topic_name, title, desc, filename, ftype, fsize, sem, year in seed_data:
        subj = subj_map.get(subj_name.lower())
        if not subj:
            # Fallback to first available subject
            subj = subjects[0]

        slide_id = str(uuid.uuid4())
        # Ensure a minimal valid file exists in slides directory
        storage_key = f"slides/{slide_id}.{ftype}"
        file_path = storage_service.slides_dir / f"{slide_id}.{ftype}"
        if not file_path.exists():
            with open(file_path, "wb") as f:
                # Write a minimal dummy PDF content if pdf
                f.write(b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000108 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n185\n%%EOF")

        slide = Slide(
            id=slide_id,
            subject_id=subj.id,
            professor_name=prof_name,
            professor_title=prof_title,
            topic_name=topic_name,
            title=title,
            description=desc,
            filename=filename,
            storage_key=storage_key,
            file_type=ftype,
            file_size_bytes=fsize,
            semester=sem,
            academic_year=year,
            download_count=12,
        )
        db.add(slide)

    db.commit()
    logger.info("Initialized default professor lecture slides successfully.")
