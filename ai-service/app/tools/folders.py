"""
Folder tools: list, create, and manage contact and document folders.
"""
import psycopg2.extras

from app.database import get_conn, run_query

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
        "name": "list_contact_folders",
        "description": (
            "List all contact folders with the number of contacts in each folder."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "create_contact_folder",
        "description": "Create a new folder to organize contacts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Folder name"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "move_contacts_to_folder",
        "description": (
            "Move one or more contacts into a folder. "
            "Use list_contact_folders to get the folder_id first."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "folder_id": {"type": "string", "description": "UUID of the target folder"},
                "contact_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of contact UUIDs to move",
                },
            },
            "required": ["folder_id", "contact_ids"],
        },
    },
    {
        "name": "list_document_folders",
        "description": (
            "List all document folders with the number of documents in each folder."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "create_document_folder",
        "description": "Create a new folder to organize documents.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Folder name"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "rename_contact_folder",
        "description": "Rename an existing contact folder.",
        "input_schema": {
            "type": "object",
            "properties": {
                "folder_id": {"type": "string", "description": "UUID of the folder to rename"},
                "name": {"type": "string", "description": "New folder name"},
            },
            "required": ["folder_id", "name"],
        },
    },
    {
        "name": "delete_contact_folder",
        "description": (
            "Delete a contact folder. Contacts in the folder are NOT deleted — "
            "they are simply unfoldered."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "folder_id": {"type": "string", "description": "UUID of the folder to delete"},
            },
            "required": ["folder_id"],
        },
    },
    {
        "name": "remove_contacts_from_folder",
        "description": (
            "Remove one or more contacts from their folder without deleting the folder."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of contact UUIDs to unfolder",
                },
            },
            "required": ["contact_ids"],
        },
    },
    {
        "name": "rename_document_folder",
        "description": "Rename an existing document folder.",
        "input_schema": {
            "type": "object",
            "properties": {
                "folder_id": {"type": "string", "description": "UUID of the folder to rename"},
                "name": {"type": "string", "description": "New folder name"},
            },
            "required": ["folder_id", "name"],
        },
    },
    {
        "name": "delete_document_folder",
        "description": (
            "Delete a document folder. Documents in the folder are NOT deleted — "
            "they are simply unfoldered."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "folder_id": {"type": "string", "description": "UUID of the folder to delete"},
            },
            "required": ["folder_id"],
        },
    },
]

# ---------------------------------------------------------------------------
# Tool classification
# ---------------------------------------------------------------------------

READ = {"list_contact_folders", "list_document_folders"}
AUTO_EXECUTE = {"move_contacts_to_folder", "rename_contact_folder", "remove_contacts_from_folder", "rename_document_folder"}
WRITE = {"create_contact_folder", "create_document_folder", "delete_contact_folder", "delete_document_folder"}

# ---------------------------------------------------------------------------
# Read handlers
# ---------------------------------------------------------------------------

def _list_contact_folders(agent_id: str, inp: dict):
    def go(cur):
        cur.execute("""
            SELECT f.id, f.name, COUNT(c.id)::int AS contact_count
            FROM contact_folders f
            LEFT JOIN contacts c ON c.folder_id = f.id
            WHERE f.agent_id = %s
            GROUP BY f.id
            ORDER BY f.name
        """, (agent_id,))
        return [dict(r) for r in cur.fetchall()]

    return _q(go)


def _list_document_folders(agent_id: str, inp: dict):
    def go(cur):
        cur.execute("""
            SELECT f.id, f.name, COUNT(d.id)::int AS document_count
            FROM document_folders f
            LEFT JOIN documents d ON d.folder_id = f.id
            WHERE f.agent_id = %s
            GROUP BY f.id
            ORDER BY f.name
        """, (agent_id,))
        return [dict(r) for r in cur.fetchall()]

    return _q(go)


# ---------------------------------------------------------------------------
# Auto-execute handlers
# ---------------------------------------------------------------------------

def _move_contacts_to_folder(agent_id: str, inp: dict):
    folder_id = inp["folder_id"]
    contact_ids = inp["contact_ids"]

    def go(cur):
        # Verify folder ownership
        cur.execute(
            "SELECT id FROM contact_folders WHERE id = %s AND agent_id = %s",
            (folder_id, agent_id),
        )
        if not cur.fetchone():
            return {"error": "Folder not found"}

        cur.execute(
            "UPDATE contacts SET folder_id = %s WHERE id = ANY(%s) AND agent_id = %s",
            (folder_id, contact_ids, agent_id),
        )
        moved = cur.rowcount
        return {"moved": moved, "folder_id": folder_id}

    return _q(go)


def _rename_contact_folder(agent_id: str, inp: dict):
    folder_id = inp["folder_id"]
    name = inp["name"]

    def go(cur):
        try:
            cur.execute(
                """UPDATE contact_folders SET name = %s
                   WHERE id = %s AND agent_id = %s
                   RETURNING id, name""",
                (name, folder_id, agent_id),
            )
            row = cur.fetchone()
            if not row:
                return {"error": "Folder not found"}
            return dict(row)
        except Exception as e:
            if "unique" in str(e).lower() or "duplicate" in str(e).lower():
                cur.connection.rollback()
                return {"error": f"A contact folder named '{name}' already exists"}
            raise

    return _q(go)


def _remove_contacts_from_folder(agent_id: str, inp: dict):
    contact_ids = inp["contact_ids"]

    def go(cur):
        cur.execute(
            "UPDATE contacts SET folder_id = NULL WHERE id = ANY(%s) AND agent_id = %s",
            (contact_ids, agent_id),
        )
        return {"removed": cur.rowcount}

    return _q(go)


def _rename_document_folder(agent_id: str, inp: dict):
    folder_id = inp["folder_id"]
    name = inp["name"]

    def go(cur):
        try:
            cur.execute(
                """UPDATE document_folders SET name = %s
                   WHERE id = %s AND agent_id = %s
                   RETURNING id, name""",
                (name, folder_id, agent_id),
            )
            row = cur.fetchone()
            if not row:
                return {"error": "Folder not found"}
            return dict(row)
        except Exception as e:
            if "unique" in str(e).lower() or "duplicate" in str(e).lower():
                cur.connection.rollback()
                return {"error": f"A document folder named '{name}' already exists"}
            raise

    return _q(go)


# ---------------------------------------------------------------------------
# Write handlers
# ---------------------------------------------------------------------------

def _create_contact_folder(agent_id: str, inp: dict):
    name = inp["name"]

    def go(cur):
        try:
            cur.execute(
                """INSERT INTO contact_folders (agent_id, name)
                   VALUES (%s, %s)
                   RETURNING id, name, created_at""",
                (agent_id, name),
            )
            return dict(cur.fetchone())
        except Exception as e:
            if "unique" in str(e).lower() or "duplicate" in str(e).lower():
                cur.connection.rollback()
                return {"error": f"A contact folder named '{name}' already exists"}
            raise

    return _q(go)


def _create_document_folder(agent_id: str, inp: dict):
    name = inp["name"]

    def go(cur):
        try:
            cur.execute(
                """INSERT INTO document_folders (agent_id, name)
                   VALUES (%s, %s)
                   RETURNING id, name, created_at""",
                (agent_id, name),
            )
            return dict(cur.fetchone())
        except Exception as e:
            if "unique" in str(e).lower() or "duplicate" in str(e).lower():
                cur.connection.rollback()
                return {"error": f"A document folder named '{name}' already exists"}
            raise

    return _q(go)


def _delete_contact_folder(agent_id: str, inp: dict):
    folder_id = inp["folder_id"]

    def go(cur):
        # Get folder name for response
        cur.execute(
            "SELECT name FROM contact_folders WHERE id = %s AND agent_id = %s",
            (folder_id, agent_id),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "Folder not found"}
        folder_name = row["name"]

        # Unfolder contacts first
        cur.execute(
            "UPDATE contacts SET folder_id = NULL WHERE folder_id = %s AND agent_id = %s",
            (folder_id, agent_id),
        )
        unfoldered = cur.rowcount

        # Delete the folder
        cur.execute(
            "DELETE FROM contact_folders WHERE id = %s AND agent_id = %s",
            (folder_id, agent_id),
        )
        return {"deleted": folder_name, "contacts_unfoldered": unfoldered}

    return _q(go)


def _delete_document_folder(agent_id: str, inp: dict):
    folder_id = inp["folder_id"]

    def go(cur):
        # Get folder name for response
        cur.execute(
            "SELECT name FROM document_folders WHERE id = %s AND agent_id = %s",
            (folder_id, agent_id),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "Folder not found"}
        folder_name = row["name"]

        # Unfolder documents first
        cur.execute(
            "UPDATE documents SET folder_id = NULL WHERE folder_id = %s AND agent_id = %s",
            (folder_id, agent_id),
        )
        unfoldered = cur.rowcount

        # Delete the folder
        cur.execute(
            "DELETE FROM document_folders WHERE id = %s AND agent_id = %s",
            (folder_id, agent_id),
        )
        return {"deleted": folder_name, "documents_unfoldered": unfoldered}

    return _q(go)


# ---------------------------------------------------------------------------
# Dispatchers (dict-based, no if/elif chains)
# ---------------------------------------------------------------------------

_READ_DISPATCH = {
    "list_contact_folders": _list_contact_folders,
    "list_document_folders": _list_document_folders,
}

_AUTO_DISPATCH = {
    "move_contacts_to_folder": _move_contacts_to_folder,
    "rename_contact_folder": _rename_contact_folder,
    "remove_contacts_from_folder": _remove_contacts_from_folder,
    "rename_document_folder": _rename_document_folder,
}

_WRITE_DISPATCH = {
    "create_contact_folder": _create_contact_folder,
    "create_document_folder": _create_document_folder,
    "delete_contact_folder": _delete_contact_folder,
    "delete_document_folder": _delete_document_folder,
}


async def execute(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a read tool."""
    handler = _READ_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown folder read tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_auto(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute an auto-execute tool."""
    handler = _AUTO_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown folder auto-execute tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_write(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a confirmed write tool."""
    handler = _WRITE_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown folder write tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))
