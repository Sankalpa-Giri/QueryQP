from dataclasses import dataclass
from enum import StrEnum


class SearchIntent(StrEnum):
    EXPLANATION = "explanation"
    COMPARISON = "comparison"
    LOOKUP = "lookup"
    GENERAL = "general"


@dataclass(frozen=True, slots=True)
class ProcessedQuery:
    """Provider-neutral output consumed by semantic and lexical retrieval."""

    original_text: str
    normalized_text: str
    semantic_query: str
    keyword_terms: tuple[str, ...]
    exact_phrases: tuple[str, ...]
    intent: SearchIntent
