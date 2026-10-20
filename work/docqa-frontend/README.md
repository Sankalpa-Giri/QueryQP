# Document Q&A frontend

## Run

1. Ensure the FastAPI backend is running at `http://127.0.0.1:8000`.
2. Copy `.env.local.example` to `.env.local` if the backend URL differs.
3. Run `npm install`, then `npm run dev`.
4. Open `http://localhost:3000`.

The UI currently supports typed PDFs and its document record is held in backend memory, so upload the document again after a backend restart.
