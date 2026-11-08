import re
from dataclasses import dataclass, field

from app.ingestion.providers import ParsedDocumentResult, ParsedElement, ParsedPage

# Section headers (e.g. SECTION-A, Section B, Part A, GROUP-1)
SECTION_REGEX = re.compile(r"^(?:SECTION|PART|GROUP)\s*[-–—:]?\s*([A-Z0-9]+)", re.IGNORECASE)

# Main question header regex:
# 1. Main Question with explicit Q / Question / Problem prefix: can have period, comma, colon, hyphen
#    e.g. "Q.1.", "Q. 1.", "Q1.", "Q1:", "Question 1", "Question - 1", "Problem 1", "Q.2,"
# 2. Main Question with bare digit: MUST have period, colon, or closing parenthesis, followed by space or newline
#    e.g. "1.", "2.", "3)", "1:"
# (Notice: Bare digits with commas e.g. "3, 2, 10, 12" are excluded to prevent array literals matching)
MAIN_Q_HEADER = re.compile(
    r"^(?:\*{1,2}\s*)?"
    r"(?:"
    r"(?:Q(?:uestion)?|Prob(?:lem)?)\.?\s*(?:No\.?\s*|[-–—]\s*)?(\d{1,2})\s*[\.\,\:\-\)]?"
    r"|(\d{1,2})\s*[\.\:\)]"
    r")"
    r"(?:\s+.*|\s*)$",
    re.IGNORECASE,
)

# Exam header boilerplate to ignore before question 1
HEADER_IGNORE = [
    "autumn end semester", "spring end semester", "mid semester", "end semester",
    "examination", "semester", "full marks", "time:", "qn. set code", "branch:",
    "programme:", "school of", "department of", "roll no", "regn no", "registration no",
    "course code", "subject code", "maximum marks", "answer all", "answer any",
    "candidates are required", "the figures in the margin", "all parts of a question",
    "instructions to candidates", "instructions:", "time allowed", "attempt any"
]

PAGE_MARKER_REGEX = re.compile(r"<!--\s*Page\s+(\d+)\s*-->", re.IGNORECASE)


@dataclass
class ExtractedQuestion:
    question_number: str
    question_text: str
    normalized_text: str
    page_number: int
    page_end: int
    marks: float | None = None
    bbox: list[float] | None = None
    parent_number: str | None = None
    topics: list[str] = field(default_factory=list)
    subquestions: list["ExtractedQuestion"] = field(default_factory=list)


def extract_marks(text: str) -> float | None:
    """Extract allocated marks from question text without false positives on array indexing."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if not lines:
        return None

    # Priority 1: Standalone marks bracket on line 1 or line 2 right after question header
    # e.g. "[5X1]", "[5]", "[2.5]", "[4]", "{1x 10]", "[4x2]"
    for line in lines[:3]:
        m = re.match(r"^[\{\[\(]\s*(\d{1,2}(?:\.\d)?(?:\s*[xX*]\s*\d{1,2})?)\s*(?:marks?|pts?|points?)?\s*[\}\]\)]\s*$", line, re.IGNORECASE)
        if m:
            val_str = m.group(1).lower().replace(" ", "")
            if "x" in val_str or "*" in val_str:
                parts = re.split(r"[x*]", val_str)
                try:
                    return float(parts[0]) * float(parts[1])
                except Exception:
                    pass
            try:
                return float(val_str)
            except Exception:
                pass

    # Priority 2: Line ending with marks bracket: e.g. "Explain DFS. [5 marks]" or "... [4]"
    for line in reversed(lines):
        # Explicit "marks" or "pts"
        m = re.search(r"[\{\[\(]\s*(\d{1,2}(?:\.\d)?(?:\s*[xX*]\s*\d{1,2})?)\s*(?:marks?|pts?|points?)\s*[\}\]\)]\s*$", line, re.IGNORECASE)
        if m:
            val_str = m.group(1).lower().replace(" ", "")
            if "x" in val_str or "*" in val_str:
                parts = re.split(r"[x*]", val_str)
                try:
                    return float(parts[0]) * float(parts[1])
                except Exception:
                    pass
            try:
                return float(val_str)
            except Exception:
                pass

        # Bare [4] at the very end of a line (not preceded by alphanumeric/bracket like arr[20])
        m = re.search(r"(?<![a-zA-Z0-9\]\)])\s*[\{\[\(]\s*(\d{1,2}(?:\.\d)?(?:\s*[xX*]\s*\d{1,2})?)\s*[\}\]\)]\s*$", line)
        if m:
            val_str = m.group(1).lower().replace(" ", "")
            if "x" in val_str or "*" in val_str:
                parts = re.split(r"[x*]", val_str)
                try:
                    return float(parts[0]) * float(parts[1])
                except Exception:
                    pass
            try:
                return float(val_str)
            except Exception:
                pass

    return None


def normalize_query_text(text: str) -> str:
    """Clean and normalize question text for search indexing."""
    cleaned = re.sub(r"\s+", " ", text).strip().lower()
    return cleaned


def union_bboxes(boxes: list[list[float]]) -> list[float] | None:
    """Compute tight enclosing bounding box over all elements."""
    valid_boxes = [b for b in boxes if b and len(b) == 4 and (b[2] > b[0]) and (b[3] > b[1])]
    if not valid_boxes:
        return None
    return [
        round(min(b[0] for b in valid_boxes), 2),
        round(min(b[1] for b in valid_boxes), 2),
        round(max(b[2] for b in valid_boxes), 2),
        round(max(b[3] for b in valid_boxes), 2),
    ]


def split_inline_subquestions(questions: list[ExtractedQuestion]) -> list[ExtractedQuestion]:
    """Extract bit-wise subquestions (e.g. 7(a), 7(b)) when explicit subquestion letters (a), (b) exist."""
    bitwise: list[ExtractedQuestion] = []
    sub_re = re.compile(r"(?:^|\n)\s*(?:\()?([a-gA-G])[\)\.](?:\s+|$)", re.MULTILINE)

    for q in questions:
        matches = list(sub_re.finditer(q.question_text))
        if len(matches) < 2:
            bitwise.append(q)
            continue

        lead_text = q.question_text[: matches[0].start()].strip()
        sub_marks = (q.marks / len(matches)) if q.marks else None

        for idx, m in enumerate(matches):
            start = m.start()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(q.question_text)
            sub_letter = m.group(1).lower()
            sub_body = q.question_text[start:end].strip()

            sub_text = f"{lead_text}\n\n{sub_body}".strip() if lead_text else sub_body
            bit_num = f"{q.question_number}({sub_letter})" if not q.question_number.endswith(f"({sub_letter})") else q.question_number
            bit_marks = extract_marks(sub_body) or sub_marks

            bitwise.append(
                ExtractedQuestion(
                    question_number=bit_num,
                    question_text=sub_text,
                    normalized_text=normalize_query_text(sub_text),
                    page_number=q.page_number,
                    page_end=q.page_end,
                    marks=bit_marks,
                    bbox=q.bbox,
                    topics=list(q.topics),
                )
            )

    return bitwise


def _segment_from_markdown(markdown: str) -> list[ExtractedQuestion]:
    """Segment questions from structured markdown by main question headers."""
    dummy_doc = ParsedDocumentResult(
        page_count=1,
        markdown=markdown,
        pages=[],
    )
    return segment_questions_from_parsed(dummy_doc)


def segment_questions_from_parsed(result: ParsedDocumentResult) -> list[ExtractedQuestion]:
    """Segment parsed document pages and markdown into authentic question units."""
    markdown = result.markdown or ""
    elements_text_len = sum(len(e.text) for p in result.pages for e in p.elements if e.text)

    # Use elements if markdown is empty or elements contain substantially more text (e.g. mock test cases)
    if not markdown.strip() or (elements_text_len > len(markdown)):
        md_parts = []
        for p in result.pages:
            p_text = "\n\n".join(e.text for e in p.elements if e.text)
            md_parts.append(f"<!-- Page {p.page_number} -->\n" + p_text)
        markdown = "\n\n---\n\n".join(md_parts)

    lines = markdown.split("\n")
    current_page = 1
    questions: list[ExtractedQuestion] = []
    curr_q_num: str | None = None
    curr_q_lines: list[str] = []
    curr_q_page = 1
    curr_q_end_page = 1
    in_header = True

    page_map = {p.page_number: p for p in result.pages}

    def flush():
        nonlocal curr_q_num, curr_q_lines, curr_q_page, curr_q_end_page
        if not curr_q_num or not curr_q_lines:
            return
        full_text = "\n".join(curr_q_lines).strip()
        if len(full_text) < 5:
            return

        marks = extract_marks(full_text)

        # Match bounding boxes from elements on pages curr_q_page .. curr_q_end_page
        matched_boxes: list[list[float]] = []
        q_norm = "".join(full_text.lower().split())
        for p_idx in range(curr_q_page, curr_q_end_page + 1):
            page_obj = page_map.get(p_idx)
            if not page_obj:
                continue
            for el in page_obj.elements:
                el_norm = "".join(str(el.text).lower().split())
                if el_norm and (el_norm in q_norm or el_norm[:30] in q_norm):
                    if el.bbox and len(el.bbox) == 4:
                        matched_boxes.append(el.bbox)

        bbox = union_bboxes(matched_boxes) if matched_boxes else None
        if not bbox:
            p_obj = page_map.get(curr_q_page)
            w = p_obj.width if p_obj else 595.0
            h = p_obj.height if p_obj else 842.0
            bbox = [50.0, 50.0, round(w - 50.0, 2), round(h - 50.0, 2)]

        questions.append(
            ExtractedQuestion(
                question_number=curr_q_num,
                question_text=full_text,
                normalized_text=normalize_query_text(full_text),
                page_number=curr_q_page,
                page_end=curr_q_end_page,
                marks=marks,
                bbox=bbox,
            )
        )

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            if curr_q_lines:
                curr_q_lines.append("")
            continue

        page_m = PAGE_MARKER_REGEX.match(line)
        if page_m:
            try:
                current_page = int(page_m.group(1))
            except Exception:
                pass
            continue

        if line == "---":
            continue

        if in_header:
            m = MAIN_Q_HEADER.match(line)
            if m:
                in_header = False
            else:
                if any(h in line.lower() for h in HEADER_IGNORE):
                    continue
                continue

        m = MAIN_Q_HEADER.match(line)
        if m:
            g1, g2 = m.group(1), m.group(2)
            num_str = g1 or g2
            num = int(num_str) if num_str else None

            if num is not None and 1 <= num <= 50:
                # Discard bare numbers that jump wildly from current question
                if curr_q_num is not None:
                    curr_val = int(re.sub(r"\D", "", curr_q_num))
                    if g2 and num > curr_val + 2 and not g1:
                        curr_q_lines.append(line)
                        curr_q_end_page = current_page
                        continue

                flush()
                curr_q_num = f"Q{num}"
                curr_q_lines = [line]
                curr_q_page = current_page
                curr_q_end_page = current_page
                continue

        if curr_q_num is not None:
            # Skip page footer artifacts
            if "kiit-du" in line.lower() or re.match(r"^\(\s*\d+\s*\)$", line):
                continue
            curr_q_lines.append(line)
            curr_q_end_page = current_page

    flush()

    # Fallback if no questions extracted
    if not questions and result.pages:
        auto_idx = 1
        for p in result.pages:
            p_text = (p.markdown or "\n".join(e.text for e in p.elements)).strip()
            if not p_text:
                continue
            questions.append(
                ExtractedQuestion(
                    question_number=f"Q{auto_idx}",
                    question_text=p_text,
                    normalized_text=normalize_query_text(p_text),
                    page_number=p.page_number,
                    page_end=p.page_number,
                    marks=10.0,
                    bbox=[50.0, 50.0, round(p.width - 50.0, 2), round(p.height - 50.0, 2)],
                )
            )
            auto_idx += 1

    return split_inline_subquestions(questions)
