"""Note search used by the tutor: BM25 word matching blended with Gemini embeddings (meaning).

Chunks without a stored vector (or a question that could not be embedded) are ranked by words only.
"""
from app.ai import embeddings
from app.domain import retrieval


def search(user_id: int, query: str, document_id: int = None, k: int = retrieval.RETRIEVAL_TOP_K):
    """Top-k chunks of one document (``document_id``) or of all the student's notes."""
    rows = retrieval.chunks_of_document(document_id) if document_id else retrieval.chunks_of_user(user_id)
    vectors = embeddings.vectors_for(r["id"] for r in rows)
    query_vector = embeddings.query_vector(query) if vectors else None
    return retrieval.rank(rows, query, k, query_vector, vectors)
