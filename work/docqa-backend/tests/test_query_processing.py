import unittest

from app.query_processing import SearchIntent, process_student_query


class QueryProcessingTests(unittest.TestCase):
    def test_normalizes_whitespace_and_keeps_complete_semantic_question(self) -> None:
        result = process_student_query("  Explain\n\t deadlock   prevention.  ")

        self.assertEqual(result.normalized_text, "Explain deadlock prevention.")
        self.assertEqual(result.semantic_query, "Explain deadlock prevention.")
        self.assertEqual(result.intent, SearchIntent.EXPLANATION)

    def test_extracts_exact_phrase_and_keywords_without_stop_words(self) -> None:
        result = process_student_query('Find questions about "deadlock prevention" in TCP.')

        self.assertEqual(result.exact_phrases, ("deadlock prevention",))
        self.assertEqual(result.keyword_terms, ("Find", "questions", "about", "deadlock", "prevention", "TCP"))
        self.assertEqual(result.intent, SearchIntent.LOOKUP)

    def test_deduplicates_keyword_terms_case_insensitively(self) -> None:
        result = process_student_query("Explain TCP and tcp reliability")

        self.assertEqual(result.keyword_terms, ("Explain", "TCP", "reliability"))

    def test_rejects_a_blank_question(self) -> None:
        with self.assertRaises(ValueError):
            process_student_query("  \n\t ")


if __name__ == "__main__":
    unittest.main()
