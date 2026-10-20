# The purpose of this file is to build structured, intent-aware grounding prompts
# for the LLM, fulfilling the "Structured Prompt Builder" box in the architecture.
#
# It incorporates student SearchIntent (Comparison, Lookup, Explanation, General)
# to guide the generation structure while strictly enforcing chunk-level citations.

from __future__ import annotations

from typing import Any

from app.query_processing.models import SearchIntent

GROUNDING_INSTRUCTIONS = """You answer questions only from the supplied document sources.
If the sources do not contain enough information, say so plainly. Do not use outside
knowledge. Cite every factual statement using the matching source identifier in square
brackets, for example [SOURCE_ID]. Do not cite an identifier that was not supplied. The
application will replace these internal identifiers with reader-friendly page citations.
Return plain text: do not use Markdown bold, italic, headings, or code formatting.
Keep the answer concise and helpful for a student."""

_INTENT_DIRECTIVES: dict[SearchIntent, str] = {
    SearchIntent.COMPARISON: (
        "TASK FORMAT: The student is asking for a COMPARISON. Clearly contrast the concepts, "
        "highlighting key differences, similarities, or trade-offs supported by the text. "
        "Every distinct point must cite its source identifier."
    ),
    SearchIntent.LOOKUP: (
        "TASK FORMAT: The student is performing a LOOKUP. Give a direct, concise, high-precision "
        "statement or definition directly answering the query with its exact source citation."
    ),
    SearchIntent.EXPLANATION: (
        "TASK FORMAT: The student needs an EXPLANATION. Break down the concept with educational "
        "clarity and step-by-step intuition, strictly grounded in the cited source material."
    ),
    SearchIntent.GENERAL: (
        "TASK FORMAT: Provide a clear, helpful answer directly addressing the question with source citations."
    ),
}


def build_structured_prompt(
    question: str,
    chunks: list[dict[str, Any]],
    intent: SearchIntent = SearchIntent.GENERAL,
) -> str:
    """Build an intent-aware structured prompt enforcing source grounding and citations."""
    directive = _INTENT_DIRECTIVES.get(intent, _INTENT_DIRECTIVES[SearchIntent.GENERAL])

    sources = "\n\n".join(
        f"SOURCE_ID: {chunk['chunk_id']}\n"
        f"PAGE: {chunk.get('page_number', 'Unknown')}\n"
        f"CONTENT:\n{chunk['text']}"
        for chunk in chunks
    )

    return (
        f"{directive}\n\n"
        f"QUESTION:\n{question}\n\n"
        f"DOCUMENT SOURCES:\n{sources}"
    )


def build_grounded_input(question: str, chunks: list[dict[str, Any]]) -> str:
    """Backward-compatible prompt builder defaulting to general search intent."""
    return build_structured_prompt(question, chunks, intent=SearchIntent.GENERAL)
