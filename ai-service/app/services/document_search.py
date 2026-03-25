"""
Hybrid document search combining vector semantic search with keyword full-text
search using Reciprocal Rank Fusion (RRF) for high-accuracy retrieval.

Uses the same embedding pipeline as the existing embeddings service and the
shared psycopg2 connection pool from app.database.
"""

import logging
from collections import defaultdict

import psycopg2.extras

from app.database import get_conn
from app.services.embeddings import generate_embedding

logger = logging.getLogger(__name__)

# Words that signal a multi-part or broad query
_MULTI_INDICATORS = frozenset({
    "and", "or", "all", "compare", "versus", "vs", "both", "every", "each",
    "list", "summarize", "overview", "everything", "between",
})

_BROAD_INDICATORS = frozenset({
    "tell", "about", "describe", "what", "overview", "summary", "details",
    "information", "explain", "walk", "through", "breakdown", "highlights",
    "key", "main", "important",
})

_WHOLE_DOC_WORDS = frozenset({
    "document", "contract", "file", "report", "memorandum", "agreement",
    "listing", "offering", "pdf", "upload", "uploaded",
})


# ---------------------------------------------------------------------------
# Internal search functions
# ---------------------------------------------------------------------------

def _vector_search(
    query_embedding: list[float],
    agent_id: str,
    limit: int,
    document_id: str | None = None,
    contact_id: str | None = None,
) -> list[tuple[str, float]]:
    """Run cosine-similarity search against document_chunks embeddings.

    Returns a list of (chunk_id, similarity_score) ordered by descending
    similarity.
    """
    embedding_str = str(query_embedding)

    # Build query dynamically based on optional filters
    conditions = ["dc.agent_id = %s"]
    params: list = [embedding_str, agent_id]

    if document_id is not None:
        conditions.append("dc.document_id = %s")
        params.append(document_id)

    if contact_id is not None:
        conditions.append(
            "dc.document_id IN (SELECT id FROM documents WHERE contact_id = %s)"
        )
        params.append(contact_id)

    where_clause = " AND ".join(conditions)
    params.extend([embedding_str, limit])

    query = f"""
        SELECT dc.id, 1 - (dc.embedding <=> %s::vector) AS similarity
        FROM document_chunks dc
        WHERE {where_clause}
        ORDER BY dc.embedding <=> %s::vector
        LIMIT %s
    """

    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(query, params)
        rows = cur.fetchall()

    return [(str(row[0]), float(row[1])) for row in rows]


def _keyword_search(
    query: str,
    agent_id: str,
    limit: int,
    document_id: str | None = None,
    contact_id: str | None = None,
) -> list[tuple[str, float]]:
    """Run PostgreSQL full-text search against document_chunks.search_vector.

    Uses plainto_tsquery for safe parsing of arbitrary user input.
    Returns a list of (chunk_id, ts_rank_score) ordered by descending rank.
    May return an empty list if the query contains only stop words.
    """
    conditions = [
        "dc.agent_id = %s",
        "dc.search_vector @@ plainto_tsquery('english', %s)",
    ]
    params: list = [query, agent_id, query]

    if document_id is not None:
        conditions.append("dc.document_id = %s")
        params.append(document_id)

    if contact_id is not None:
        conditions.append(
            "dc.document_id IN (SELECT id FROM documents WHERE contact_id = %s)"
        )
        params.append(contact_id)

    where_clause = " AND ".join(conditions)
    params.append(limit)

    sql = f"""
        SELECT dc.id, ts_rank(dc.search_vector, plainto_tsquery('english', %s)) AS rank
        FROM document_chunks dc
        WHERE {where_clause}
        ORDER BY rank DESC
        LIMIT %s
    """

    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, params)
        rows = cur.fetchall()

    return [(str(row[0]), float(row[1])) for row in rows]


def _reciprocal_rank_fusion(
    vector_results: list[tuple[str, float]],
    keyword_results: list[tuple[str, float]],
    k_constant: int = 60,
) -> list[tuple[str, float]]:
    """Merge two ranked lists using Reciprocal Rank Fusion.

    RRF score for each document is the sum of 1/(k + rank + 1) across all
    lists in which it appears.  The k_constant (default 60) dampens the
    influence of high ranks so that documents appearing in both lists are
    strongly boosted.

    Returns results sorted by descending RRF score.
    """
    scores: dict[str, float] = defaultdict(float)

    for rank, (chunk_id, _score) in enumerate(vector_results):
        scores[chunk_id] += 1.0 / (k_constant + rank + 1)

    for rank, (chunk_id, _score) in enumerate(keyword_results):
        scores[chunk_id] += 1.0 / (k_constant + rank + 1)

    return sorted(scores.items(), key=lambda x: x[1], reverse=True)


# ---------------------------------------------------------------------------
# Dynamic-k and result refinement
# ---------------------------------------------------------------------------

def determine_k(query: str) -> int:
    """Heuristic-based dynamic k selection.

    Examines query complexity (word count, multi-part indicators, broad/summary
    indicators, and document references) to decide how many chunks to retrieve.

    Returns:
        4  for simple, targeted queries
        8  for medium-complexity queries
        12 for complex or whole-document summary queries
    """
    words = query.lower().split()
    word_count = len(words)
    multi_count = sum(1 for w in words if w in _MULTI_INDICATORS)
    broad_count = sum(1 for w in words if w in _BROAD_INDICATORS)
    doc_ref = any(w in words for w in _WHOLE_DOC_WORDS)
    question_marks = query.count("?")
    commas = query.count(",")

    # Whole-document summary request (e.g. "tell me about the contract")
    if doc_ref and broad_count >= 1:
        return 12

    # Complex: long query with multiple breadth indicators
    if word_count > 20 and multi_count >= 2:
        return 12

    # Medium: broad query, moderately long, or has a multi-indicator
    if broad_count >= 2 or word_count > 8 or multi_count >= 1 or question_marks > 1 or commas >= 1:
        return 8

    # Simple
    return 4


def refine_results_by_score_gap(
    results: list[dict],
    base_k: int,
) -> list[dict]:
    """Trim results based on score distribution.

    - If 0-2 results: return as-is (too few to trim).
    - If top-1 score is >30% higher than #2: clear winner -- return top 3.
    - If top N results are within 20% of top score: return the whole cluster
      (capped at base_k + 5).
    - Otherwise: return top base_k.
    """
    if len(results) <= 2:
        return results

    top_score = results[0]["rrf_score"]
    second_score = results[1]["rrf_score"]

    # Guard against zero scores
    if top_score == 0:
        return results[:base_k]

    # Clear winner: top result dominates
    if (top_score - second_score) / top_score > 0.30:
        return results[:3]

    # Cluster: all results within 20% of the top score
    threshold = top_score * 0.80
    cluster = [r for r in results if r["rrf_score"] >= threshold]
    if len(cluster) > base_k + 5:
        cluster = cluster[: base_k + 5]
    if cluster:
        return cluster

    return results[:base_k]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def hybrid_search(
    query: str,
    agent_id: str,
    k: int | None = None,
    document_id: str | None = None,
    contact_id: str | None = None,
) -> list[dict]:
    """Execute a hybrid vector + keyword search with RRF fusion.

    Args:
        query: Natural-language search query.
        agent_id: The authenticated agent's UUID (for RLS scoping).
        k: Number of results to return.  If None, determined automatically
           from query complexity via determine_k().
        document_id: Optional filter to a single document.
        contact_id: Optional filter to documents belonging to a contact.

    Returns:
        List of dicts, each containing:
            chunk_id, content, page_number, section_heading, filename,
            document_id, file_type, chunk_index, rrf_score
    """
    if k is None:
        k = determine_k(query)

    fetch_limit = k * 3  # over-fetch for better fusion candidates

    logger.debug(
        "hybrid_search: query=%r agent=%s k=%d fetch_limit=%d doc=%s contact=%s",
        query[:80], agent_id, k, fetch_limit, document_id, contact_id,
    )

    # Generate the query embedding
    try:
        query_embedding = generate_embedding(query)
    except Exception:
        logger.exception("Failed to generate query embedding")
        return []

    # Run both search strategies
    vector_results = _vector_search(
        query_embedding, agent_id, fetch_limit, document_id, contact_id,
    )
    keyword_results = _keyword_search(
        query, agent_id, fetch_limit, document_id, contact_id,
    )

    logger.debug(
        "hybrid_search: vector_hits=%d keyword_hits=%d",
        len(vector_results), len(keyword_results),
    )

    # If both are empty, nothing to return
    if not vector_results and not keyword_results:
        return []

    # Fuse and rank
    fused = _reciprocal_rank_fusion(vector_results, keyword_results)

    # Build score lookup and preliminary results
    score_map = {chunk_id: score for chunk_id, score in fused}
    top_ids = [chunk_id for chunk_id, _score in fused[:fetch_limit]]

    if not top_ids:
        return []

    # Fetch full chunk data for the top candidates
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT dc.id AS chunk_id, dc.content, dc.page_number,
                   dc.section_heading, dc.chunk_index, dc.metadata,
                   dc.document_id, d.filename, d.file_type
            FROM document_chunks dc
            JOIN documents d ON d.id = dc.document_id
            WHERE dc.id = ANY(%s::uuid[]) AND dc.agent_id = %s
            """,
            (top_ids, agent_id),
        )
        rows = {str(r["chunk_id"]): dict(r) for r in cur.fetchall()}

    # Assemble results preserving RRF ranking order
    results: list[dict] = []
    for chunk_id, rrf_score in fused:
        if chunk_id not in rows:
            continue
        row = rows[chunk_id]
        results.append({
            "chunk_id": str(row["chunk_id"]),
            "content": row["content"],
            "page_number": row["page_number"],
            "section_heading": row["section_heading"],
            "filename": row["filename"],
            "document_id": str(row["document_id"]),
            "file_type": row["file_type"],
            "chunk_index": row["chunk_index"],
            "rrf_score": rrf_score,
        })

    # Apply adaptive trimming
    results = refine_results_by_score_gap(results, k)

    logger.info("hybrid_search: returning %d results for query=%r", len(results), query[:60])
    return results
