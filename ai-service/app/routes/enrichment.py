"""
AI contact enrichment from email history.

POST /ai/enrich-contact — analyze emails for a contact and extract info
"""
import json
import anthropic
import psycopg2.extras
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel

from app.config import AI_SERVICE_SECRET, ANTHROPIC_API_KEY, ANTHROPIC_MODEL
from app.database import get_conn, run_query

router = APIRouter(prefix="/ai")


def verify_secret(x_ai_service_secret: str = Header(...)):
    if x_ai_service_secret != AI_SERVICE_SECRET:
        raise HTTPException(status_code=403, detail="Invalid service secret")


class EnrichContactRequest(BaseModel):
    contact_id: str
    agent_id: str


@router.post("/enrich-contact", dependencies=[Depends(verify_secret)])
async def enrich_contact(req: EnrichContactRequest):
    """Analyze a contact's email history and extract enrichment suggestions."""

    # 1. Load contact + buyer profile + emails
    def _load():
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            cur.execute(
                """SELECT id, first_name, last_name, email, phone, source
                   FROM contacts WHERE id = %s AND agent_id = %s""",
                (req.contact_id, req.agent_id),
            )
            contact = cur.fetchone()
            if not contact:
                return None, None, []

            cur.execute(
                "SELECT * FROM buyer_profiles WHERE contact_id = %s",
                (req.contact_id,),
            )
            bp = cur.fetchone()

            cur.execute(
                """SELECT id, subject, body_text, snippet, from_address, gmail_date
                   FROM emails
                   WHERE contact_id = %s AND agent_id = %s
                   ORDER BY gmail_date DESC
                   LIMIT 20""",
                (req.contact_id, req.agent_id),
            )
            emails = cur.fetchall()
            return (
                dict(contact),
                dict(bp) if bp else None,
                [dict(e) for e in emails],
            )

    contact, bp, emails = await run_query(_load)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    if not emails:
        return {"enrichments": [], "message": "No emails found for this contact"}

    # 2. Build context for Claude
    current_info = [
        f"Name: {contact['first_name']} {contact['last_name']}",
        f"Email: {contact.get('email') or 'N/A'}",
        f"Phone: {contact.get('phone') or 'N/A'}",
        f"Source: {contact.get('source') or 'N/A'}",
    ]
    if bp:
        current_info.append(f"Budget: ${bp.get('budget_min') or 0:,.0f}–${bp.get('budget_max') or 0:,.0f}")
        current_info.append(f"Bedrooms: {bp.get('bedrooms') or 'N/A'}, Bathrooms: {bp.get('bathrooms') or 'N/A'}")
        current_info.append(f"Locations: {', '.join(bp.get('locations') or []) or 'N/A'}")
        current_info.append(f"Must-haves: {', '.join(bp.get('must_haves') or []) or 'N/A'}")
        current_info.append(f"Deal-breakers: {', '.join(bp.get('deal_breakers') or []) or 'N/A'}")
        current_info.append(f"Property type: {bp.get('property_type') or 'N/A'}")
        current_info.append(f"Pre-approved: {bp.get('pre_approved', False)}")
        current_info.append(f"Timeline: {bp.get('timeline') or 'N/A'}")

    email_texts = []
    email_id_map = {}
    for i, e in enumerate(emails):
        email_id_map[i] = e["id"]
        date_str = e["gmail_date"].strftime("%Y-%m-%d") if e.get("gmail_date") else "unknown date"
        body = (e.get("body_text") or e.get("snippet") or "")[:1000]
        email_texts.append(f"[Email {i}] Date: {date_str} | Subject: {e.get('subject', '(none)')}\n{body}")

    prompt = f"""You are a real estate CRM assistant. Analyze the following email history for a contact and extract any information that could update their profile.

CURRENT CONTACT INFO:
{chr(10).join(current_info)}

EMAIL HISTORY:
{chr(10).join(email_texts)}

INSTRUCTIONS:
- Only extract information NOT already in the current contact/buyer profile
- For each extracted piece of info, specify the field name, value, confidence level, evidence snippet, and which email index it came from
- Confidence levels: "high" (explicitly stated), "medium" (strongly implied), "low" (inferred)
- Valid field names: phone, budget_min, budget_max, bedrooms, bathrooms, locations, must_haves, deal_breakers, property_type, pre_approved, timeline, source
- For array fields (locations, must_haves, deal_breakers), provide the value as a comma-separated string
- Return ONLY valid JSON, no markdown formatting

Return JSON in this exact format:
{{"enrichments": [
  {{"field": "budget_max", "value": "600000", "confidence": "high", "evidence": "She mentioned looking for homes under 600k", "email_index": 0}},
  ...
]}}

If no new information can be extracted, return: {{"enrichments": []}}"""

    # 3. Call Claude
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    raw_text = response.content[0].text

    # 4. Parse Claude's response
    try:
        result = json.loads(raw_text)
        enrichments = result.get("enrichments", [])
    except json.JSONDecodeError:
        # Try to extract JSON from the response
        import re
        match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if match:
            result = json.loads(match.group())
            enrichments = result.get("enrichments", [])
        else:
            enrichments = []

    if not enrichments:
        return {"enrichments": [], "message": "No new information found in emails"}

    # 5. Save enrichments to DB
    def _save():
        saved = []
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            for e in enrichments:
                email_idx = e.get("email_index")
                source_email_id = email_id_map.get(email_idx) if email_idx is not None else None
                cur.execute(
                    """INSERT INTO contact_enrichments
                       (agent_id, contact_id, field_name, new_value, source, source_email_id, confidence, status)
                       VALUES (%s, %s, %s, %s, 'email_analysis', %s, %s, 'pending')
                       RETURNING id, contact_id, field_name, old_value, new_value, source,
                                 source_email_id, confidence, status, created_at""",
                    (
                        req.agent_id,
                        req.contact_id,
                        e["field"],
                        str(e["value"]),
                        str(source_email_id) if source_email_id else None,
                        e.get("confidence", "medium"),
                    ),
                )
                row = dict(cur.fetchone())
                row["evidence"] = e.get("evidence", "")
                saved.append(row)
        return saved

    saved_enrichments = await run_query(_save)
    return {"enrichments": saved_enrichments}
