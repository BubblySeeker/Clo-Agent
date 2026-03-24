"""
Claude-powered call transcript analysis.
Extracts structured CRM actions (summary, tasks, buyer profile updates,
deal stage suggestions) from call transcripts.
"""
import json
import logging
import re

import anthropic

from app.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL

logger = logging.getLogger(__name__)

_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

ANALYSIS_SYSTEM_PROMPT = """You are analyzing a real estate agent's phone call transcript.
Extract structured CRM updates from the conversation.
Return ONLY valid JSON with this exact structure:
{
  "summary": "2-3 sentence call summary",
  "tasks": [{"body": "task description", "due_date": "YYYY-MM-DD", "priority": "high|medium|low"}],
  "buyer_profile_updates": {"budget_max": null, "locations": [], "bedrooms": null, "bathrooms": null, "pre_approved": null, "timeline": null, "must_haves": [], "deal_breakers": [], "property_type": null},
  "deal_stage_suggestion": null,
  "key_quotes": ["quote1", "quote2"]
}
Only include fields where the transcript provides clear evidence. Use null for uncertain fields. For tasks, pick reasonable due dates relative to the call date. For deal_stage_suggestion, only suggest if there's clear evidence of stage progression (e.g., "Touring" if they discussed showings, "Offer" if they discussed making an offer)."""


def analyze_transcript(transcript_text: str, contact_context: dict, call_metadata: dict) -> dict:
    """Extract structured CRM actions from a call transcript using Claude.

    Args:
        transcript_text: Full transcript with speaker labels.
        contact_context: Dict with contact name, buyer profile summary, etc.
        call_metadata: Dict with direction, duration, date.

    Returns:
        Parsed analysis dict with summary, tasks, buyer_profile_updates,
        deal_stage_suggestion, and key_quotes.
    """
    user_message = (
        f"Contact: {json.dumps(contact_context)}\n\n"
        f"Call: {call_metadata.get('direction', 'unknown')}, "
        f"{call_metadata.get('duration', 0)}s, "
        f"{call_metadata.get('date', 'unknown')}\n\n"
        f"Transcript:\n{transcript_text}"
    )

    logger.info("Analyzing transcript (%d chars) with Claude", len(transcript_text))

    response = _client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=2048,
        system=ANALYSIS_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    return _parse_analysis_json(response.content[0].text)


def _parse_analysis_json(text: str) -> dict:
    """Parse Claude's JSON response, handling markdown fences and malformed output.

    Falls back to a minimal structure if parsing fails entirely.
    """
    # Strip markdown code fences if present
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if fence_match:
        text = fence_match.group(1)

    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting a JSON block
    json_match = re.search(r"\{[\s\S]*\}", text)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass

    # Fallback: return minimal structure with raw text as summary
    logger.warning("Failed to parse analysis JSON, using fallback")
    return {
        "summary": text[:500],
        "tasks": [],
        "buyer_profile_updates": {},
        "deal_stage_suggestion": None,
        "key_quotes": [],
    }


def build_ai_actions(analysis: dict, contact_id: str | None, call_metadata: dict) -> list[dict]:
    """Convert analysis results into structured action items for the frontend.

    Each action has a type, params, and status (pending/confirmed/dismissed).
    These are stored in call_transcripts.ai_actions for the agent to review.
    """
    actions = []

    # Convert tasks to create_task actions
    for task in analysis.get("tasks", []):
        action = {
            "type": "create_task",
            "params": {
                "body": task["body"],
                "due_date": task.get("due_date"),
                "priority": task.get("priority", "medium"),
                "contact_id": contact_id,
            },
            "status": "pending",
        }
        actions.append(action)

    # Buyer profile updates (only if contact exists and has non-null values)
    buyer_updates = analysis.get("buyer_profile_updates", {})
    non_null_updates = {k: v for k, v in buyer_updates.items() if v is not None and v != [] and v != ""}
    if non_null_updates and contact_id:
        actions.append({
            "type": "update_buyer_profile",
            "params": {"contact_id": contact_id, **non_null_updates},
            "status": "pending",
        })

    # Deal stage suggestion (only if contact exists)
    if analysis.get("deal_stage_suggestion") and contact_id:
        actions.append({
            "type": "update_deal_stage",
            "params": {
                "contact_id": contact_id,
                "stage_name": analysis["deal_stage_suggestion"],
            },
            "status": "pending",
        })

    return actions
