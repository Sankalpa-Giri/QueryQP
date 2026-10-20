# The purpose of this file is to verify citation provenance and claim grounding,
# fulfilling the "Provenance / Citation Verifier" component in the architecture diagram.
#
# It verifies that:
# 1. Every cited chunk identifier was genuinely supplied in the Top Relevant Chunks
#    (preventing model citation hallucination).
# 2. The cited sentence has textual evidence and token overlap with the source chunk.
# 3. Model-facing identifiers [chunk_id] are converted to student-friendly [Page N] labels.
# 4. Accurate bounding boxes and page dimensions are assembled for UI highlighting.

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.schemas.chat import Citation

_STOP_WORDS = frozenset(
    {
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
        "he", "in", "is", "it", "its", "of", "on", "that", "the", "to", "was",
        "were", "will", "with",
    }
)
_CITATION_PATTERN = re.compile(r"[\[【]\s*([^\]】\n]+)\s*[\]】]")
_WORD_PATTERN = re.compile(r"[a-zA-Z0-9]{3,}")


@dataclass(frozen=True)
class CitationVerificationResult:
    """Detailed provenance verification result."""
    formatted_answer: str
    citations: list[Citation]
    is_grounded: bool
    verified_ids: list[str]
    rejected_ids: list[str]


def verify_and_assemble_citations(
    raw_answer: str,
    retrieved_chunks: list[dict[str, Any]],
) -> CitationVerificationResult:
    """Verify cited sources against top retrieved chunks and assemble UI citations."""
    if not retrieved_chunks:
        cleaned_answer = _clean_answer_formatting(raw_answer)
        return CitationVerificationResult(
            formatted_answer=cleaned_answer,
            citations=[],
            is_grounded=False,
            verified_ids=[],
            rejected_ids=[],
        )

    # Index retrieved chunks by their unique chunk_id for O(1) lookup
    chunk_by_id: dict[str, dict[str, Any]] = {
        chunk["chunk_id"]: chunk for chunk in retrieved_chunks
    }

    # Find all citation markers in the answer
    found_markers = _CITATION_PATTERN.findall(raw_answer)

    verified_chunk_ids: list[str] = []
    rejected_chunk_ids: list[str] = []
    formatted_answer = raw_answer

    for candidate_id in found_markers:
        candidate_id_clean = candidate_id.strip()

        # Check 1: Does this cited ID exist in the Top Relevant Chunks?
        if candidate_id_clean in chunk_by_id:
            chunk = chunk_by_id[candidate_id_clean]

            # Check 2: Claim grounding check (lexical evidence alignment)
            if _is_claim_grounded_in_chunk(raw_answer, candidate_id_clean, chunk["text"]):
                if candidate_id_clean not in verified_chunk_ids:
                    verified_chunk_ids.append(candidate_id_clean)

                # Format readable page marker for student
                page_label = f"[Page {chunk['page_number']}]"
                marker_regex = re.compile(rf"[\[【]\s*{re.escape(candidate_id_clean)}\s*[\]】]")
                formatted_answer = marker_regex.sub(page_label, formatted_answer)
            else:
                # Evidence was not supported by the cited chunk
                rejected_chunk_ids.append(candidate_id_clean)
                marker_regex = re.compile(rf"[\[【]\s*{re.escape(candidate_id_clean)}\s*[\]】]")
                formatted_answer = marker_regex.sub("", formatted_answer)
        else:
            # Model hallucinated a chunk ID that was never provided
            rejected_chunk_ids.append(candidate_id_clean)
            marker_regex = re.compile(rf"[\[【]\s*{re.escape(candidate_id_clean)}\s*[\]】]")
            formatted_answer = marker_regex.sub("", formatted_answer)

    # Clean redundant whitespaces and markdown bold/italic
    formatted_answer = _clean_answer_formatting(formatted_answer)

    # Assemble unique Citation objects with page number, bbox, and dimensions
    assembled_citations: list[Citation] = []
    seen_chunk_ids: set[str] = set()

    for chunk_id in verified_chunk_ids:
        if chunk_id in seen_chunk_ids:
            continue
        seen_chunk_ids.add(chunk_id)
        chunk = chunk_by_id[chunk_id]
        assembled_citations.append(
            Citation(
                page_number=chunk["page_number"],
                bbox=chunk["bbox"],
                page_width=chunk.get("page_width"),
                page_height=chunk.get("page_height"),
            )
        )

    # Determine if answer is considered properly grounded
    is_grounded = len(verified_chunk_ids) > 0 or len(found_markers) == 0

    return CitationVerificationResult(
        formatted_answer=formatted_answer,
        citations=assembled_citations,
        is_grounded=is_grounded,
        verified_ids=verified_chunk_ids,
        rejected_ids=rejected_chunk_ids,
    )


def _is_claim_grounded_in_chunk(answer: str, citation_id: str, chunk_text: str) -> bool:
    """Evaluate whether the sentence containing the citation has lexical support in the chunk."""
    # Locate sentence or clause preceding the citation marker
    marker = f"[{citation_id}]"
    pos = answer.find(marker)
    if pos == -1:
        marker = f"【{citation_id}】"
        pos = answer.find(marker)

    if pos != -1:
        # Extract sentence preceding the citation (up to previous period or newline)
        start_pos = max(answer.rfind(".", 0, pos), answer.rfind("\n", 0, pos), 0)
        claim_sentence = answer[start_pos:pos].strip()
    else:
        claim_sentence = answer

    claim_words = {
        w.lower()
        for w in _WORD_PATTERN.findall(claim_sentence)
        if w.lower() not in _STOP_WORDS
    }
    chunk_words = {
        w.lower()
        for w in _WORD_PATTERN.findall(chunk_text)
        if w.lower() not in _STOP_WORDS
    }

    if not claim_words:
        return True  # If claim has no long words, allow citation

    # Overlap ratio between claim words and source chunk words
    overlap = claim_words.intersection(chunk_words)
    overlap_ratio = len(overlap) / len(claim_words)

    # At least 15% of significant claim terms must exist in the source chunk
    return overlap_ratio >= 0.15


def _clean_answer_formatting(text: str) -> str:
    """Remove common markdown emphasis while preserving student readability."""
    cleaned = text.replace("**", "").replace("__", "")
    # Normalize multiple spaces created by removed citations
    cleaned = re.sub(r" +", " ", cleaned)
    return cleaned.strip()
