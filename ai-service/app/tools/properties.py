"""
Property tools: search, view, create, update, delete listings and match buyers.
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


# ---------------------------------------------------------------------------
# Tool definitions (Anthropic tool schema)
# ---------------------------------------------------------------------------

DEFINITIONS = [
    {
        "name": "search_properties",
        "description": (
            "Search properties by address, MLS ID, status, type, price range, or bedrooms. "
            "Results sorted newest first. Omit all filters to list recent properties."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Address or MLS ID to search for"},
                "status": {
                    "type": "string",
                    "enum": ["active", "pending", "sold", "off_market"],
                    "description": "Filter by listing status",
                },
                "property_type": {"type": "string", "description": "e.g. Single Family, Condo, Townhouse"},
                "min_price": {"type": "number", "description": "Minimum price filter"},
                "max_price": {"type": "number", "description": "Maximum price filter"},
                "bedrooms": {"type": "integer", "description": "Minimum number of bedrooms"},
                "limit": {"type": "integer", "description": "Max results to return (default 10)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_property",
        "description": (
            "Get full details for one property including linked deals. "
            "Use after search_properties to drill into a specific listing."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "property_id": {"type": "string", "description": "UUID of the property"},
            },
            "required": ["property_id"],
        },
    },
    {
        "name": "match_buyer_to_properties",
        "description": (
            "Match a buyer profile against active listings and return scored results. "
            "The contact must have an existing buyer profile. "
            "Scores are based on budget, bedrooms, bathrooms, property type, and location."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact with a buyer profile"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "create_property",
        "description": "Create a new property listing. Requires address at minimum.",
        "input_schema": {
            "type": "object",
            "properties": {
                "address": {"type": "string"},
                "city": {"type": "string"},
                "state": {"type": "string"},
                "zip": {"type": "string"},
                "price": {"type": "number"},
                "bedrooms": {"type": "integer"},
                "bathrooms": {"type": "number"},
                "sqft": {"type": "integer"},
                "property_type": {"type": "string", "description": "e.g. Single Family, Condo, Townhouse"},
                "status": {"type": "string", "enum": ["active", "pending", "sold", "off_market"], "description": "Default: active"},
                "listing_type": {"type": "string", "description": "e.g. sale, rent"},
                "mls_id": {"type": "string"},
                "description": {"type": "string"},
                "year_built": {"type": "integer"},
                "lot_size": {"type": "number"},
            },
            "required": ["address"],
        },
    },
    {
        "name": "update_property",
        "description": "Update a property listing. Only sends changed fields.",
        "input_schema": {
            "type": "object",
            "properties": {
                "property_id": {"type": "string"},
                "address": {"type": "string"},
                "city": {"type": "string"},
                "state": {"type": "string"},
                "zip": {"type": "string"},
                "price": {"type": "number"},
                "bedrooms": {"type": "integer"},
                "bathrooms": {"type": "number"},
                "sqft": {"type": "integer"},
                "property_type": {"type": "string"},
                "status": {"type": "string", "enum": ["active", "pending", "sold", "off_market"]},
                "listing_type": {"type": "string"},
                "mls_id": {"type": "string"},
                "description": {"type": "string"},
                "year_built": {"type": "integer"},
                "lot_size": {"type": "number"},
            },
            "required": ["property_id"],
        },
    },
    {
        "name": "delete_property",
        "description": "Permanently delete a property listing. Cannot be undone.",
        "input_schema": {
            "type": "object",
            "properties": {
                "property_id": {"type": "string", "description": "UUID of the property to delete"},
            },
            "required": ["property_id"],
        },
    },
    {
        "name": "match_property_to_buyers",
        "description": (
            "Find buyer profiles that match a property's features (reverse match). "
            "Given a property, returns contacts whose buyer preferences align with the listing. "
            "The opposite of match_buyer_to_properties — starts from property, finds matching buyers."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "property_id": {"type": "string", "description": "UUID of the property to match against"},
            },
            "required": ["property_id"],
        },
    },
]

# ---------------------------------------------------------------------------
# Tool classification
# ---------------------------------------------------------------------------

READ = {"search_properties", "get_property", "match_buyer_to_properties", "match_property_to_buyers"}
AUTO_EXECUTE: set[str] = set()
WRITE = {"create_property", "update_property", "delete_property"}

# ---------------------------------------------------------------------------
# Field sets for dynamic updates
# ---------------------------------------------------------------------------

_PROPERTY_FIELDS = {
    "address", "city", "state", "zip", "price", "bedrooms", "bathrooms",
    "sqft", "property_type", "status", "listing_type", "mls_id",
    "description", "year_built", "lot_size",
}

# ---------------------------------------------------------------------------
# Read handlers
# ---------------------------------------------------------------------------

def _search_properties(agent_id: str, inp: dict):
    query = inp.get("query", "")
    status = inp.get("status")
    property_type = inp.get("property_type")
    min_price = inp.get("min_price")
    max_price = inp.get("max_price")
    bedrooms = inp.get("bedrooms")
    limit = inp.get("limit", 10)

    def go(cur):
        clauses = ["agent_id = %s"]
        params: list = [agent_id]

        if query:
            like = f"%{query}%"
            clauses.append("(address ILIKE %s OR mls_id ILIKE %s)")
            params.extend([like, like])

        if status:
            clauses.append("status = %s")
            params.append(status)

        if property_type:
            clauses.append("property_type = %s")
            params.append(property_type)

        if min_price is not None:
            clauses.append("price >= %s")
            params.append(min_price)

        if max_price is not None:
            clauses.append("price <= %s")
            params.append(max_price)

        if bedrooms is not None:
            clauses.append("bedrooms >= %s")
            params.append(bedrooms)

        params.append(limit)
        cur.execute(f"""
            SELECT id, address, city, state, zip, price, bedrooms, bathrooms,
                   sqft, property_type, status, listing_type, mls_id, created_at
            FROM properties WHERE {' AND '.join(clauses)}
            ORDER BY created_at DESC LIMIT %s
        """, params)
        return [dict(r) for r in cur.fetchall()]

    return _q(go)


def _get_property(agent_id: str, inp: dict):
    property_id = inp["property_id"]

    def go(cur):
        cur.execute(
            "SELECT * FROM properties WHERE id = %s AND agent_id = %s",
            (property_id, agent_id),
        )
        prop = cur.fetchone()
        if not prop:
            return {"error": "Property not found"}

        cur.execute("""
            SELECT d.id, d.title, d.value, s.name AS stage_name,
                   c.first_name || ' ' || c.last_name AS contact_name
            FROM deals d
            JOIN deal_stages s ON s.id = d.stage_id
            JOIN contacts c ON c.id = d.contact_id
            WHERE d.property_id = %s AND d.agent_id = %s
        """, (property_id, agent_id))
        deals = [dict(r) for r in cur.fetchall()]

        result = dict(prop)
        result["linked_deals"] = deals
        return result

    return _q(go)


def _match_buyer_to_properties(agent_id: str, inp: dict):
    contact_id = inp["contact_id"]

    def go(cur):
        # Verify contact ownership
        cur.execute(
            "SELECT id FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        if not cur.fetchone():
            return {"error": "Contact not found"}

        # Get buyer profile
        cur.execute("SELECT * FROM buyer_profiles WHERE contact_id = %s", (contact_id,))
        bp = cur.fetchone()
        if not bp:
            return {"error": "No buyer profile exists for this contact"}
        bp = dict(bp)

        # Get all active properties
        cur.execute("""
            SELECT id, address, city, state, zip, price, bedrooms, bathrooms,
                   sqft, property_type, status, listing_type
            FROM properties WHERE agent_id = %s AND status = 'active'
        """, (agent_id,))
        properties = [dict(r) for r in cur.fetchall()]

        # Score each property against buyer preferences
        matches = []
        for prop in properties:
            score = 0
            if (bp.get("budget_min") is not None
                    and bp.get("budget_max") is not None
                    and prop.get("price") is not None):
                if float(bp["budget_min"]) <= float(prop["price"]) <= float(bp["budget_max"]):
                    score += 1
            if bp.get("bedrooms") is not None and prop.get("bedrooms") is not None:
                if prop["bedrooms"] >= bp["bedrooms"]:
                    score += 1
            if bp.get("bathrooms") is not None and prop.get("bathrooms") is not None:
                if float(prop["bathrooms"]) >= float(bp["bathrooms"]):
                    score += 1
            if bp.get("property_type") and prop.get("property_type"):
                if prop["property_type"] == bp["property_type"]:
                    score += 1
            if bp.get("locations") and prop.get("city"):
                if prop["city"] in bp["locations"]:
                    score += 1
            if score > 0:
                prop["match_score"] = score
                matches.append(prop)

        matches.sort(key=lambda x: x["match_score"], reverse=True)
        return {
            "buyer_profile": {
                "budget_min": bp.get("budget_min"),
                "budget_max": bp.get("budget_max"),
                "bedrooms": bp.get("bedrooms"),
                "bathrooms": bp.get("bathrooms"),
                "property_type": bp.get("property_type"),
                "locations": bp.get("locations"),
            },
            "matching_properties": matches,
        }

    return _q(go)


async def _match_property_to_buyers(agent_id: str, inp: dict) -> dict:
    property_id = inp["property_id"]
    url = f"{BACKEND_URL}/api/properties/{property_id}/matches"
    headers = {
        "X-AI-Service-Secret": AI_SERVICE_SECRET,
        "X-Agent-ID": agent_id,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)

        if resp.status_code == 200:
            return resp.json()

        try:
            detail = resp.json().get("error", resp.text)
        except Exception:
            detail = resp.text
        return {"error": f"Property matching failed ({resp.status_code}): {detail}"}

    except httpx.ConnectError:
        return {"error": "Go backend not reachable."}
    except httpx.TimeoutException:
        return {"error": "Timed out — try again."}
    except Exception as exc:
        logger.error("match_property_to_buyers proxy failed: %s", exc)
        return {"error": f"Property matching failed: {exc}"}


# ---------------------------------------------------------------------------
# Write handlers
# ---------------------------------------------------------------------------

def _create_property(agent_id: str, inp: dict):
    def go(cur):
        cur.execute("""
            INSERT INTO properties (agent_id, address, city, state, zip, price, bedrooms,
                   bathrooms, sqft, property_type, status, listing_type, mls_id,
                   description, year_built, lot_size)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, address, city, state, price, bedrooms, bathrooms, sqft,
                      property_type, status, created_at
        """, (agent_id, inp["address"], inp.get("city"), inp.get("state"),
              inp.get("zip"), inp.get("price"), inp.get("bedrooms"),
              inp.get("bathrooms"), inp.get("sqft"), inp.get("property_type"),
              inp.get("status", "active"), inp.get("listing_type"),
              inp.get("mls_id"), inp.get("description"), inp.get("year_built"),
              inp.get("lot_size")))
        return dict(cur.fetchone())

    return _q(go)


def _update_property(agent_id: str, inp: dict):
    inp = dict(inp)
    property_id = inp.pop("property_id")

    def go(cur):
        clean = {k: v for k, v in inp.items() if k in _PROPERTY_FIELDS}
        if not clean:
            return {"error": "No fields to update"}
        set_clause = ", ".join(f"{k} = %s" for k in clean)
        vals = list(clean.values()) + [property_id, agent_id]
        cur.execute(
            f"UPDATE properties SET {set_clause} "
            f"WHERE id = %s AND agent_id = %s RETURNING id, address",
            vals,
        )
        row = cur.fetchone()
        if not row:
            return {"error": "Property not found"}
        return {"updated": True, "property_id": property_id, "address": row["address"]}

    return _q(go)


def _delete_property(agent_id: str, inp: dict):
    property_id = inp["property_id"]

    def go(cur):
        cur.execute(
            "SELECT address FROM properties WHERE id = %s AND agent_id = %s",
            (property_id, agent_id),
        )
        prop = cur.fetchone()
        if not prop:
            return {"error": "Property not found"}

        cur.execute(
            "DELETE FROM properties WHERE id = %s AND agent_id = %s",
            (property_id, agent_id),
        )
        return {"deleted": True, "property": prop["address"]}

    return _q(go)


# ---------------------------------------------------------------------------
# Dispatchers (dict-based, no if/elif chains)
# ---------------------------------------------------------------------------

_READ_DISPATCH = {
    "search_properties": _search_properties,
    "get_property": _get_property,
    "match_buyer_to_properties": _match_buyer_to_properties,
}

# Async read handlers (httpx proxy calls)
_ASYNC_READ_DISPATCH: dict = {
    "match_property_to_buyers": lambda aid, inp: _match_property_to_buyers(aid, inp),
}

_WRITE_DISPATCH = {
    "create_property": _create_property,
    "update_property": _update_property,
    "delete_property": _delete_property,
}


async def execute(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a read tool."""
    # Check async handlers first (httpx proxy calls)
    async_handler = _ASYNC_READ_DISPATCH.get(tool_name)
    if async_handler:
        return await async_handler(agent_id, tool_input)

    handler = _READ_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown property read tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))


async def execute_write(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Execute a confirmed write tool."""
    handler = _WRITE_DISPATCH.get(tool_name)
    if not handler:
        raise ValueError(f"Unknown property write tool: {tool_name}")
    return await run_query(lambda: handler(agent_id, tool_input))
