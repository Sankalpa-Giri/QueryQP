# QueryQP Intelligence — AI Exam-Prep, PYQ Search & Question Bank System

**Author / Lead Developer:** Mohit Biswal  
**Institution:** School of Computer Engineering, KIIT Deemed to be University  

### Key Features Implemented
- **6-Tab Student AI Portal:** Hybrid PYQ Search, Conversational AI Assistant, Topic Weightage & Score Predictor, Interactive Topic Quiz, KIIT-Pattern Mock Exam Generator (20M Midsem / 50M Endsem), and Question Archive.
- **Hybrid Retrieval Engine:** Okapi BM25 Lexical Search + BAAI/bge-small-en-v1.5 Semantic Embeddings fused via Reciprocal Rank Fusion (RRF).
- **AI Step-by-Step Solver & Repeat Detector:** Instant marking-scheme solutions and multi-year repeat frequency badges.
- **Human-in-the-Loop Admin Portal:** Bulk PDF ingestion (PyMuPDF & LlamaParse OCR), staging review, question splitting, and visual bounding-box page provenance.

---
# Previous Year Question (PYQ) Recommender & Management System

A full-stack Previous Year Question (PYQ) Recommender System engineered for college students and academic administrators.

The platform provides two dedicated interfaces:
1. **Student Portal (`/`):** A fast academic search interface where students select subjects, perform natural-language topic queries, filter by academic year and examination type (Midsem / Endsem), and retrieve authentic questions with exact citations (subject, year, exam type, original paper, and page number with visual bounding box highlights).
2. **Admin Portal (`/admin/*`):** An authenticated workspace where administrators manage curriculum subjects, bulk-ingest PDF question papers, parse papers using **LlamaParse** (with native PyMuPDF fallback), segment and review extracted questions, and publish verified questions to the student search knowledge base.

---

## Key Features

- **Document Processing via LlamaParse:** Deep layout analysis, multi-column reading order, math formulas, diagrams, and table structure preservation.
- **Bulk Paper Ingestion:** Drag-and-drop ingestion of multiple PDF papers in a single batch with single-metadata or per-file metadata overrides.
- **Question & Subquestion Segmentation:** Regex-guided segmentation supporting standard university formats (`Q1`, `1.`, `2(a)`, `Part A`), marks extraction (`[10 marks]`, `(5M)`), and outer bounding box calculations.
- **SHA-256 Duplicate Detection:** Prevents duplicate ingestion of identical papers within the same subject, year, and examination type.
- **Hybrid Retrieval (pgvector + BM25):** Combines dense vector semantic similarity with BM25 keyword matching via Reciprocal Rank Fusion (RRF, $k=60$).
- **Verifiable Provenance:** Every question preserves its source document reference, page number, and bounding box coordinates for source verification.
- **Zero Hallucination:** The system strictly indexes and returns questions extracted from uploaded papers.

---

## Technology Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, TanStack Query, Lucide icons.
- **Backend:** FastAPI, Python 3.12+, Pydantic v2, SQLAlchemy 2.x, Alembic, PyMuPDF, LlamaParse.
- **Database & Storage:** PostgreSQL 16 + pgvector (or SQLite for zero-setup local development), Redis for background queue, local private storage.
- **Queue & Background Jobs:** Celery task queue with automatic ThreadPool fallback for zero-infrastructure local setups.

---

## Quick Start with Docker Compose

To start all services (PostgreSQL with pgvector, Redis, FastAPI Backend, Celery Worker, and Next.js Frontend) in one command:

```bash
# 1. Set your LlamaParse API key (optional; defaults to native PyMuPDF fallback if omitted)
export LLAMA_CLOUD_API_KEY="llx-..."

# 2. Launch the entire stack
docker compose up --build
```

Services will be accessible at:
- **Student Portal:** `http://localhost:3000`
- **Admin Portal:** `http://localhost:3000/admin/login`
- **FastAPI OpenAPI Docs:** `http://localhost:8000/docs`
- **Backend Health Check:** `http://localhost:8000/health`

Default Admin Credentials:
- **Username:** `admin`
- **Password:** `admin123`

---

## Local Development (Without Docker)

You can run both backend and frontend locally using Python virtual environment and Node.js.

### 1. Backend Setup

```bash
cd work/docqa-backend

# Activate virtual environment
source .venv/bin/activate       # On Linux/macOS
# or: .\.venv\Scripts\Activate.ps1 # On Windows PowerShell

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start FastAPI server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Frontend Setup

```bash
cd work/docqa-frontend

# Install dependencies
npm install

# Start Next.js development server
npm run dev
```

Visit `http://localhost:3000` in your browser.

---

## Running Automated Tests

The backend test suite covers authentication, subject management, LlamaParse ingestion, question segmentation, duplicate detection, and student hybrid retrieval:

```bash
cd work/docqa-backend
pytest tests -v
```

All 44 test cases pass with SQLite in-memory isolation.

To verify frontend TypeScript and production build:

```bash
cd work/docqa-frontend
npm run build
```

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `LLAMA_CLOUD_API_KEY` | LlamaParse cloud API key | None (PyMuPDF fallback active) |
| `DATABASE_URL` | SQLAlchemy connection string | `sqlite:///./data/pyq_database.db` |
| `REDIS_URL` | Redis broker and backend URL | `redis://localhost:6379/0` |
| `JWT_SECRET_KEY` | Secret key for admin JWTs | `pyq-super-secret-key-change-in-production` |
| `STORAGE_DIR` | Private filesystem storage directory | `./data/storage` |
| `NEXT_PUBLIC_API_URL` | Frontend API base URL | `http://127.0.0.1:8000` |

---

## License

MIT License. Designed for academic exam preparation and question retrieval.

