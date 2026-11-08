import json
import logging
import os
import re
from typing import Any

from dotenv import load_dotenv

from app.core.config import settings
from app.ingestion.question_segmenter import ExtractedQuestion, normalize_query_text

# Ensure .env is loaded
load_dotenv()
load_dotenv("../.env")

logger = logging.getLogger(__name__)


def is_ai_available() -> bool:
    """Check if any supported AI LLM API key is configured."""
    return bool(
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or os.environ.get("GROQ_API_KEY")
        or settings.GROQ_API_KEY
        or os.environ.get("OPENAI_API_KEY")
    )


def _repair_and_load_json(raw: str) -> dict[str, Any] | list[Any] | None:
    """Safely parse JSON or attempt recovery if output was truncated."""
    if not raw or not raw.strip():
        return None
    try:
        return json.loads(raw)
    except Exception:
        pass
    # If JSON truncated, find last closing brace
    last_brace = raw.rfind("}")
    if last_brace != -1:
        truncated = raw[: last_brace + 1].strip()
        if not truncated.endswith("]"):
            truncated += "]}"
        try:
            return json.loads(truncated)
        except Exception:
            pass
    return None


def _call_llm_json(prompt: str, system_prompt: str = "You are a specialized exam document AI parsing system. Respond with valid JSON only.") -> dict[str, Any] | list[Any] | None:
    """Execute LLM call with structured JSON response using available provider (Gemini -> Groq -> OpenAI)."""
    # 1. Try Google Gemini if key configured
    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if gemini_key:
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=gemini_key)
            model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    response_mime_type="application/json",
                    temperature=0.1,
                    max_output_tokens=8192,
                ),
            )
            if response.text:
                parsed = _repair_and_load_json(response.text)
                if parsed:
                    return parsed
        except Exception as e:
            logger.warning("Gemini extraction call failed: %s. Trying fallback provider...", e)

    # 2. Try Groq if key configured
    groq_key = os.environ.get("GROQ_API_KEY") or settings.GROQ_API_KEY
    if groq_key:
        try:
            from groq import Groq

            client = Groq(api_key=groq_key)
            model_name = os.environ.get("GROQ_MODEL") or settings.GROQ_MODEL or "openai/gpt-oss-120b"
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=8000,
                response_format={"type": "json_object"},
            )
            raw = response.choices[0].message.content
            if raw:
                parsed = _repair_and_load_json(raw)
                if parsed:
                    return parsed
        except Exception as e:
            logger.warning("Groq extraction call failed: %s. Trying fallback provider...", e)
            # Try to recover from failed_generation if returned in error details
            try:
                err_dict = getattr(e, "body", None) or getattr(e, "response", None)
                if isinstance(err_dict, dict):
                    failed_gen = err_dict.get("error", {}).get("failed_generation")
                    if failed_gen:
                        salvaged = _repair_and_load_json(failed_gen)
                        if salvaged:
                            return salvaged
            except Exception:
                pass

    # 3. Try OpenAI if key configured
    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        try:
            from openai import OpenAI

            client = OpenAI(api_key=openai_key)
            model_name = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=8000,
                response_format={"type": "json_object"},
            )
            raw = response.choices[0].message.content
            if raw:
                parsed = _repair_and_load_json(raw)
                if parsed:
                    return parsed
        except Exception as e:
            logger.warning("OpenAI extraction call failed: %s", e)

    return None


def sanitize_question_text(text: str) -> str:
    """Clean hallucinated \\text{...} wrappers around plain text words and redundant formatting."""
    if not text:
        return ""
    # Normalize unicode non-breaking hyphens to regular hyphens
    text = text.replace("\u2011", "-")
    # Strip \(\text{Word}\) -> Word
    text = re.sub(r"\\\(\s*\\text\{([^\}]+)\}\s*\\\)", r"\1", text)
    # Strip \text{Word} outside math delimiters -> Word
    text = re.sub(r"\\text\{([^\}]+)\}", r"\1", text)
    # Strip single-word plain text erroneously wrapped in math delimiters like \(BFS\) -> BFS
    text = re.sub(r"\\\(\s*([a-zA-Z]{2,})\s*\\\)", r"\1", text)
    return text.strip()


def extract_questions_with_ai(
    markdown: str,
    subject_name: str | None = None,
    page_count: int = 1,
) -> list[ExtractedQuestion] | None:
    """Use AI to extract authentic, bit-wise structured questions with LaTeX math and auto-topic tagging."""
    if not is_ai_available() or not markdown or len(markdown.strip()) < 20:
        return None

    subj_ctx = f"Subject: {subject_name}\n" if subject_name else ""

    prompt = f"""You are an expert university exam question paper parser.
{subj_ctx}Extract ALL questions and subquestions from the provided exam paper markdown into structured JSON.

CRITICAL PARSING INSTRUCTIONS:
1. EXTRACT BIT-WISE (SUBQUESTION LEVEL):
   - You MUST extract every individual question subpart/bit as its OWN separate entry in the output list!
   - For example:
     - Question 1 with parts (a), (b), (c) MUST be extracted as three separate entries: "1(a)", "1(b)", "1(c)" (or "Q1(a)", "Q1(b)", "Q1(c)").
     - Question 7 with parts (a), (b) MUST be extracted as "7(a)" and "7(b)".
     - Question 8 with parts (a), (b), (c) MUST be extracted as "8(a)", "8(b)", "8(c)".
   - If a main question has no subparts (e.g. Question 3 is just a single standalone prompt), extract it as "Q3".
   - If there is a shared context, intro sentence, or diagram belonging to the parent question, include it in each subpart so each bit is completely self-contained.

2. DO NOT ANSWER THE QUESTIONS:
   - Only extract the question prompt as given in the exam paper.
   - NEVER generate answers, explanations, solutions, or extra examples. Keep student instructions (e.g. "Describe ... providing a suitable example") strictly as questions for the student to solve!

3. CLEAN MATHEMATICAL FORMULAS (LATEX):
   - Format mathematical formulas, variables, and Big-O notation using LaTeX math: \\( ... \\) for inline, $$ ... $$ for display.
   - NEVER wrap plain English words or acronyms in \\text{{...}}. Plain words must remain standard English markdown.

4. ACCURATE BIT-WISE MARKS:
   - Extract the specific marks allocated to that bit as a float (e.g. 5.0, 4.0, 2.5).
   - If only total marks for the parent question are given (e.g. Q7 is 8 marks total with 2 parts (a) and (b)), divide them proportionally (e.g. 4.0 each).

5. TOPIC TAGS:
   - Auto-generate 2-4 standard curriculum academic topic tags for each bit (e.g. ["Breadth-First Search", "Graph Traversal"]).

6. PAGE NUMBERS:
   - Identify the page number where each question bit appears based on <!-- Page N --> markers.

Return a JSON object conforming to:
{{
  "questions": [
    {{
      "question_number": "7(a)",
      "question_text": "Exact text of subpart 7(a) with clean LaTeX math for equations",
      "marks": 4.0,
      "topics": ["Graph Theory", "BFS"],
      "page_number": 2,
      "page_end": 2
    }}
  ]
}}

Exam Paper Markdown:
{markdown}

Output JSON ONLY:"""

    try:
        data = _call_llm_json(prompt, system_prompt="You are a university exam parsing assistant. Extract questions bit-wise without answering them. Output JSON only.")
        if not data:
            return None

        # Accept either {"questions": [...]} or raw list [...]
        raw_list = data.get("questions") if isinstance(data, dict) else data
        if not isinstance(raw_list, list) or not raw_list:
            return None

        extracted: list[ExtractedQuestion] = []
        for item in raw_list:
            if not isinstance(item, dict):
                continue
            q_num = str(item.get("question_number", "")).strip()
            if not q_num:
                continue

            q_text = sanitize_question_text(str(item.get("question_text", "")).strip())
            if len(q_text) < 5:
                continue

            marks_val = item.get("marks")
            try:
                marks_float = float(marks_val) if marks_val is not None else None
            except (ValueError, TypeError):
                marks_float = None

            p_start = item.get("page_number", 1)
            p_end = item.get("page_end", p_start)
            try:
                p_start = max(1, int(p_start))
                p_end = max(p_start, int(p_end))
            except (ValueError, TypeError):
                p_start = 1
                p_end = 1

            topics_raw = item.get("topics", [])
            topics_list = [str(t).strip() for t in topics_raw if str(t).strip()] if isinstance(topics_raw, list) else []

            extracted.append(
                ExtractedQuestion(
                    question_number=q_num,
                    question_text=q_text,
                    normalized_text=normalize_query_text(q_text),
                    page_number=p_start,
                    page_end=p_end,
                    marks=marks_float,
                    bbox=[50.0, 50.0, 545.0, 792.0],
                    topics=topics_list,
                )
            )

        if extracted:
            logger.info("AI extraction successfully extracted %d questions", len(extracted))
            return extracted

    except Exception as e:
        logger.warning("AI question extraction encountered an error: %s", e)

    return None


def refine_question_with_ai(
    question_text: str,
    subject_name: str | None = None,
) -> dict[str, Any]:
    """Refine a single question: fix OCR noise, convert math to clean LaTeX, format tables, and suggest topics without answering."""
    subj_ctx = f"Subject: {subject_name}\n" if subject_name else ""
    prompt = f"""You are an academic exam typographical proofreader.
{subj_ctx}Review the following exam question text:

CRITICAL SAFETY & PROOFREADING RULES:
1. DO NOT ANSWER, SOLVE, OR EXPLAIN THE QUESTION.
2. DO NOT ADD NEW EXAMPLES, FORMULAS, SOLUTIONS, OR TEXT THAT WAS NOT IN THE ORIGINAL QUESTION PROMPT.
   - If the question asks students to "Describe how the Noisy Channel Model is used for spelling correction, providing a suitable example", KEEP THAT EXACT QUESTION PROMPT FOR THE STUDENT. DO NOT WRITE THE EXAMPLE OR ANSWER YOURSELF!
3. DO NOT wrap ordinary English words, titles, acronyms, or subject terminology in \\text{{...}} or LaTeX math mode. (For example, NEVER write \\text{{graph ADT}}, \\text{{Breadth-First Search}}, or \\(\\text{{BFS}}\\). Keep normal English words as clean plain text).
4. ONLY use LaTeX math mode \\( ... \\) for actual mathematical variables, equations, and Big-O notation like \\(O(|V| + |E|)\\) or \\(f(x) = x^2\\).
5. Clean up OCR typos, garbled characters, or broken line breaks.
6. Format Markdown tables if present.
7. Extract marks if indicated in brackets (e.g. [5], (10 marks)).
8. Suggest 2-4 syllabus topic tags.

Original Question Text:
{question_text}

Respond strictly in JSON:
{{
  "question_text": "Cleaned original question text ONLY (DO NOT ANSWER OR EXPAND IT)",
  "marks": 5.0,
  "topics": ["Topic 1", "Topic 2"]
}}"""

    data = _call_llm_json(prompt, system_prompt="You are an academic typographical proofreader. DO NOT answer questions. Return JSON only.")
    if isinstance(data, dict) and data.get("question_text"):
        cleaned_text = sanitize_question_text(str(data["question_text"]).strip())
        return {
            "question_text": cleaned_text,
            "marks": data.get("marks"),
            "topics": data.get("topics", []),
        }

    return {"question_text": sanitize_question_text(question_text), "marks": None, "topics": []}


def auto_tag_topics_with_ai(
    question_text: str,
    subject_name: str | None = None,
) -> list[str]:
    """Analyze question content and generate 2-4 standard academic curriculum topic tags."""
    subj_ctx = f"Subject: {subject_name}\n" if subject_name else ""
    prompt = f"""Given the following exam question from university curriculum:
{subj_ctx}
Question Text:
{question_text}

Identify 2-4 specific academic topic tags (e.g. ['Binary Search Tree', 'AVL Rotations', 'Time Complexity']).
Respond strictly in JSON:
{{
  "topics": ["Topic 1", "Topic 2", "Topic 3"]
}}"""

    data = _call_llm_json(prompt, system_prompt="You are an academic taxonomy classifier. Return JSON only.")
    if isinstance(data, dict) and isinstance(data.get("topics"), list):
        return [str(t).strip() for t in data["topics"] if str(t).strip()]

    return []
