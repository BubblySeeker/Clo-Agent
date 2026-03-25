"""
Intelligence pre-processor: entity resolution BEFORE the LLM call.

Extracts candidate entity tokens from the user message, resolves them
against the database, and enriches the context so Claude gets pre-resolved
contacts (with UUIDs) in the system prompt — saving tool rounds.
"""
import logging
import re
from dataclasses import dataclass, field
from typing import Optional

import psycopg2.extras

from app.database import get_conn, run_query

logger = logging.getLogger(__name__)

# Words that should never be treated as contact name tokens
_STOP_WORDS = frozenset({
    "i", "me", "my", "you", "your", "the", "a", "an", "is", "are", "was",
    "were", "be", "been", "do", "does", "did", "will", "would", "could",
    "should", "can", "may", "might", "shall", "have", "has", "had",
    "about", "above", "after", "all", "also", "and", "any", "at", "back",
    "because", "before", "between", "both", "but", "by", "call", "came",
    "come", "contact", "contacts", "create", "deal", "deals", "delete",
    "draft", "each", "email", "emails", "find", "first", "for", "from",
    "get", "give", "go", "going", "good", "got", "great", "her", "here",
    "him", "his", "how", "if", "in", "into", "it", "its", "just", "know",
    "last", "let", "like", "list", "look", "make", "many", "me", "more",
    "morning", "most", "much", "need", "new", "next", "no", "not", "now",
    "of", "off", "on", "one", "only", "or", "other", "our", "out", "over",
    "please", "put", "recent", "recently", "search", "send", "set", "she",
    "show", "so", "some", "still", "such", "take", "tell", "than", "that",
    "their", "them", "then", "there", "these", "they", "this", "those",
    "through", "to", "today", "tomorrow", "too", "up", "update", "us",
    "use", "very", "want", "what", "when", "where", "which", "while",
    "who", "why", "with", "work", "yes", "no", "brief", "briefing",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
    "sunday", "task", "tasks", "activity", "activities", "property",
    "properties", "document", "documents", "showing", "note", "notes",
    "follow", "buyer", "profile",
})

# Recency trigger phrases
_RECENCY_PATTERNS = [
    r"my last contact",
    r"most recent contact",
    r"latest contact",
    r"newest contact",
    r"last added contact",
]


@dataclass
class ResolvedEntity:
    """A contact resolved from the user's message."""
    contact_id: str
    first_name: str
    last_name: str
    email: Optional[str]
    phone: Optional[str]
    source: Optional[str]
    match_type: str  # "exact", "partial", "recency"


@dataclass
class EntityContext:
    """Result of entity resolution."""
    contacts: list[ResolvedEntity] = field(default_factory=list)
    recency_match: bool = False
    raw_tokens: list[str] = field(default_factory=list)


def _extract_tokens(message: str) -> list[str]:
    """
    Extract candidate name tokens from the user message.

    Strategy:
    1. Extract quoted strings first (highest confidence)
    2. Extract capitalized words/sequences (likely proper nouns)
    3. Filter out stop words and common CRM verbs
    """
    tokens = []

    # 1. Quoted strings — "Rohan Batre" or 'Rohan Batre'
    quoted = re.findall(r'["\']([^"\']+)["\']', message)
    for q in quoted:
        tokens.append(q.strip())

    # Remove quoted portions for further processing
    cleaned = re.sub(r'["\'][^"\']+["\']', '', message)

    # 2. Capitalized sequences — "Rohan Batre" as consecutive capitalized words
    # This catches names written naturally in sentences
    cap_sequences = re.findall(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b', cleaned)
    for seq in cap_sequences:
        words = seq.split()
        # Filter: each word must not be a stop word
        filtered = [w for w in words if w.lower() not in _STOP_WORDS]
        if filtered:
            tokens.append(" ".join(filtered))

    # 3. Fallback: any non-stop word that looks like it could be a name
    # (for lowercase input like "email rohan")
    words = re.findall(r'\b([a-zA-Z]{2,})\b', cleaned)
    for w in words:
        if w.lower() not in _STOP_WORDS and w not in " ".join(tokens):
            # Only add if not already captured and looks name-like
            tokens.append(w)

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for t in tokens:
        key = t.lower()
        if key not in seen:
            seen.add(key)
            unique.append(t)

    return unique


def _check_recency(message: str) -> bool:
    """Check if the message references recency (my last contact, etc.)."""
    lower = message.lower()
    return any(re.search(pattern, lower) for pattern in _RECENCY_PATTERNS)


def _resolve_from_db(tokens: list[str], agent_id: str, recency: bool) -> list[ResolvedEntity]:
    """
    Batch-resolve tokens against the contacts table.

    Uses ILIKE ANY for efficient batch matching.
    Returns max 3 contacts to avoid overloading the prompt.
    """
    results: list[ResolvedEntity] = []

    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Recency match: most recently created contact
        if recency:
            cur.execute(
                """SELECT id, first_name, last_name, email, phone, source
                   FROM contacts WHERE agent_id = %s
                   ORDER BY created_at DESC LIMIT 1""",
                (agent_id,),
            )
            row = cur.fetchone()
            if row:
                results.append(ResolvedEntity(
                    contact_id=str(row["id"]),
                    first_name=row["first_name"],
                    last_name=row["last_name"],
                    email=row["email"],
                    phone=row["phone"],
                    source=row["source"],
                    match_type="recency",
                ))

        # Token-based matching
        if tokens:
            # Build ILIKE patterns for each token
            patterns = [f"%{t}%" for t in tokens]

            cur.execute(
                """SELECT DISTINCT ON (c.id)
                          c.id, c.first_name, c.last_name, c.email, c.phone, c.source
                   FROM contacts c
                   WHERE c.agent_id = %s
                     AND (
                       c.first_name ILIKE ANY(%s)
                       OR c.last_name ILIKE ANY(%s)
                       OR (c.first_name || ' ' || c.last_name) ILIKE ANY(%s)
                       OR c.email ILIKE ANY(%s)
                     )
                   ORDER BY c.id, c.created_at DESC
                   LIMIT 5""",
                (agent_id, patterns, patterns, patterns, patterns),
            )
            rows = cur.fetchall()

            # Determine match type per result
            for row in rows:
                # Skip if already added via recency
                if any(r.contact_id == str(row["id"]) for r in results):
                    continue

                full_name = f"{row['first_name']} {row['last_name']}".lower()
                match_type = "partial"
                for t in tokens:
                    if t.lower() == full_name or t.lower() in full_name:
                        match_type = "exact"
                        break

                results.append(ResolvedEntity(
                    contact_id=str(row["id"]),
                    first_name=row["first_name"],
                    last_name=row["last_name"],
                    email=row["email"],
                    phone=row["phone"],
                    source=row["source"],
                    match_type=match_type,
                ))

    return results[:3]  # Cap at 3 to avoid prompt bloat


async def resolve_entities(user_message: str, agent_id: str) -> EntityContext:
    """
    Main entry point: extract entity tokens from the user message,
    resolve them against the DB, and return an EntityContext.

    Graceful degradation: if DB is unavailable, returns empty context.
    """
    try:
        recency = _check_recency(user_message)
        tokens = _extract_tokens(user_message)

        if not tokens and not recency:
            return EntityContext()

        contacts = await run_query(
            lambda: _resolve_from_db(tokens, agent_id, recency)
        )

        return EntityContext(
            contacts=contacts,
            recency_match=recency,
            raw_tokens=tokens,
        )
    except Exception:
        logger.warning("Entity resolution failed — degrading gracefully", exc_info=True)
        return EntityContext()


def enrich_context(entity_ctx: EntityContext, agent_id: str) -> str:
    """
    Build an enrichment string for the system prompt from resolved entities.

    Loads buyer profile + recent activities for each resolved contact (max 3).
    Returns a string block to inject into the system prompt.
    """
    if not entity_ctx.contacts:
        return ""

    lines = [
        "\n\n<resolved_entities>",
        "I pre-resolved the following contacts from the user's message. "
        "Use these IDs directly — do NOT call search_contacts for them:",
    ]

    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            for entity in entity_ctx.contacts:
                name = f"{entity.first_name} {entity.last_name}"
                lines.append(
                    f"\n- **{name}** (ID: {entity.contact_id}, "
                    f"match: {entity.match_type})"
                )
                lines.append(
                    f"  Email: {entity.email or 'N/A'} | "
                    f"Phone: {entity.phone or 'N/A'} | "
                    f"Source: {entity.source or 'N/A'}"
                )

                # Buyer profile
                cur.execute(
                    "SELECT budget_min, budget_max, bedrooms, bathrooms, locations, pre_approved, timeline "
                    "FROM buyer_profiles WHERE contact_id = %s",
                    (entity.contact_id,),
                )
                bp = cur.fetchone()
                if bp:
                    lines.append(
                        f"  Buyer: ${bp['budget_min']:,.0f}-${bp['budget_max']:,.0f}, "
                        f"{bp['bedrooms']}BR/{bp['bathrooms']}BA, "
                        f"Areas: {', '.join(bp['locations'] or [])}, "
                        f"Pre-approved: {bp['pre_approved']}, Timeline: {bp['timeline']}"
                    )

                # Recent activities (last 3)
                cur.execute(
                    """SELECT type, body, created_at FROM activities
                       WHERE contact_id = %s AND agent_id = %s
                       ORDER BY created_at DESC LIMIT 3""",
                    (entity.contact_id, agent_id),
                )
                activities = cur.fetchall()
                if activities:
                    lines.append("  Recent activity:")
                    for a in activities:
                        lines.append(
                            f"    - [{a['type']}] {a['body']} "
                            f"({a['created_at'].strftime('%b %d')})"
                        )

    except Exception:
        logger.warning("Entity enrichment failed — using basic resolution", exc_info=True)

    if len(entity_ctx.contacts) == 1:
        lines.append(
            f"\nSince exactly one contact matched, use contact_id "
            f"{entity_ctx.contacts[0].contact_id} directly for any "
            f"contact-dependent operation."
        )

    lines.append("</resolved_entities>")
    return "\n".join(lines)
