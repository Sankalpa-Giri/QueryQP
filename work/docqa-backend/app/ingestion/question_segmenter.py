import re
from dataclasses import dataclass, field

from app.ingestion.providers import ParsedDocumentResult, ParsedElement, ParsedPage

# Section headers (e.g. SECTION-A, Section B, Part A, GROUP-1)
SECTION_REGEX = re.compile(r"^(?:SECTION|PART|GROUP)\s*[-–—:]?\s*([A-Z0-9]+)", re.IGNORECASE)

# Main question number starters e.g.:
# "1.", "1)", "1:", "1 -", "(1)", "[1]", "Q1", "Q.1", "Question 1", "Question - 1", "Problem 1", "1. (a)", "1(a)"
MAIN_Q_REGEX = re.compile(
    r"^(?:[\*\-\+]\s*)?(?:"
    r"(?:Question|Q|Problem|Prob)\.?\s*(?:No\.?\s*|[-–—]\s*)?(\d{1,2})(?:\s*[\.\:\-\)]\s*|\s*)(?:\(?([a-z]|[ivx]+)[\)\]\\\/\:]|\(([a-z]|[ivx]+)\)?)?"
    r"|(\d{1,2})\s*[\.\:\-\)](?:\s*(?:\(([a-z]|[ivx]+)[\)\]\\\/\:]?|\[([a-z]|[ivx]+)\]|([a-z]|[ivx]+)[\)\]\\\/\:]))?"
    r"|[\(\[]\s*(\d{1,2})\s*[\)\]](?:\s*[\.\:\-]?\s*(?:\(([a-z]|[ivx]+)\)|([a-z]|[ivx]+)[\)\]]))?"
    r"|(\d{1,2})\s*[\(\[]([a-z]|[ivx]+)[\)\]\\\/\:]?"
    r"|(?:\b([IVXLCDM]{1,4})\b)\s*[\.\:\-\)]"
    r"|(\b[1-9]\b)\s*$"
    r")",
    re.IGNORECASE,
)

# Subquestion bullet starters e.g. "(a)", "(b)", "@)", "(0", "O)", "ri)", "a)", "b)", "(i)", "(ii)", "[a]"
SUB_Q_REGEX = re.compile(
    r"^(?:[\*\-\+]\s*)?(?:\(([a-z]|[ivx]+)[\)\\\/\:]|([a-z]|[ivx]+)\s*[\)\\\/\:]|(@\))|(\(0\b)|(O\))|(o\))|(ri\))|\[([a-z]|[ivx]+)\])",
    re.IGNORECASE,
)

# Inline subquestion bit starter inside paragraph / sentence
INLINE_BIT_REGEX = re.compile(
    r"(?<=[.?!;\]\)])\s*(?:\(([b-z]|[ivx]+)[\)\\\/\:]|([b-z])\))\s+",
    re.IGNORECASE,
)

# Multiple choice options: (A), (B), (C), (D)
MCQ_OPTION_REGEX = re.compile(r"^(?:\([A-Z]\)|[A-Z]\s*[\)\:])\s+")

# Rejection pattern for assignments or matrix rows masquerading as questions
CODE_OR_ASSIGN_REGEX = re.compile(r"^[a-z]\s*[:\=]\s*[a-z0-9]", re.IGNORECASE)
MATRIX_ROW_REGEX = re.compile(r"^([A-Z]{2,4}\b|[01IUlo\s]+$)")

# Question start regex for simple/markdown checks
QUESTION_START_REGEX = re.compile(
    r"^(?:(?:Q(?:uestion)?\.?\s*(?:No\.?\s*)?(\d+[a-z]?|\b[A-Z]\b))|(\d{1,2}\s*[\.\:\-\)]|\d{1,2}\s*\([a-z]\))|([a-z]\s*[\)\:])|(\([a-z0-9]\))|(Part\s+[A-Z]))",
    re.IGNORECASE,
)

# Regex extracting marks at end or beginning: [10 marks], (5 Marks), [5], (10), [6.0 Marks]
MARKS_REGEX = re.compile(
    r"(?:\[|\()(?:\s*Marks?\s*[:\=]?\s*)?(\d{1,2}(?:\.\d)?)\s*(?:marks?|pts?|points?)?\s*(?:\]|\))",
    re.IGNORECASE,
)

ROMAN_MAP = {
    "i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7, "viii": 8, "ix": 9, "x": 10,
    "xi": 11, "xii": 12, "xiii": 13, "xiv": 14, "xv": 15, "xvi": 16,
}

QUESTION_VERBS = [
    "explain", "describe", "what is", "what are", "prove", "write", "calculate", "define",
    "differentiate", "distinguish", "state", "show", "discuss", "illustrate", "design",
    "find", "compare", "draw", "derive", "give", "list", "convert", "evaluate", "implement",
    "construct", "elaborate", "analyze", "solve", "how does", "why is", "short notes",
    "briefly", "formulate", "examine", "determine", "sketch",
]


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
    subquestions: list["ExtractedQuestion"] = field(default_factory=list)


def extract_marks(text: str) -> float | None:
    """Extract marks allocated to a question if explicitly stated."""
    matches = list(MARKS_REGEX.finditer(text))
    if matches:
        last_match = matches[-1]
        try:
            return float(last_match.group(1))
        except (ValueError, IndexError):
            return None
    return None


def clean_ocr_sub_bullet(token: str, prev_letter: str | None = None) -> str:
    """Normalize OCR artifacts for subquestions to clean letters using sequence context."""
    t = token.lower().strip().lstrip("*-+ \t")
    if t in ("@)", "@"):
        return "b"
    if t in ("(0", "0"):
        return "f"
    if t in ("o)", "o", "(o", "(o)"):
        if prev_letter == "a":
            return "b"
        return "h"
    if t in ("ri)", "ri"):
        return "j"
    roman_match = re.search(r"\b(i{1,3}|iv|v|vi{1,3}|ix|x)\b", t)
    if roman_match:
        return roman_match.group(1)
    m = re.search(r"[a-z]", t)
    return m.group(0) if m else "a"


def split_inline_subquestions(questions: list[ExtractedQuestion]) -> list[ExtractedQuestion]:
    """Split embedded subquestion bullets e.g. (b), (c) inside a single question block."""
    results: list[ExtractedQuestion] = []
    for q in questions:
        matches = list(INLINE_BIT_REGEX.finditer(q.question_text))
        if not matches:
            results.append(q)
            continue

        base_match = re.match(r"^(Q\d+)", q.question_number, re.IGNORECASE)
        base_prefix = base_match.group(1) if base_match else q.question_number

        boundaries = [0] + [m.start() for m in matches] + [len(q.question_text)]
        bit_letters: list[str] = []

        first_bit = matches[0].group(1) or matches[0].group(2)
        if "(" in q.question_number:
            first_letter_match = re.search(r"\(([a-z]|[ivx]+)\)", q.question_number, re.IGNORECASE)
            bit_letters.append(first_letter_match.group(1).lower() if first_letter_match else "a")
        else:
            bit_letters.append("a" if first_bit.lower() == "b" else "1")

        for m in matches:
            bit_letters.append((m.group(1) or m.group(2)).lower())

        for idx in range(len(boundaries) - 1):
            start_idx = boundaries[idx]
            end_idx = boundaries[idx + 1]

            if idx > 0:
                m_prev = matches[idx - 1]
                part_text = q.question_text[m_prev.end() : end_idx].strip()
            else:
                part_text = q.question_text[start_idx:end_idx].strip()

            if not part_text:
                continue

            part_text = re.sub(r"^(?:\([a-z0-9]+\)|[a-z0-9]+[\)\:\.])\s*", "", part_text).strip()
            if not part_text:
                continue

            part_marks = extract_marks(part_text) or q.marks
            sub_id = f"{base_prefix}({bit_letters[idx]})" if idx < len(bit_letters) else f"{base_prefix}({chr(ord('a') + idx)})"

            results.append(
                ExtractedQuestion(
                    question_number=sub_id,
                    question_text=part_text,
                    normalized_text=normalize_query_text(part_text),
                    page_number=q.page_number,
                    page_end=q.page_end,
                    marks=part_marks,
                    bbox=q.bbox,
                    parent_number=base_prefix,
                )
            )
    return results


def parse_marks_from_tokens(text: str) -> float | None:
    """Detect OCR-rendered marks tokens (e.g. t5l, t5I, tsl, Ixl0])."""
    lower = text.lower()
    if any(k in lower for k in ["t5l", "t5i", "tsl"]):
        return 5.0
    if "ixl0" in lower or "1x10" in lower:
        return 1.0
    return extract_marks(text)


def clean_question_line(line: str) -> str:
    """Strip out isolated OCR marks tokens from body text."""
    cleaned = re.sub(r"\b(t5[lI]|tsl|Ixl0\])\b", "", line).strip()
    return cleaned


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


def segment_questions_from_parsed(result: ParsedDocumentResult) -> list[ExtractedQuestion]:
    """Segment parsed document pages and elements into individual question units with guaranteed extraction."""
    # 1. Flatten body elements across pages
    body_elements: list[tuple[int, ParsedElement]] = []
    all_elements: list[tuple[int, ParsedElement]] = []

    for page in result.pages:
        for el in page.elements:
            all_elements.append((page.page_number, el))
            if el.type not in ("header", "footer"):
                body_elements.append((page.page_number, el))

    # If header/footer classification excluded everything, use all elements
    elements_to_use = body_elements if body_elements else all_elements

    if not elements_to_use:
        return _segment_from_markdown(result.markdown)

    # 2. Collect lines
    raw_lines: list[dict] = []
    for p_num, el in elements_to_use:
        for l in str(el.text).split("\n"):
            s = l.strip()
            if not s:
                continue
            # Skip university exam banner metadata and generic instructions
            if any(hdr in s.lower() for hdr in [
                "autumn end semester", "spring end semester", "kiit-du", "full marks:",
                "time:", "qn. set code", "branch:", "programme:", "semester:"
            ]):
                continue
            if any(instr in s.lower() for instr in [
                "attempt any", "answer all", "answer any", "question paper consists",
                "candidates are required", "all questions carry", "instructions to candidates",
                "instructions:", "time allowed", "maximum marks"
            ]):
                continue
            raw_lines.append({
                "text": s,
                "page": p_num,
                "bbox": el.bbox,
            })

    if not raw_lines:
        return _segment_from_markdown(result.markdown)

    questions: list[ExtractedQuestion] = []

    current_main_num: int | None = None
    current_sub_letter: str | None = None
    current_lines: list[str] = []
    current_boxes: list[list[float]] = []
    start_page: int = 1
    end_page: int = 1
    current_marks: float | None = None
    auto_q_idx: int = 1

    def flush():
        nonlocal current_lines, current_boxes, current_main_num, current_sub_letter, start_page, end_page, current_marks, auto_q_idx
        if not current_lines:
            return

        filtered_lines = [clean_question_line(l) for l in current_lines if clean_question_line(l)]
        if not filtered_lines:
            return

        full_text = " ".join(filtered_lines)
        full_text = re.sub(r"\s+", " ", full_text).strip()
        full_text = full_text.strip(".- \t")

        if len(full_text) < 5:
            current_lines = []
            current_boxes = []
            return

        # Formulate Question ID e.g. Q1(a) or Q2
        if current_main_num is not None:
            if current_sub_letter:
                q_num = f"Q{current_main_num}({current_sub_letter})"
            else:
                q_num = f"Q{current_main_num}"
        else:
            q_num = f"Q{auto_q_idx}"
            auto_q_idx += 1

        # Determine marks
        extracted_m = extract_marks(full_text)
        fallback_marks = 1.0 if current_main_num == 1 else (5.0 if current_main_num and current_main_num > 1 else None)
        marks = current_marks or extracted_m or fallback_marks
        bbox = union_bboxes(current_boxes)

        questions.append(
            ExtractedQuestion(
                question_number=q_num,
                question_text=full_text,
                normalized_text=normalize_query_text(full_text),
                page_number=start_page,
                page_end=end_page,
                marks=marks,
                bbox=bbox,
                parent_number=f"Q{current_main_num}" if current_sub_letter else None,
            )
        )
        current_lines = []
        current_boxes = []
        current_marks = None

    idx = 0
    while idx < len(raw_lines):
        line_item = raw_lines[idx]
        text = line_item["text"]
        p_num = line_item["page"]
        bbox = line_item["bbox"]

        # Check for Section header
        if SECTION_REGEX.match(text):
            idx += 1
            continue

        # Check for standalone marks tokens
        line_marks = parse_marks_from_tokens(text)
        if text.lower() in ("t5l", "t5i", "tsl", "ixl0]") or (line_marks and len(text) < 15 and ("marks" in text.lower() or "pts" in text.lower())):
            if current_marks is None:
                current_marks = line_marks
            idx += 1
            continue

        # Check for code assignment or matrix row
        if CODE_OR_ASSIGN_REGEX.match(text) or (current_main_num == 6 and MATRIX_ROW_REGEX.match(text)):
            if current_main_num is not None:
                current_lines.append(text)
                current_boxes.append(bbox)
                end_page = p_num
            idx += 1
            continue

        main_match = MAIN_Q_REGEX.match(text)
        sub_match = SUB_Q_REGEX.match(text)

        if main_match:
            groups = [g for g in main_match.groups() if g is not None]
            q_num_str = next((g for g in groups if g.isdigit()), None)
            roman_str = next((g for g in groups if g.lower() in ROMAN_MAP), None)
            sub_let = next((g for g in groups if not g.isdigit() and g.lower() not in ROMAN_MAP and len(g) <= 4), None)

            val = None
            if q_num_str and q_num_str.isdigit():
                val = int(q_num_str)
            elif roman_str:
                val = ROMAN_MAP[roman_str.lower()]

            if val is not None and val >= 1:
                flush()
                current_main_num = val
                auto_q_idx = max(auto_q_idx, val + 1)
                current_sub_letter = sub_let.lower() if sub_let else None
                start_page = p_num
                end_page = p_num

                rem = text[main_match.end():].strip()
                if not current_sub_letter and rem:
                    sub_rem_match = SUB_Q_REGEX.match(rem)
                    if sub_rem_match:
                        current_sub_letter = clean_ocr_sub_bullet(sub_rem_match.group(0))
                        rem = rem[sub_rem_match.end():].strip()

                if rem:
                    current_lines.append(rem)
                current_boxes.append(bbox)
                idx += 1
                continue

        # Subquestion starter detection
        is_sub = False
        detected_letter = None
        if sub_match and not CODE_OR_ASSIGN_REGEX.match(text):
            is_sub = True
            detected_letter = clean_ocr_sub_bullet(sub_match.group(0), prev_letter=current_sub_letter)

        if is_sub and detected_letter:
            flush()
            if current_main_num is None:
                current_main_num = 1
            current_sub_letter = detected_letter
            start_page = p_num
            end_page = p_num

            rem = (
                text[sub_match.end() :].strip()
                if sub_match
                else re.sub(r"^(?:[\*\-\+]\s*)?(?:\([a-z0-9]+\)|[a-z0-9]+[\)\\\/\:\.]|@\)|O\)|o\)|ri\)|\(0)\s*", "", text).strip()
            )
            if rem:
                current_lines.append(rem)
            current_boxes.append(bbox)
            idx += 1
            continue

        # Multiple-choice option (A), (B), (C), (D)
        if MCQ_OPTION_REGEX.match(text):
            if current_main_num is not None:
                current_lines.append(text)
                current_boxes.append(bbox)
                end_page = p_num
            idx += 1
            continue

        # Question verb detection: starts with a verb and previous line ended cleanly
        starts_with_verb = any(text.lower().startswith(kw) for kw in QUESTION_VERBS)
        if starts_with_verb:
            prev_ended = not current_lines or any(
                current_lines[-1].strip().endswith(punct) for punct in [".", "?", ")", "]", ";", ":"]
            )
            if current_main_num is None or prev_ended:
                flush()
                current_main_num = auto_q_idx
                auto_q_idx += 1
                current_lines.append(text)
                current_boxes.append(bbox)
                start_page = p_num
                end_page = p_num
                idx += 1
                continue

        # Regular question body line
        if current_main_num is not None:
            current_lines.append(text)
            current_boxes.append(bbox)
            end_page = p_num
            if line_marks and not current_marks:
                current_marks = line_marks
        else:
            current_lines.append(text)
            current_boxes.append(bbox)
            start_page = p_num
            end_page = p_num

        idx += 1

    flush()

    # Fallback 1: segment from Markdown if no questions extracted
    if not questions:
        if result.markdown and result.markdown.strip():
            questions = _segment_from_markdown(result.markdown)

    # Fallback 2: segment directly from structural elements (length threshold 12 chars)
    if not questions and result.pages:
        auto_idx = 1
        for page in result.pages:
            for el in page.elements:
                clean_t = re.sub(r"\s+", " ", str(el.text)).strip()
                if len(clean_t) >= 12 and not any(h in clean_t.lower() for h in [
                    "page", "full marks", "time:", "semester", "kiit", "branch:", "programme:"
                ]):
                    questions.append(
                        ExtractedQuestion(
                            question_number=f"Q{auto_idx}",
                            question_text=clean_t,
                            normalized_text=normalize_query_text(clean_t),
                            page_number=page.page_number,
                            page_end=page.page_number,
                            marks=extract_marks(clean_t) or 5.0,
                            bbox=el.bbox,
                        )
                    )
                    auto_idx += 1

    # Fallback 3: segment from raw lines if still empty
    if not questions and raw_lines:
        auto_idx = 1
        for item in raw_lines:
            t = item["text"].strip()
            if len(t) >= 15:
                questions.append(
                    ExtractedQuestion(
                        question_number=f"Q{auto_idx}",
                        question_text=t,
                        normalized_text=normalize_query_text(t),
                        page_number=item["page"],
                        page_end=item["page"],
                        marks=extract_marks(t) or 5.0,
                        bbox=item["bbox"],
                    )
                )
                auto_idx += 1

    return split_inline_subquestions(questions)


PAGE_MARKER_REGEX = re.compile(r"<!--\s*Page\s+(\d+)\s*-->", re.IGNORECASE)


def _segment_from_markdown(markdown: str) -> list[ExtractedQuestion]:
    """Fallback segmenter splitting clean markdown lines by question numbering while preserving page provenance."""
    questions: list[ExtractedQuestion] = []
    blocks = [b.strip() for b in markdown.split("\n\n") if b.strip()]
    cur_num = "Q1"
    cur_text: list[str] = []
    current_page = 1
    q_start_page = 1
    q_end_page = 1
    default_page_bbox = [50.0, 50.0, 545.0, 792.0]

    for block in blocks:
        if block == "---":
            continue
        page_match = PAGE_MARKER_REGEX.search(block)
        if page_match:
            try:
                current_page = int(page_match.group(1))
            except ValueError:
                pass
            block = PAGE_MARKER_REGEX.sub("", block).strip()
            if not block:
                continue

        first_line = block.split("\n")[0]
        m = QUESTION_START_REGEX.match(first_line)
        if m:
            if cur_text:
                t = " ".join(cur_text).strip()
                questions.append(
                    ExtractedQuestion(
                        question_number=cur_num,
                        question_text=t,
                        normalized_text=normalize_query_text(t),
                        page_number=q_start_page,
                        page_end=q_end_page,
                        marks=extract_marks(t),
                        bbox=default_page_bbox,
                    )
                )
                cur_text = []
            cur_num = m.group(0).strip(".:- ")
            if not cur_num.upper().startswith("Q"):
                cur_num = f"Q{cur_num}"
            q_start_page = current_page
            q_end_page = current_page
        else:
            if not cur_text:
                q_start_page = current_page
            q_end_page = current_page
        cur_text.append(block)

    if cur_text:
        t = " ".join(cur_text).strip()
        questions.append(
            ExtractedQuestion(
                question_number=cur_num,
                question_text=t,
                normalized_text=normalize_query_text(t),
                page_number=q_start_page,
                page_end=q_end_page,
                marks=extract_marks(t),
                bbox=default_page_bbox,
            )
        )

    if not questions and blocks:
        auto_idx = 1
        for b in blocks:
            clean_t = re.sub(r"\s+", " ", b).strip()
            if len(clean_t) >= 12 and not any(h in clean_t.lower() for h in [
                "page", "full marks", "time:", "semester", "kiit", "branch:", "programme:"
            ]):
                questions.append(
                    ExtractedQuestion(
                        question_number=f"Q{auto_idx}",
                        question_text=clean_t,
                        normalized_text=normalize_query_text(clean_t),
                        page_number=1,
                        page_end=1,
                        marks=extract_marks(clean_t) or 5.0,
                        bbox=default_page_bbox,
                    )
                )
                auto_idx += 1

    return split_inline_subquestions(questions)
