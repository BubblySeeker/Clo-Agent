"""
Document tools: search and list uploaded documents.
"""
import logging

import psycopg2.extras

from app.database import get_conn, run_query

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _q(fn):
    """Open a connection + RealDictCursor, pass cursor to fn, return result."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return fn(cur)


# ---------------------------------------------------------------------------
# Tool definitions (Anthropic tool schema)
# ---------------------------------------------------------------------------

DEFINITIONS = [
    {
        "name": "search_documents",
        "description": (
            "Search uploaded documents using hybrid semantic + keyword search. "
            "Returns relevant chunks with content, filename, page number, and relevance score. "
            "Optionally scope to a specific document or contact."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query to find relevant document content",
                },
                "document_id": {
                    "type": "string",
                    "description": "Optional UUID to scope search to a single document",
                },
                "contact_id": {
                    "type": "string",
                    "description": "Optional UUID to scope search to a contact's documents",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "list_documents",
        "description": (
            "List all documents uploaded by the agent. "
            "Optionally filter to documents associated with a specific contact."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {
                    "type": "string",
                    "description": "Optional UUID to list only documents for this contact",
                },
            },
            "required": [],
        },
    },
]

# ---------------------------------------------------------------------------
# Tool classification
# ---------------------------------------------------------------------------

READ = {"search_documents", "list_documents"}
AUTO_EXECUTE: set[str] = set()
WRITE: set[str] = set()

# ---------------------------------------------------------------------------
# Read handlers
# ---------------------------------------------------------------------------

def _search_documents(agent_id: str, inp: dict):
    try:
        from app.services.document_search import (
            hybrid_search,
            determine_k,
            refine_results_by_score_gap,
        )
    except ImportError:
        logger.warning("document_search service not available")
        return {"error": "Document search service is not available", "results": []}

    try:
        query = inp["query"]
        document_id = inp.get("document_id")
        contact_id = inp.get("contact_id")

        k = determine_k(query)
        raw_results = hybrid_search(query, agent_id, k, document_id, contact_id)
        results = refine_results_by_score_gap(raw_results, k)

        formatted = []
        for r in results:
            formatted.append({
                "chunk_id": r["chunk_id"],
                "document_id": r["document_id"],
                "filename": r["filename"],
                "page_number": r.get("page_number"),
                "section_heading": r.get("section_heading"),
                "content": r["content"],
                "score": round(r["rrf_score"], 4),
            })

        return {
            "results": formatted,
            "total_found": len(formatted),
            "query": query,
            "k_used": k,
        }
    except Exception as e:
        logger.exception("search_documents tool error")
        return {"error": str(e), "results": []}


def _list_documents(agent_id: str, inp: dict):
    contact_id = inp.get("contact_id")

    def go(cur):
        if contact_id:
            cur.execute(
                """SELECT id, filename, file_type, file_size, status,
                          page_count, chunk_count, created_at
                   FROM documents
                   WHERE agent_id = %s AND contact_id = %s AND status = 'ready'
                   ORDER BY created_at DESC""",
                (agent_id, contact_id),
            )
        else:
            cur.execute(
                """SELECT id, filename, file_type, file_size, status,
                          page_count, chunk_count, created_at
                   FROM documents
                   WHERE agent_id = %s AND status = 'ready'
                   ORDER BY created_at DESC""",
                (agent_id,),
            )
        return [dict(r) for r in cur.fetchall()]

    return _q(go)


# ---------------------------------------------------------------------------
# Dispatchers (dict-based, no if/elif chains)
# ---------------------------------------------------------------------------

_READ_DISPATCH = {
    "search_documents": _search_documents,
    "list_documents": _list_documents,
}


async def execute(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a read tool."""
    handler = _READ_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown document read tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))
