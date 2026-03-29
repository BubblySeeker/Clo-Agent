"""
Portal tools: manage portal invites and settings.
"""
import uuid
from datetime import datetime, timedelta, timezone

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
# Tool definitions
# ---------------------------------------------------------------------------

DEFINITIONS: list[dict] = [
    {
        "name": "list_portal_invites",
        "description": (
            "List active portal invites with contact names and expiry dates."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "create_portal_invite",
        "description": (
            "Generate a portal link for a contact. "
            "Creates a magic link token valid for 30 days. Requires confirmation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {
                    "type": "string",
                    "description": "UUID of the contact to invite",
                },
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "revoke_portal_invite",
        "description": (
            "Revoke a portal invite so the link no longer works."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "invite_id": {
                    "type": "string",
                    "description": "UUID of the portal invite to revoke",
                },
            },
            "required": ["invite_id"],
        },
    },
    {
        "name": "get_portal_settings",
        "description": (
            "Get current portal display settings: which sections are visible, "
            "welcome message, and agent contact info."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "update_portal_settings",
        "description": (
            "Update portal display settings such as which sections are visible, "
            "welcome message, and agent contact info. Requires confirmation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "show_deal_value": {
                    "type": "boolean",
                    "description": "Whether to show deal values to contacts",
                },
                "show_activities": {
                    "type": "boolean",
                    "description": "Whether to show activity timeline to contacts",
                },
                "show_properties": {
                    "type": "boolean",
                    "description": "Whether to show properties to contacts",
                },
                "welcome_message": {
                    "type": "string",
                    "description": "Custom welcome message shown on the portal",
                },
                "agent_phone": {
                    "type": "string",
                    "description": "Agent phone number displayed on the portal",
                },
                "agent_email": {
                    "type": "string",
                    "description": "Agent email displayed on the portal",
                },
            },
            "required": [],
        },
    },
]

READ: set[str] = {"list_portal_invites", "get_portal_settings"}
AUTO_EXECUTE: set[str] = {"revoke_portal_invite"}
WRITE: set[str] = {"create_portal_invite", "update_portal_settings"}


# ---------------------------------------------------------------------------
# Internal executors
# ---------------------------------------------------------------------------

def _list_portal_invites(agent_id: str, _inp: dict) -> dict:
    def _run(cur):
        cur.execute(
            """SELECT pt.id, pt.token, pt.expires_at, pt.last_used_at,
                      c.first_name, c.last_name
               FROM portal_tokens pt
               JOIN contacts c ON c.id = pt.contact_id
               WHERE pt.agent_id = %s
               ORDER BY pt.expires_at DESC""",
            (agent_id,),
        )
        rows = cur.fetchall()
        return [dict(r) for r in rows]

    return _q(_run)


def _get_portal_settings(agent_id: str, _inp: dict) -> dict:
    def _run(cur):
        cur.execute(
            """SELECT id, show_deal_value, show_activities, show_properties,
                      welcome_message, agent_phone, agent_email
               FROM portal_settings
               WHERE agent_id = %s""",
            (agent_id,),
        )
        row = cur.fetchone()
        if not row:
            return {"message": "No portal settings configured yet. Use update_portal_settings to set them up."}
        return dict(row)

    return _q(_run)


def _create_portal_invite(agent_id: str, inp: dict) -> dict:
    contact_id = inp["contact_id"]
    token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)

    def _run(cur):
        # Verify contact exists and belongs to this agent
        cur.execute(
            "SELECT id, first_name, last_name FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        contact = cur.fetchone()
        if not contact:
            return {"error": "Contact not found"}

        cur.execute(
            """INSERT INTO portal_tokens (contact_id, agent_id, token, expires_at)
               VALUES (%s, %s, %s, %s)
               RETURNING id, token, expires_at""",
            (contact_id, agent_id, token, expires_at),
        )
        row = cur.fetchone()
        return {
            "id": str(row["id"]),
            "token": row["token"],
            "expires_at": row["expires_at"],
            "contact_name": f"{contact['first_name']} {contact['last_name']}".strip(),
        }

    return _q(_run)


def _revoke_portal_invite(agent_id: str, inp: dict) -> dict:
    invite_id = inp["invite_id"]

    def _run(cur):
        cur.execute(
            "DELETE FROM portal_tokens WHERE id = %s AND agent_id = %s RETURNING id",
            (invite_id, agent_id),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "Invite not found"}
        return {"status": "revoked", "invite_id": str(row["id"])}

    return _q(_run)


def _update_portal_settings(agent_id: str, inp: dict) -> dict:
    show_deal_value = inp.get("show_deal_value")
    show_activities = inp.get("show_activities")
    show_properties = inp.get("show_properties")
    welcome_message = inp.get("welcome_message")
    agent_phone = inp.get("agent_phone")
    agent_email = inp.get("agent_email")

    def _run(cur):
        cur.execute(
            """INSERT INTO portal_settings
                   (agent_id, show_deal_value, show_activities, show_properties,
                    welcome_message, agent_phone, agent_email)
               VALUES (%s, COALESCE(%s, false), COALESCE(%s, true), COALESCE(%s, true),
                       %s, %s, %s)
               ON CONFLICT (agent_id) DO UPDATE SET
                   show_deal_value  = COALESCE(%s, portal_settings.show_deal_value),
                   show_activities  = COALESCE(%s, portal_settings.show_activities),
                   show_properties  = COALESCE(%s, portal_settings.show_properties),
                   welcome_message  = COALESCE(%s, portal_settings.welcome_message),
                   agent_phone      = COALESCE(%s, portal_settings.agent_phone),
                   agent_email      = COALESCE(%s, portal_settings.agent_email),
                   updated_at       = NOW()
               RETURNING id, show_deal_value, show_activities, show_properties,
                         welcome_message, agent_phone, agent_email""",
            (
                agent_id,
                show_deal_value, show_activities, show_properties,
                welcome_message, agent_phone, agent_email,
                show_deal_value, show_activities, show_properties,
                welcome_message, agent_phone, agent_email,
            ),
        )
        row = cur.fetchone()
        return dict(row)

    return _q(_run)


# ---------------------------------------------------------------------------
# Dispatchers
# ---------------------------------------------------------------------------

_READ_DISPATCH: dict = {
    "list_portal_invites": _list_portal_invites,
    "get_portal_settings": _get_portal_settings,
}

_AUTO_DISPATCH: dict = {
    "revoke_portal_invite": _revoke_portal_invite,
}

_WRITE_DISPATCH: dict = {
    "create_portal_invite": _create_portal_invite,
    "update_portal_settings": _update_portal_settings,
}


async def execute(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    handler = _READ_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown portal read tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_auto(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute an auto-execute tool."""
    handler = _AUTO_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown portal auto-execute tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_write(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    handler = _WRITE_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown portal write tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))
