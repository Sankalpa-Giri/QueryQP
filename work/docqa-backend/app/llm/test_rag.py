import os
import sys

# Import your functions
from app.llm.client import generate_grounded_answer

def run_test():
    print("Testing live Groq API call...")
    
    question = "What is the policy for unused vacation days?"
    
    # Ground truth documents to feed the model
    mock_chunks = [
        {
            "chunk_id": "hr-doc-101",
            "page_number": 3,
            "text": "Full-time employees receive 15 days of annual vacation."
        },
        {
            "chunk_id": "hr-doc-102",
            "page_number": 4,
            "text": "Employees may roll over a maximum of 5 unused vacation days into the next calendar year."
        }
    ]

    try:
        answer = generate_grounded_answer(question, mock_chunks)
        print("\n--- Model Response ---")
        print(answer)
        print("----------------------\n")
        
        # Basic functional checks
        assert len(answer) > 0, "Response is empty!"
        print("Live API execution succeeded.")

    except Exception as e:
        print(f"API Call failed: {e}", file=sys.stderr)

if __name__ == "__main__":
    run_test()