"""
Contact tools: search, view, create, update, delete contacts and buyer profiles.
"""
import logging

import httpx
import psycopg2.extras

from app.config import BACKEND_URL, AI_SERVICE_SECRET
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


def _dynamic_update(cur, table: str, allowed: set, id_col: str, id_val, fields: dict):
    """Build and execute a dynamic UPDATE. Returns the updated row id or None."""
    clean = {k: v for k, v in fields.items() if k in allowed}
    if not clean:
        return None
    set_clause = ", ".join(f"{k} = %s" for k in clean)
    vals = list(clean.values()) + [id_val]
    cur.execute(
        f"UPDATE {table} SET {set_clause}, updated_at = NOW() "
        f"WHERE {id_col} = %s RETURNING id",
        vals,
    )
    return cur.fetchone()


# ---------------------------------------------------------------------------
# Tool definitions (Anthropic tool schema)
# ---------------------------------------------------------------------------

DEFINITIONS = [
    {
        "name": "search_contacts",
        "description": (
            "Search contacts by name, email, or lead source. "
            "Matches against first_name, last_name, email, and full name. "
            "Pass a full name like 'Rohan Batre' or partial like 'Rohan'. "
            "For 'my last contact' or 'most recent', omit query and set limit=1 — results sort newest first. "
            "Always call this before any operation needing a contact_id."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Name or email to search for"},
                "source": {"type": "string", "description": "Filter by lead source (e.g. Zillow, Referral)"},
                "limit": {"type": "integer", "description": "Max results to return (default 10)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_contact_details",
        "description": (
            "Get full details for one contact including buyer profile if it exists. "
            "Use after search_contacts to drill into a specific person."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "get_contact_activities",
        "description": (
            "Get recent activity history (calls, emails, notes, showings, tasks) for a contact. "
            "Sorted newest first."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact"},
                "limit": {"type": "integer", "description": "Max results (default 20)"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "get_buyer_profile",
        "description": (
            "Get buyer preferences for a contact: budget, beds/baths, locations, "
            "must-haves, deal-breakers, pre-approval status, timeline."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "create_contact",
        "description": (
            "Create a NEW contact (not in CRM yet) and auto-create a Lead deal. "
            "Requires first_name and last_name at minimum. "
            "WARNING: Do NOT use this to update existing contacts — use update_contact instead. "
            "If a contact with the same name already exists, this will return the existing contact."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "first_name": {"type": "string"},
                "last_name": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "source": {"type": "string", "description": "Lead source (e.g. Zillow, Referral, Cold Call, Open House)"},
            },
            "required": ["first_name", "last_name"],
        },
    },
    {
        "name": "update_contact",
        "description": "Update a contact's name, email, phone, or source.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "first_name": {"type": "string"},
                "last_name": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "source": {"type": "string"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "delete_contact",
        "description": (
            "Permanently delete a contact and ALL associated data "
            "(deals, activities, buyer profile, conversations). Cannot be undone."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact to delete"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "create_buyer_profile",
        "description": (
            "Create a buyer profile with property preferences for a contact. "
            "Only one profile per contact — use update_buyer_profile if one exists."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "budget_min": {"type": "number", "description": "Minimum budget in dollars"},
                "budget_max": {"type": "number", "description": "Maximum budget in dollars"},
                "bedrooms": {"type": "integer"},
                "bathrooms": {"type": "number"},
                "locations": {"type": "array", "items": {"type": "string"}, "description": "Preferred areas/neighborhoods"},
                "must_haves": {"type": "array", "items": {"type": "string"}, "description": "Required features (e.g. pool, garage)"},
                "deal_breakers": {"type": "array", "items": {"type": "string"}, "description": "Unwanted features (e.g. HOA, busy street)"},
                "property_type": {"type": "string", "description": "e.g. Single Family, Condo, Townhouse"},
                "pre_approved": {"type": "boolean"},
                "pre_approval_amount": {"type": "number"},
                "timeline": {"type": "string", "description": "e.g. ASAP, 3 months, 6 months"},
                "notes": {"type": "string"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "update_buyer_profile",
        "description": "Update an existing buyer profile. Only sends changed fields.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "budget_min": {"type": "number"},
                "budget_max": {"type": "number"},
                "bedrooms": {"type": "integer"},
                "bathrooms": {"type": "number"},
                "locations": {"type": "array", "items": {"type": "string"}},
                "must_haves": {"type": "array", "items": {"type": "string"}},
                "deal_breakers": {"type": "array", "items": {"type": "string"}},
                "property_type": {"type": "string"},
                "pre_approved": {"type": "boolean"},
                "pre_approval_amount": {"type": "number"},
                "timeline": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "get_ai_profile",
        "description": (
            "Get the AI-generated summary profile for a contact. "
            "Includes personality insights, communication preferences, and engagement history summary. "
            "If no profile exists, suggests using regenerate_ai_profile to create one."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "regenerate_ai_profile",
        "description": (
            "Trigger AI profile regeneration for a contact. "
            "Analyzes the contact's activities, emails, deals, and buyer profile to create an updated summary. "
            "Use when a profile is missing or outdated."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact"},
            },
            "required": ["contact_id"],
        },
    },
]

# ---------------------------------------------------------------------------
# Tool classification
# ---------------------------------------------------------------------------

READ = {"search_contacts", "get_contact_details", "get_contact_activities", "get_buyer_profile", "get_ai_profile"}
AUTO_EXECUTE: set[str] = {"regenerate_ai_profile"}
WRITE = {"create_contact", "update_contact", "delete_contact", "create_buyer_profile", "update_buyer_profile"}

# ---------------------------------------------------------------------------
# Field sets for dynamic updates
# ---------------------------------------------------------------------------

_CONTACT_FIELDS = {"first_name", "last_name", "email", "phone", "source"}
_BUYER_FIELDS = {
    "budget_min", "budget_max", "bedrooms", "bathrooms", "locations",
    "must_haves", "deal_breakers", "property_type", "pre_approved",
    "pre_approval_amount", "timeline", "notes",
}

# ---------------------------------------------------------------------------
# Read handlers
# ---------------------------------------------------------------------------

def _search_contacts(agent_id: str, inp: dict):
    query = inp.get("query", "")
    source = inp.get("source")
    limit = inp.get("limit", 10)

    def go(cur):
        clauses = ["c.agent_id = %s"]
        params: list = [agent_id]

        if query:
            like = f"%{query}%"
            clauses.append(
                "(c.first_name ILIKE %s OR c.last_name ILIKE %s "
                "OR c.email ILIKE %s OR (c.first_name || ' ' || c.last_name) ILIKE %s)"
            )
            params.extend([like, like, like, like])

        if source:
            clauses.append("c.source = %s")
            params.append(source)

        params.append(limit)
        cur.execute(f"""
            SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.source,
                   c.created_at, MAX(a.created_at) AS last_activity_at
            FROM contacts c
            LEFT JOIN activities a ON a.contact_id = c.id
            WHERE {' AND '.join(clauses)}
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT %s
        """, params)
        return [dict(r) for r in cur.fetchall()]

    return _q(go)


def _get_contact_details(agent_id: str, inp: dict):
    contact_id = inp["contact_id"]

    def go(cur):
        cur.execute(
            "SELECT * FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        contact = cur.fetchone()
        if not contact:
            return {"error": "Contact not found"}

        cur.execute("SELECT * FROM buyer_profiles WHERE contact_id = %s", (contact_id,))
        bp = cur.fetchone()

        result = dict(contact)
        result["buyer_profile"] = dict(bp) if bp else None
        return result

    return _q(go)


def _get_contact_activities(agent_id: str, inp: dict):
    contact_id = inp["contact_id"]
    limit = inp.get("limit", 20)

    def go(cur):
        cur.execute("""
            SELECT id, type, body, due_date, priority, completed_at, created_at
            FROM activities
            WHERE contact_id = %s AND agent_id = %s
            ORDER BY created_at DESC LIMIT %s
        """, (contact_id, agent_id, limit))
        return [dict(r) for r in cur.fetchall()]

    return _q(go)


def _get_buyer_profile(agent_id: str, inp: dict):
    contact_id = inp["contact_id"]

    def go(cur):
        cur.execute(
            "SELECT id FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        if not cur.fetchone():
            return {"error": "Contact not found"}

        cur.execute("SELECT * FROM buyer_profiles WHERE contact_id = %s", (contact_id,))
        bp = cur.fetchone()
        if not bp:
            return {"error": "No buyer profile exists for this contact. Use create_buyer_profile to add one."}
        return dict(bp)

    return _q(go)


def _get_ai_profile(agent_id: str, inp: dict):
    contact_id = inp["contact_id"]

    def go(cur):
        cur.execute(
            "SELECT id FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        if not cur.fetchone():
            return {"error": "Contact not found"}

        cur.execute("SELECT * FROM ai_profiles WHERE contact_id = %s", (contact_id,))
        profile = cur.fetchone()
        if not profile:
            return {"message": "No AI profile exists for this contact. Use regenerate_ai_profile to create one."}
        return dict(profile)

    return _q(go)


async def _regenerate_ai_profile(agent_id: str, inp: dict) -> dict:
    contact_id = inp["contact_id"]
    url = f"{BACKEND_URL}/api/contacts/{contact_id}/ai-profile/regenerate"
    headers = {
        "X-AI-Service-Secret": AI_SERVICE_SECRET,
        "X-Agent-ID": agent_id,
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers)

        if resp.status_code in (200, 201):
            return resp.json()

        try:
            detail = resp.json().get("error", resp.text)
        except Exception:
            detail = resp.text
        return {"error": f"Profile regeneration failed ({resp.status_code}): {detail}"}

    except httpx.ConnectError:
        return {"error": "Go backend not reachable."}
    except httpx.TimeoutException:
        return {"error": "Profile regeneration timed out — try again."}
    except Exception as exc:
        logger.error("regenerate_ai_profile proxy failed: %s", exc)
        return {"error": f"Profile regeneration failed: {exc}"}


# ---------------------------------------------------------------------------
# Write handlers
# ---------------------------------------------------------------------------

def _create_contact(agent_id: str, inp: dict):
    def go(cur):
        # Dedup check: reject if a contact with same first+last name already exists
        cur.execute(
            """SELECT id, first_name, last_name, email, phone, source
               FROM contacts
               WHERE agent_id = %s
                 AND LOWER(first_name) = LOWER(%s)
                 AND LOWER(last_name) = LOWER(%s)
               LIMIT 1""",
            (agent_id, inp["first_name"], inp["last_name"]),
        )
        existing = cur.fetchone()
        if existing:
            # Auto-convert to update: merge any new fields into the existing contact
            updates = {}
            for field in ("email", "phone", "source"):
                new_val = inp.get(field)
                if new_val and new_val != existing.get(field):
                    updates[field] = new_val

            if updates:
                set_clause = ", ".join(f"{k} = %s" for k in updates)
                vals = list(updates.values()) + [existing["id"], agent_id]
                cur.execute(
                    f"UPDATE contacts SET {set_clause}, updated_at = NOW() "
                    f"WHERE id = %s AND agent_id = %s RETURNING id, first_name, last_name, email, phone, source",
                    vals,
                )
                updated = dict(cur.fetchone())
                updated["merged"] = True
                updated["updated_fields"] = list(updates.keys())
                return updated

            # Nothing new to add — just return the existing contact
            result = dict(existing)
            result["already_exists"] = True
            return result

        cur.execute("""
            INSERT INTO contacts (agent_id, first_name, last_name, email, phone, source)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, first_name, last_name, email, phone, source, created_at
        """, (agent_id, inp["first_name"], inp["last_name"],
              inp.get("email"), inp.get("phone"), inp.get("source")))
        contact = dict(cur.fetchone())

        # Auto-create a Lead deal for pipeline tracking
        cur.execute("""
            INSERT INTO deals (contact_id, agent_id, stage_id, title)
            SELECT %s, %s, id, %s FROM deal_stages WHERE LOWER(name) = 'lead' LIMIT 1
            RETURNING id
        """, (contact["id"], agent_id, f"{inp['first_name']} {inp['last_name']}"))
        deal = cur.fetchone()
        if deal:
            contact["deal_id"] = deal["id"]
            contact["pipeline_stage"] = "Lead"

        return contact

    return _q(go)


def _update_contact(agent_id: str, inp: dict):
    inp = dict(inp)
    contact_id = inp.pop("contact_id")

    def go(cur):
        clean = {k: v for k, v in inp.items() if k in _CONTACT_FIELDS}
        if not clean:
            return {"error": "No valid fields to update"}
        set_clause = ", ".join(f"{k} = %s" for k in clean)
        vals = list(clean.values()) + [contact_id, agent_id]
        cur.execute(
            f"UPDATE contacts SET {set_clause}, updated_at = NOW() "
            f"WHERE id = %s AND agent_id = %s RETURNING id",
            vals,
        )
        row = cur.fetchone()
        if not row:
            return {"error": "Contact not found"}
        return {"updated": True, "contact_id": contact_id}

    return _q(go)


def _delete_contact(agent_id: str, inp: dict):
    contact_id = inp["contact_id"]

    def go(cur):
        # Verify ownership and get name for confirmation message
        cur.execute(
            "SELECT first_name, last_name FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        contact = cur.fetchone()
        if not contact:
            return {"error": "Contact not found"}

        name = f"{contact['first_name']} {contact['last_name']}"

        # Single DELETE — ON DELETE CASCADE handles buyer_profiles, ai_profiles,
        # deals, activities, conversations, and conversations→messages
        cur.execute(
            "DELETE FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        return {"deleted": True, "contact": name}

    return _q(go)


def _create_buyer_profile(agent_id: str, inp: dict):
    inp = dict(inp)
    contact_id = inp.pop("contact_id")

    def go(cur):
        # Verify contact ownership
        cur.execute(
            "SELECT id FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        if not cur.fetchone():
            return {"error": "Contact not found"}

        # Check for existing profile
        cur.execute("SELECT id FROM buyer_profiles WHERE contact_id = %s", (contact_id,))
        if cur.fetchone():
            return {"error": "Buyer profile already exists. Use update_buyer_profile instead."}

        # Build columns/values from whatever was provided
        cols = ["contact_id"]
        vals = [contact_id]
        for field in _BUYER_FIELDS:
            if field in inp:
                cols.append(field)
                vals.append(inp[field])

        placeholders = ", ".join(["%s"] * len(vals))
        col_names = ", ".join(cols)
        cur.execute(
            f"INSERT INTO buyer_profiles ({col_names}) VALUES ({placeholders}) "
            f"RETURNING *",
            vals,
        )
        return dict(cur.fetchone())

    return _q(go)


def _update_buyer_profile(agent_id: str, inp: dict):
    inp = dict(inp)
    contact_id = inp.pop("contact_id")

    def go(cur):
        # Verify contact ownership
        cur.execute(
            "SELECT id FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        if not cur.fetchone():
            return {"error": "Contact not found"}

        row = _dynamic_update(cur, "buyer_profiles", _BUYER_FIELDS, "contact_id", contact_id, inp)
        if row is None:
            if not {k for k in inp if k in _BUYER_FIELDS}:
                return {"error": "No valid fields to update"}
            return {"error": "No buyer profile exists. Use create_buyer_profile first."}
        return {"updated": True, "contact_id": contact_id}

    return _q(go)


# ---------------------------------------------------------------------------
# Dispatchers (dict-based, no if/elif chains)
# ---------------------------------------------------------------------------

_READ_DISPATCH = {
    "search_contacts": _search_contacts,
    "get_contact_details": _get_contact_details,
    "get_contact_activities": _get_contact_activities,
    "get_buyer_profile": _get_buyer_profile,
    "get_ai_profile": _get_ai_profile,
}

_AUTO_DISPATCH: dict = {
    "regenerate_ai_profile": lambda aid, inp: _regenerate_ai_profile(aid, inp),
}

_WRITE_DISPATCH = {
    "create_contact": _create_contact,
    "update_contact": _update_contact,
    "delete_contact": _delete_contact,
    "create_buyer_profile": _create_buyer_profile,
    "update_buyer_profile": _update_buyer_profile,
}


async def execute(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a read tool."""
    handler = _READ_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown contact read tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_auto(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute an auto-execute tool."""
    handler = _AUTO_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown contact auto tool: {tool_name}")
    return await handler(agent_id, tool_input)


async def execute_write(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a confirmed write tool."""
    handler = _WRITE_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown contact write tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))
