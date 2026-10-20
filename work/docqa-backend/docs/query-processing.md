# Query processing

## Responsibility

The query-processing module is the single entry point between a student question and retrieval. It does not answer questions, retrieve documents, or call an LLM.

It:

1. normalizes Unicode quotation marks and whitespace;
2. validates the final question length;
3. preserves the complete normalized question for semantic search;
4. extracts quoted phrases and meaningful terms for future PostgreSQL FTS/BM25 search; and
5. assigns a lightweight intent label for retrieval policy and observability.

## Contract

`process_student_query()` returns `ProcessedQuery`:

| Field | Consumer | Purpose |
|---|---|---|
| `semantic_query` | Qdrant/vector search | Full normalized student question. |
| `keyword_terms` | PostgreSQL FTS/BM25 | Exact technical terms, excluding common stop words. |
| `exact_phrases` | PostgreSQL FTS/BM25 | Quoted phrases which must retain their order. |
| `intent` | Retrieval orchestration | Explanation, comparison, lookup, or general. |

## Current integration

`POST /search` and `POST /chat` call query processing before Qdrant search. Keyword fields are deliberately produced now but not yet executed: PostgreSQL FTS and hybrid merging are separate work items in the architecture.

## Non-goals

The module does not use an LLM to rewrite student questions. Rewriting can add unsupported concepts and reduce citation precision. Any future rewrite feature should be opt-in, evaluated, and retain the original query for retrieval fallback.
