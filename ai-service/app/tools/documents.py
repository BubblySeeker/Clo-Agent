"""
Document tools: search, list, update, and delete uploaded documents.
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
    {
        "name": "update_document",
        "description": (
            "Update a document's filename, folder, or associated contact."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "document_id": {"type": "string", "description": "UUID of the document"},
                "filename": {"type": "string", "description": "New filename"},
                "folder_id": {"type": "string", "description": "UUID of the folder to move to"},
                "contact_id": {"type": "string", "description": "UUID of the contact to associate with"},
            },
            "required": ["document_id"],
        },
    },
    {
        "name": "delete_document",
        "description": (
            "Permanently delete a document and all its chunks. Cannot be undone."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "document_id": {"type": "string", "description": "UUID of the document to delete"},
            },
            "required": ["document_id"],
        },
    },
]

# ---------------------------------------------------------------------------
# Tool classification
# ---------------------------------------------------------------------------

READ = {"search_documents", "list_documents"}
AUTO_EXECUTE = {"update_document"}
WRITE = {"delete_document"}

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
# Field sets for dynamic updates
# ---------------------------------------------------------------------------

_DOCUMENT_FIELDS = {"filename", "folder_id", "contact_id"}

# ---------------------------------------------------------------------------
# Auto-execute handlers
# ---------------------------------------------------------------------------

def _update_document(agent_id: str, inp: dict):
    inp = dict(inp)
    document_id = inp.pop("document_id")

    def go(cur):
        clean = {k: v for k, v in inp.items() if k in _DOCUMENT_FIELDS}
        if not clean:
            return {"error": "No valid fields to update"}
        set_clause = ", ".join(f"{k} = %s" for k in clean)
        vals = list(clean.values()) + [document_id, agent_id]
        cur.execute(
            f"UPDATE documents SET {set_clause} "
            f"WHERE id = %s AND agent_id = %s RETURNING id",
            vals,
        )
        row = cur.fetchone()
        if not row:
            return {"error": "Document not found"}
        return {"updated": True, "document_id": document_id}

    return _q(go)


# ---------------------------------------------------------------------------
# Write handlers
# ---------------------------------------------------------------------------

def _delete_document(agent_id: str, inp: dict):
    document_id = inp["document_id"]

    def go(cur):
        # Verify ownership and get filename for confirmation preview
        cur.execute(
            "SELECT filename FROM documents WHERE id = %s AND agent_id = %s",
            (document_id, agent_id),
        )
        doc = cur.fetchone()
        if not doc:
            return {"error": "Document not found"}

        filename = doc["filename"]

        # CASCADE handles document_chunks
        cur.execute(
            "DELETE FROM documents WHERE id = %s AND agent_id = %s",
            (document_id, agent_id),
        )
        return {"deleted": True, "filename": filename}

    return _q(go)


# ---------------------------------------------------------------------------
# Dispatchers (dict-based, no if/elif chains)
# ---------------------------------------------------------------------------

_READ_DISPATCH = {
    "search_documents": _search_documents,
    "list_documents": _list_documents,
}

_AUTO_DISPATCH = {
    "update_document": _update_document,
}

_WRITE_DISPATCH = {
    "delete_document": _delete_document,
}


async def execute(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a read tool."""
    handler = _READ_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown document read tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_auto(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute an auto-execute tool."""
    handler = _AUTO_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown document auto-execute tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_write(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a confirmed write tool."""
    handler = _WRITE_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown document write tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))
