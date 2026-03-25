"""
Embedding generation and storage using OpenAI text-embedding-3-small.
Vectors are stored in the `embeddings` table (pgvector) for semantic search.
"""
import openai
import psycopg2.extras

from app.config import OPENAI_API_KEY
from app.database import get_conn

_client = openai.OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
MODEL = "text-embedding-3-small"  # 1536 dimensions


def generate_embedding(text: str) -> list[float]:
    """Generate a 1536-dim embedding for the given text."""
    if not _client:
        raise RuntimeError("OPENAI_API_KEY not set — cannot generate embeddings")
    resp = _client.embeddings.create(input=text, model=MODEL)
    return resp.data[0].embedding


def generate_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a batch of texts in a single API call.

    OpenAI supports up to 2048 inputs per call. We batch by 100 to stay safe.
    """
    if not _client:
        raise RuntimeError("OPENAI_API_KEY not set — cannot generate embeddings")
    all_embeddings: list[list[float]] = []
    batch_size = 100
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        resp = _client.embeddings.create(input=batch, model=MODEL)
        # Results are in same order as input
        all_embeddings.extend([d.embedding for d in resp.data])
    return all_embeddings


def upsert_embedding(source_type: str, source_id: str, agent_id: str, content: str, embedding: list[float]) -> None:
    """Insert or update an embedding row."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO embeddings (source_type, source_id, agent_id, content, embedding)
               VALUES (%s, %s, %s, %s, %s::vector)
               ON CONFLICT (source_type, source_id)
               DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, created_at = NOW()""",
            (source_type, source_id, agent_id, content, str(embedding)),
        )


def embed_contact(contact_id: str, agent_id: str) -> None:
    """Build a text representation of a contact and store its embedding."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT first_name, last_name, email, phone, source FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        c = cur.fetchone()
        if not c:
            return

        # Include buyer profile if exists
        cur.execute("SELECT * FROM buyer_profiles WHERE contact_id = %s", (contact_id,))
        bp = cur.fetchone()

    parts = [f"Contact: {c['first_name']} {c['last_name']}"]
    if c["email"]:
        parts.append(f"Email: {c['email']}")
    if c["phone"]:
        parts.append(f"Phone: {c['phone']}")
    if c["source"]:
        parts.append(f"Source: {c['source']}")
    if bp:
        if bp.get("budget_min") or bp.get("budget_max"):
            parts.append(f"Budget: ${bp.get('budget_min', 0):,.0f}–${bp.get('budget_max', 0):,.0f}")
        if bp.get("bedrooms"):
            parts.append(f"Bedrooms: {bp['bedrooms']}")
        if bp.get("locations"):
            parts.append(f"Areas: {', '.join(bp['locations'])}")
        if bp.get("property_type"):
            parts.append(f"Property type: {bp['property_type']}")
        if bp.get("timeline"):
            parts.append(f"Timeline: {bp['timeline']}")

    text = " | ".join(parts)
    embedding = generate_embedding(text)
    upsert_embedding("contact", contact_id, agent_id, text, embedding)


def embed_activity(activity_id: str, agent_id: str) -> None:
    """Build a text representation of an activity and store its embedding."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT a.id, a.type, a.body, a.created_at,
                      c.first_name || ' ' || c.last_name AS contact_name
               FROM activities a
               LEFT JOIN contacts c ON c.id = a.contact_id
               WHERE a.id = %s AND a.agent_id = %s""",
            (activity_id, agent_id),
        )
        a = cur.fetchone()
        if not a:
            return

    text = f"{a['type'].title()} with {a.get('contact_name', 'unknown')}: {a['body']}"
    embedding = generate_embedding(text)
    upsert_embedding("activity", activity_id, agent_id, text, embedding)


def semantic_search(query: str, agent_id: str, limit: int = 10) -> list[dict]:
    """Search embeddings by cosine similarity."""
    query_embedding = generate_embedding(query)
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT source_type, source_id, content,
                      1 - (embedding <=> %s::vector) AS similarity
               FROM embeddings
               WHERE agent_id = %s
               ORDER BY embedding <=> %s::vector
               LIMIT %s""",
            (str(query_embedding), agent_id, str(query_embedding), limit),
        )
        return [dict(r) for r in cur.fetchall()]
