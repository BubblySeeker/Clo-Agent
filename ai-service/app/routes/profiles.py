"""
AI profile generation routes.

POST /ai/profiles/generate — generate a 3-5 sentence agent briefing for a contact
"""
from fastapi import APIRouter, HTTPException, Header, Depends

import anthropic
import psycopg2.extras
from pydantic import BaseModel

from app.config import AI_SERVICE_SECRET, ANTHROPIC_API_KEY, ANTHROPIC_MODEL
from app.database import get_conn, run_query

router = APIRouter(prefix="/ai")


def verify_secret(x_ai_service_secret: str = Header(...)):
    from app.config import AI_SERVICE_SECRET as SECRET
    if x_ai_service_secret != SECRET:
        raise HTTPException(status_code=403, detail="Invalid service secret")


class GenerateProfileRequest(BaseModel):
    contact_id: str
    agent_id: str


@router.post("/profiles/generate", dependencies=[Depends(verify_secret)])
async def generate_profile(req: GenerateProfileRequest):
    """
    Generate an AI profile summary for a contact and save it to the ai_profiles table.
    """
    # Load contact data
    def _load():
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """SELECT first_name, last_name, email, phone, source, created_at
                   FROM contacts WHERE id = %s AND agent_id = %s""",
                (req.contact_id, req.agent_id),
            )
            contact = cur.fetchone()
            if not contact:
                return None, None, []

            cur.execute("SELECT * FROM buyer_profiles WHERE contact_id = %s", (req.contact_id,))
            bp = cur.fetchone()

            cur.execute(
                """SELECT type, body, created_at FROM activities
                   WHERE contact_id = %s AND agent_id = %s
                   ORDER BY created_at DESC LIMIT 10""",
                (req.contact_id, req.agent_id),
            )
            activities = cur.fetchall()
            return dict(contact), dict(bp) if bp else None, [dict(a) for a in activities]

    contact, bp, activities = await run_query(_load)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    # Build context for Claude
    lines = [
        f"Contact: {contact['first_name']} {contact['last_name']}",
        f"Email: {contact['email'] or 'N/A'} | Phone: {contact['phone'] or 'N/A'}",
        f"Lead Source: {contact['source'] or 'N/A'}",
        f"Added: {contact['created_at'].strftime('%B %d, %Y')}",
    ]
    if bp:
        lines.append(
            f"Buyer Profile: Budget ${bp.get('budget_min', 0):,.0f}–${bp.get('budget_max', 0):,.0f}, "
            f"{bp.get('bedrooms', '?')} beds/{bp.get('bathrooms', '?')} baths, "
            f"Areas: {', '.join(bp.get('locations') or [])}, "
            f"Pre-approved: {bp.get('pre_approved', False)}, "
            f"Timeline: {bp.get('timeline', 'unknown')}, "
            f"Must-haves: {', '.join(bp.get('must_haves') or [])}"
        )
    if activities:
        lines.append("Recent Activity:")
        for a in activities[:5]:
            lines.append(f"  [{a['type'].upper()}] {a['body']}")

    context = "\n".join(lines)
    prompt = (
        f"You are a real estate CRM assistant. Write a 3-5 sentence agent briefing about this contact "
        f"that helps the agent quickly understand who they are, what they're looking for, and the current "
        f"status of the relationship. Be specific, professional, and concise.\n\n{context}"
    )

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    summary = response.content[0].text

    # Save to ai_profiles
    def _save():
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """INSERT INTO ai_profiles (contact_id, summary)
                   VALUES (%s, %s)
                   ON CONFLICT (contact_id) DO UPDATE
                     SET summary = EXCLUDED.summary, updated_at = NOW()
                   RETURNING id, contact_id, summary, created_at, updated_at""",
                (req.contact_id, summary),
            )
            return dict(cur.fetchone())

    profile = await run_query(_save)
    return profile
