"""Stable query-processing contract for all retrieval strategies."""

from app.query_processing.models import ProcessedQuery, SearchIntent
from app.query_processing.processor import process_student_query

__all__ = ["ProcessedQuery", "SearchIntent", "process_student_query"]
