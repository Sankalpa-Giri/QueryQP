# Document Q&A backend — Phase 1

This runnable starting point accepts a PDF, extracts its typed text and bounding boxes with PyMuPDF, writes a canonical JSON document, and indexes retrieval chunks in a local Qdrant vector database. DOCX and OCR can be added as new extractors without changing the API.

## Run

```powershell
py -m pip install -r requirements.txt
py -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` to try the API.

Use `POST /documents` to upload a PDF, then call `GET /documents/{document_id}`. The generated canonical file is stored in `data/normalized/`.

The first upload downloads the embedding model selected in `app/retrieval/embeddings.py`; it can take a few minutes and requires an internet connection.

For grounded answers, copy `.env.example` to `.env`, add your Groq key, and optionally select `GROQ_MODEL` before starting the server. Never commit `.env`.
