# The purpose of the file is to make a llm call and generate response.


import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    # Always load the backend's .env file, regardless of the terminal's directory.
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except ImportError:
    pass

from fastapi import HTTPException, status
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

try:
    from langchain_groq import ChatGroq
except ImportError:
    ChatGroq = None


from app.llm.prompts import GROUNDING_INSTRUCTIONS, build_structured_prompt
from app.query_processing.models import SearchIntent


def generate_grounded_answer(
    question: str,
    chunks: list[dict],
    intent: SearchIntent = SearchIntent.GENERAL,
) -> str:
    if ChatGroq is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Groq LLM integration is not available (langchain-groq is not installed).",
        )

    # Resolve the API Key
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,detail="GROQ_API_KEY is not configured on the server.",)

    # Build the Model
    llm = ChatGroq(model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"), max_tokens=600)

    user_input = build_structured_prompt(question, chunks, intent=intent)

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", GROUNDING_INSTRUCTIONS),
            ("human", "{user_input}")
        ]
    )

    chain = prompt | llm | StrOutputParser()

    response = chain.invoke({"user_input": user_input})
    return response.strip()
