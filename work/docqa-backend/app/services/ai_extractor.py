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


def extract_questions_with_ai(
    markdown: str,
    subject_name: str | None = None,
    page_count: int = 1,
) -> list[ExtractedQuestion] | None:
    """Use AI to extract authentic, beautifully structured questions with LaTeX math and auto-topic tagging."""
    if not is_ai_available() or not markdown or len(markdown.strip()) < 20:
        return None

    subj_ctx = f"Subject: {subject_name}\n" if subject_name else ""

    prompt = f"""You are an expert university exam question paper parser.
{subj_ctx}Extract ALL distinct questions from the provided exam paper markdown into structured JSON.

Strict Parsing Instructions:
1. Identify primary question units (e.g. Q1, Q2, Q3, etc.). Keep all subquestions (a), (b), (c) intact inside their parent question block.
2. Fix all OCR typos, garbled characters, and missing symbols (e.g. transform 'O(m? + n log m)' into proper Big-O, convert broken ASCII to clean words).
3. Format ALL mathematical formulas, Big-O notations, summations, equations, and expressions using standard LaTeX math (inline: \( ... \) or display: $$ ... $$).
4. Format tables using standard GitHub Markdown tables (| col1 | col2 |).
5. Extract exact allocated marks for each question as a float (e.g. 5.0, 10.0, 4.0).
6. Auto-generate 2-4 standard academic curriculum topic tags for each question.
7. Identify the page number where each question starts and ends based on <!-- Page N --> markers.
8. Make sure to extract EVERY question present in the document from beginning to end (e.g. Q1, Q2, Q3, Q4, Q5, Q6, Q7, Q8, etc.). Do NOT omit any question.

Return a JSON object with a "questions" key containing a list of questions conforming to this structure:
{{
  "questions": [
    {{
      "question_number": "Q1",
      "question_text": "Complete question text with subparts (a), (b) formatted cleanly in Markdown with LaTeX equations",
      "marks": 5.0,
      "topics": ["Binary Search Tree", "Tree Traversal"],
      "page_number": 1,
      "page_end": 1
    }}
  ]
}}

Exam Paper Markdown:
{markdown}

Output JSON ONLY:"""

    try:
        data = _call_llm_json(prompt)
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
            if not q_num.upper().startswith("Q") and q_num[0].isdigit():
                q_num = f"Q{q_num}"

            q_text = str(item.get("question_text", "")).strip()
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
    """Refine a single question: fix OCR noise, convert math to clean LaTeX, format tables, and suggest topics."""
    subj_ctx = f"Subject: {subject_name}\n" if subject_name else ""
    prompt = f"""You are an academic exam proofreader and LaTeX formatting expert.
{subj_ctx}Review the following exam question text:
1. Fix all OCR errors, typos, and garbled symbols.
2. Format all mathematical equations, variables, and Big-O notations in clean LaTeX math (inline: \( ... \) or display: $$ ... $$).
3. Format tables in standard markdown table syntax.
4. Extract the marks allocated if present.
5. Provide 2-4 academic topic tags.

Question Text:
{question_text}

Respond strictly in JSON:
{{
  "question_text": "Refined question text with clean LaTeX math and Markdown formatting",
  "marks": 5.0,
  "topics": ["Topic 1", "Topic 2"]
}}"""

    data = _call_llm_json(prompt, system_prompt="You are an academic proofreader. Return JSON only.")
    if isinstance(data, dict) and data.get("question_text"):
        return {
            "question_text": str(data["question_text"]).strip(),
            "marks": data.get("marks"),
            "topics": data.get("topics", []),
        }

    return {"question_text": question_text, "marks": None, "topics": []}


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
