# The purpose of the file is to preprocess the input query, normalise it and return as an dataclass object


import re
import unicodedata
from collections.abc import Iterable

from app.query_processing.models import ProcessedQuery, SearchIntent

MIN_QUERY_LENGTH = 3        # Rejects the query that is too small like 'hi'
MAX_QUERY_LENGTH = 1_000    # Rejects the query that is too large.

_TERM_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9+.#-]{1,}")
_QUOTED_PHRASE_PATTERN = re.compile(r'"([^"\n]+)"')     # Extracts exact phrases wrapped in double quotes ("...").
_WHITESPACE_PATTERN = re.compile(r"\s+")    # Matches one or more spaces, tabs, or newlines to collapse extra spaces.
_STOP_WORDS = frozenset(    # A frozenset of common noise words that carry little lexical weight in traditional keyword searches.
    {
        "a", "an", "and", "are", "at", "be", "by", "do", "for", "from", "how",
        "in", "is", "it", "of", "on", "or", "the", "this", "to", "was", "what",
        "when", "where", "which", "with", "would", "you",
    }
)


def process_student_query(raw_question: str) -> ProcessedQuery:
    """Normalize a question without rewriting or expanding the student's intent.

    Semantic search receives the normalized complete question. Keyword retrieval
    receives extracted terms and quoted phrases, so a later PostgreSQL FTS/BM25
    implementation can use the same contract without duplicating preprocessing.
    """
    if not isinstance(raw_question, str):
        raise ValueError("Question must be text.")

    original_text = raw_question
    normalized_text = _normalize_text(raw_question)
    _validate_length(normalized_text)

    exact_phrases = _extract_exact_phrases(normalized_text)
    keyword_terms = _extract_keyword_terms(normalized_text)
    return ProcessedQuery(
        original_text=original_text,
        normalized_text=normalized_text,
        semantic_query=normalized_text,
        keyword_terms=keyword_terms,
        exact_phrases=exact_phrases,
        intent=_detect_intent(normalized_text),
    )


def _normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = value.translate(str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'"}))
    return _WHITESPACE_PATTERN.sub(" ", value).strip()


# Ensures the cleaned string falls within 3 to 1,000 characters; raises a ValueError otherwise.
def _validate_length(value: str) -> None:
    if len(value) < MIN_QUERY_LENGTH:
        raise ValueError(f"Question must contain at least {MIN_QUERY_LENGTH} characters.")
    if len(value) > MAX_QUERY_LENGTH:
        raise ValueError(f"Question must contain at most {MAX_QUERY_LENGTH} characters.")


# Uses regex to pull text inside quotation marks, collapses internal spaces, and deduplicates them.
def _extract_exact_phrases(value: str) -> tuple[str, ...]:
    phrases = [_WHITESPACE_PATTERN.sub(" ", phrase).strip() for phrase in _QUOTED_PHRASE_PATTERN.findall(value)]
    return _deduplicate(phrase for phrase in phrases if phrase)

# Finds all eligible words/tokens, strips any trailing periods, removes stop words (case-insensitively), and deduplicates the list.
def _extract_keyword_terms(value: str) -> tuple[str, ...]:
    terms = (term.rstrip(".") for term in _TERM_PATTERN.findall(value))
    terms = (term for term in terms if term and term.casefold() not in _STOP_WORDS)
    return _deduplicate(terms)


# Categorizes the search query into an enum based on simple rule-matching
def _detect_intent(value: str) -> SearchIntent:
    lowered = value.casefold()
    if any(marker in lowered for marker in ("compare", "difference between", " vs ", "versus")):
        return SearchIntent.COMPARISON
    if lowered.startswith(("find ", "show ", "list ", "where ", "locate ")):
        return SearchIntent.LOOKUP
    if lowered.startswith(("what is", "what are", "explain", "describe", "why ", "how ")):
        return SearchIntent.EXPLANATION
    return SearchIntent.GENERAL


def _deduplicate(values: Iterable[str]) -> tuple[str, ...]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized_key = value.casefold()
        if normalized_key not in seen:
            seen.add(normalized_key)
            result.append(value)
    return tuple(result)




'''
Example:
Input: raw_query = '  What is the difference between  “C++”  and  “Python” in “memory management”?   '

Final returned Output:
ProcessedQuery(
    original_text='  What is the difference between  “C++”  and  “Python” in “memory management”?   ',
    normalized_text='What is the difference between "C++" and "Python" in "memory management"?',
    semantic_query='What is the difference between "C++" and "Python" in "memory management"?',
    keyword_terms=('difference', 'between', 'C++', 'Python', 'memory', 'management'),
    exact_phrases=('C++', 'Python', 'memory management'),
    intent=SearchIntent.COMPARISON,
)
'''