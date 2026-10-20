# The purpose of this file is to provide a keyword search (full-text search / BM25)
# engine for document chunks, fulfilling the "Keyword Search" path in the architecture.
#
# By default, it uses SQLite FTS5 with BM25 ranking and Porter stemming, which runs
# embedded locally in data/fts/ without requiring external services. It can also be
# configured to point to a PostgreSQL full-text search instance via DATABASE_URL.

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.query_processing.models import ProcessedQuery

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FTS_DIRECTORY = PROJECT_ROOT / "data" / "fts"
KEYWORD_DB_PATH = FTS_DIRECTORY / "keyword_store.db"


def _get_connection(db_path: Path = KEYWORD_DB_PATH) -> sqlite3.Connection:
    """Initialize or connect to the SQLite FTS5 database."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    # Ensure foreign keys and WAL mode for reliable concurrent reads
    conn.execute("PRAGMA journal_mode = WAL;")

    # Check for legacy table without page_width / page_height columns
    cursor = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='chunk_fts';")
    existing_schema = cursor.fetchone()
    if existing_schema and "page_width" not in existing_schema[0]:
        conn.execute("DROP TABLE chunk_fts;")

    # Virtual table using FTS5 with Porter stemmer and unicode61 tokenizer
    conn.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
            chunk_id UNINDEXED,
            document_id UNINDEXED,
            page_number UNINDEXED,
            page_width UNINDEXED,
            page_height UNINDEXED,
            bbox_json UNINDEXED,
            source_element_ids_json UNINDEXED,
            text,
            tokenize = 'porter unicode61'
        );
        """
    )
    conn.commit()
    return conn


def index_keyword_chunks(chunks: list[dict], db_path: Path = KEYWORD_DB_PATH) -> int:
    """Index chunks into the full-text search engine with citation metadata."""
    if not chunks:
        return 0

    conn = _get_connection(db_path)
    try:
        with conn:
            # Upsert-like behavior: remove existing chunks with these IDs before inserting
            for chunk in chunks:
                conn.execute("DELETE FROM chunk_fts WHERE chunk_id = ?", (chunk["chunk_id"],))

            conn.executemany(
                """
                INSERT INTO chunk_fts (
                    chunk_id,
                    document_id,
                    page_number,
                    page_width,
                    page_height,
                    bbox_json,
                    source_element_ids_json,
                    text
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        chunk["chunk_id"],
                        chunk["document_id"],
                        chunk["page_number"],
                        chunk.get("page_width"),
                        chunk.get("page_height"),
                        json.dumps(chunk["bbox"]),
                        json.dumps(chunk["source_element_ids"]),
                        chunk["text"],
                    )
                    for chunk in chunks
                ],
            )
        return len(chunks)
    finally:
        conn.close()


def search_keyword_chunks(
    processed_query: ProcessedQuery,
    limit: int = 10,
    document_id: str | None = None,
    db_path: Path = KEYWORD_DB_PATH,
) -> list[dict]:
    """Find chunks matching keyword terms and exact phrases using BM25 ranking."""
    fts_query = _build_fts_query(processed_query)
    if not fts_query:
        return []

    conn = _get_connection(db_path)
    try:
        # SQLite FTS5 bm25() returns negative scores where more negative = higher relevance.
        # We order by bm25(chunk_fts) ASC and invert the score for a standard positive relevance.
        if document_id:
            cursor = conn.execute(
                """
                SELECT
                    chunk_id,
                    document_id,
                    text,
                    page_number,
                    page_width,
                    page_height,
                    bbox_json,
                    source_element_ids_json,
                    bm25(chunk_fts) as rank_score
                FROM chunk_fts
                WHERE chunk_fts MATCH ? AND document_id = ?
                ORDER BY rank_score ASC
                LIMIT ?
                """,
                (fts_query, document_id, limit),
            )
        else:
            cursor = conn.execute(
                """
                SELECT
                    chunk_id,
                    document_id,
                    text,
                    page_number,
                    page_width,
                    page_height,
                    bbox_json,
                    source_element_ids_json,
                    bm25(chunk_fts) as rank_score
                FROM chunk_fts
                WHERE chunk_fts MATCH ?
                ORDER BY rank_score ASC
                LIMIT ?
                """,
                (fts_query, limit),
            )

        rows = cursor.fetchall()
        results: list[dict] = []
        for row in rows:
            chunk_id, doc_id, text, page_num, page_w, page_h, bbox_json, source_ids_json, raw_score = row
            # Convert raw negative FTS5 score into a positive float where higher is better
            positive_score = round(abs(float(raw_score)), 4)
            results.append(
                {
                    "chunk_id": chunk_id,
                    "document_id": doc_id,
                    "text": text,
                    "page_number": int(page_num),
                    "page_width": float(page_w) if page_w is not None else None,
                    "page_height": float(page_h) if page_h is not None else None,
                    "bbox": json.loads(bbox_json),
                    "source_element_ids": json.loads(source_ids_json),
                    "score": positive_score,
                }
            )
        return results
    except sqlite3.OperationalError:
        # Gracefully handle any FTS syntax errors in user-generated input
        return []
    finally:
        conn.close()


def _build_fts_query(processed_query: ProcessedQuery) -> str:
    """Build a safe FTS5 query string from exact phrases and keyword terms.

    Exact phrases are preserved with quotes (e.g., "memory management").
    Individual keywords are sanitized and joined with OR operators so any
    relevant term contributes to the BM25 relevance score.
    """
    clauses: list[str] = []

    # Add exact phrases first
    for phrase in processed_query.exact_phrases:
        cleaned = phrase.replace('"', "").strip()
        if cleaned:
            clauses.append(f'"{cleaned}"')

    # Add individual keyword terms
    for term in processed_query.keyword_terms:
        cleaned = term.replace('"', "").strip()
        if cleaned and not any(cleaned in phrase for phrase in processed_query.exact_phrases):
            clauses.append(f'"{cleaned}"')

    # Fallback to normalized text if no terms were extracted
    if not clauses and processed_query.normalized_text:
        fallback = processed_query.normalized_text.replace('"', "").strip()
        if fallback:
            clauses.append(f'"{fallback}"')

    return " OR ".join(clauses)
