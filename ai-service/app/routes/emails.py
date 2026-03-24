"""
Email intelligence endpoints:
- POST /ai/emails/triage  — classify unmatched emails as potential leads
- POST /ai/emails/embed   — embed contact-linked emails for semantic search
"""
import json
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.routes import verify_secret
from app.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL
from app.database import get_conn
from app.services.embeddings import generate_embeddings_batch, upsert_embedding

import anthropic

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/emails", dependencies=[Depends(verify_secret)])

_anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# Gmail labels to skip for lead triage (spam, promotions, social)
SKIP_LABELS = {"SPAM", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "PROMOTIONS", "CATEGORY_FORUMS"}


# ── Triage models ──────────────────────────────────────────────

class TriageEmailItem(BaseModel):
    id: str
    from_address: str
    from_name: str | None = None
    subject: str | None = None
    snippet: str | None = None
    labels: list[str] = []


class TriageRequest(BaseModel):
    agent_id: str
    emails: list[TriageEmailItem]


class TriageResponse(BaseModel):
    leads_found: int
    processed: int
    skipped_spam: int


# ── Embed models ───────────────────────────────────────────────

class EmbedEmailItem(BaseModel):
    id: str
    subject: str | None = None
    from_name: str | None = None
    from_address: str | None = None
    snippet: str | None = None


class EmbedRequest(BaseModel):
    agent_id: str
    emails: list[EmbedEmailItem]


class EmbedResponse(BaseModel):
    embedded: int


# ── Triage endpoint ───────────────────────────────────────────

@router.post("/triage", response_model=TriageResponse)
def triage_emails(req: TriageRequest):
    """Classify unmatched inbound emails as potential real estate leads."""
    # Filter out spam/promotions
    candidates = []
    skipped = 0
    for email in req.emails:
        email_labels = set(email.labels)
        if email_labels & SKIP_LABELS:
            skipped += 1
            continue
        candidates.append(email)

    if not candidates:
        return TriageResponse(leads_found=0, processed=0, skipped_spam=skipped)

    leads_found = 0

    # Process in batches of 20
    batch_size = 20
    for i in range(0, len(candidates), batch_size):
        batch = candidates[i : i + batch_size]
        batch_leads = _classify_batch(batch, req.agent_id)
        leads_found += batch_leads

    return TriageResponse(leads_found=leads_found, processed=len(candidates), skipped_spam=skipped)


def _classify_batch(emails: list[TriageEmailItem], agent_id: str) -> int:
    """Classify a batch of emails using Claude Haiku. Returns number of leads found."""
    # Build the email list for the prompt
    email_entries = []
    for e in emails:
        email_entries.append(
            f"- email_id: {e.id}\n"
            f"  from: {e.from_name or 'Unknown'} <{e.from_address}>\n"
            f"  subject: {e.subject or '(no subject)'}\n"
            f"  snippet: {e.snippet or '(no content)'}"
        )

    emails_text = "\n".join(email_entries)

    try:
        response = _anthropic_client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=2048,
            system=(
                "You are a real estate lead classifier. Analyze each email and determine if the sender "
                "is a potential real estate lead — someone interested in buying, selling, renting, or "
                "inquiring about property. Ignore automated emails, newsletters, receipts, notifications, "
                "and marketing.\n\n"
                "For each email, return a JSON object. If it IS a lead, extract the person's name and any "
                "phone number from the email content. Classify their intent.\n\n"
                "Return ONLY a JSON array, no other text:\n"
                '[{"email_id": "...", "is_lead": true/false, "first_name": "...", "last_name": "...", '
                '"phone": "..." or null, "intent": "buying/selling/renting/inquiry/other", "confidence": 0.0-1.0}]'
            ),
            messages=[{"role": "user", "content": f"Classify these emails:\n\n{emails_text}"}],
        )
    except Exception as e:
        logger.error(f"Lead triage Haiku call failed: {e}")
        return 0

    # Parse response
    try:
        text = response.content[0].text.strip()
        # Handle potential markdown code blocks
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
        classifications = json.loads(text)
    except (json.JSONDecodeError, IndexError, KeyError) as e:
        logger.error(f"Failed to parse triage response: {e}")
        return 0

    # Store lead suggestions
    leads_found = 0
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(f"SET LOCAL app.current_agent_id = '{agent_id}'")
        for item in classifications:
            if not item.get("is_lead"):
                continue
            try:
                cur.execute(
                    """INSERT INTO lead_suggestions
                       (agent_id, email_id, from_address, from_name,
                        suggested_first_name, suggested_last_name,
                        suggested_phone, suggested_intent, confidence)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (email_id) DO NOTHING""",
                    (
                        agent_id,
                        item["email_id"],
                        _find_email(emails, item["email_id"]).from_address,
                        _find_email(emails, item["email_id"]).from_name,
                        item.get("first_name"),
                        item.get("last_name"),
                        item.get("phone"),
                        item.get("intent"),
                        item.get("confidence", 0.0),
                    ),
                )
                leads_found += 1
            except Exception as e:
                logger.warning(f"Failed to insert lead suggestion for {item.get('email_id')}: {e}")
                continue

    return leads_found


def _find_email(emails: list[TriageEmailItem], email_id: str) -> TriageEmailItem:
    """Find email in list by ID."""
    for e in emails:
        if e.id == email_id:
            return e
    # Fallback — return a dummy
    return TriageEmailItem(id=email_id, from_address="unknown")


# ── Embed endpoint ─────────────────────────────────────────────

@router.post("/embed", response_model=EmbedResponse)
def embed_emails(req: EmbedRequest):
    """Generate embeddings for contact-linked emails."""
    if not req.emails:
        return EmbedResponse(embedded=0)

    # Build text representations
    texts = []
    valid_emails = []
    for e in req.emails:
        parts = []
        if e.from_name or e.from_address:
            parts.append(f"Email from {e.from_name or ''} ({e.from_address or ''})")
        if e.subject:
            parts.append(f"Subject: {e.subject}")
        if e.snippet:
            parts.append(e.snippet)

        text = " | ".join(parts) if parts else "Email (no content)"
        texts.append(text)
        valid_emails.append(e)

    if not texts:
        return EmbedResponse(embedded=0)

    # Generate embeddings in batch
    try:
        embeddings = generate_embeddings_batch(texts)
    except Exception as e:
        logger.error(f"Email embedding generation failed: {e}")
        return EmbedResponse(embedded=0)

    # Upsert each embedding
    embedded = 0
    for email, text, embedding in zip(valid_emails, texts, embeddings):
        try:
            upsert_embedding("email", email.id, req.agent_id, text, embedding)
            embedded += 1
        except Exception as e:
            logger.warning(f"Failed to upsert embedding for email {email.id}: {e}")
            continue

    logger.info(f"Embedded {embedded}/{len(valid_emails)} emails for agent {req.agent_id}")
    return EmbedResponse(embedded=embedded)
