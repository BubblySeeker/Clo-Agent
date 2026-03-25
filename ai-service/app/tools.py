"""
Tool definitions and execution functions for the CloAgent AI assistant.

Read tools execute immediately.
Write tools return a confirmation_required payload; the /ai/confirm endpoint
executes them after the user approves via the frontend confirmation card.
"""
import asyncio
import json
import logging
import uuid
from typing import Any

import httpx
import psycopg2.extras

from app.config import BACKEND_URL, AI_SERVICE_SECRET
from app.database import get_conn, run_query

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pending actions: persisted in PostgreSQL (survives restarts)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Tool definitions (Anthropic tool schema format)
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS = [
    {
        "name": "get_dashboard_summary",
        "description": "Get total contacts, active deals, total pipeline value, and recent activity counts for the agent.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "search_contacts",
        "description": (
            "Search for contacts by name, email, or filter by source. "
            "Use this tool before any operation that needs a contact_id — never guess UUIDs. "
            "The query matches against first_name, last_name, email, and full name (first + last concatenated). "
            "Pass a full name like 'Rohan Batre' or just a partial name like 'Rohan'. "
            "For recency references ('my last contact'), call with no query and limit=1 — results are sorted newest first. "
            "Returns: id, first_name, last_name, email, source, created_at, last_activity_at."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term to match against first_name, last_name, or email"},
                "source": {"type": "string", "description": "Filter by lead source (e.g. Zillow, Referral, Cold Call)"},
                "limit": {"type": "integer", "description": "Max number of results (default 10)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_contact_details",
        "description": "Get full profile for a single contact including buyer profile if available.",
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
        "description": "Get activity history (calls, emails, notes, showings, tasks) for a contact.",
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
        "name": "list_deals",
        "description": "List deals with optional stage or contact filters.",
        "input_schema": {
            "type": "object",
            "properties": {
                "stage_name": {"type": "string", "description": "Filter by stage name (e.g. Lead, Offer, Closed)"},
                "contact_id": {"type": "string", "description": "Filter by contact UUID"},
                "limit": {"type": "integer", "description": "Max results (default 20)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_deal_stages",
        "description": "Get all 7 pipeline stages with their names, positions, and colors.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_deal",
        "description": "Get full details for a single deal including contact name and stage info.",
        "input_schema": {
            "type": "object",
            "properties": {
                "deal_id": {"type": "string", "description": "UUID of the deal"},
            },
            "required": ["deal_id"],
        },
    },
    {
        "name": "get_buyer_profile",
        "description": "Get buyer preferences/profile for a contact (budget, bedrooms, bathrooms, locations, must-haves, deal-breakers, timeline, pre-approval status).",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "get_all_activities",
        "description": "Get recent activities across ALL contacts. Useful for 'what happened today/this week' type questions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": ["call", "email", "note", "showing", "task"], "description": "Filter by activity type"},
                "limit": {"type": "integer", "description": "Max results (default 25)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_analytics",
        "description": "Get pipeline analytics: deal counts and values by stage, activity volume, contact source breakdown.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_overdue_tasks",
        "description": "Get all tasks past their due date and not yet completed.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Max results (default 20)"},
            },
            "required": [],
        },
    },
    {
        "name": "semantic_search",
        "description": "Search contacts, activities, and other CRM data by meaning rather than exact text match. Use when the user asks vague questions like 'who was looking for a pool?' or 'any leads from the open house?'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural language search query"},
                "limit": {"type": "integer", "description": "Max results (default 10)"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "create_contact",
        "description": "IMPORTANT: Only use this to create a brand-new contact that does NOT already exist. If you found the contact via search, use update_contact instead. Create a new contact. Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "first_name": {"type": "string"},
                "last_name": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "source": {"type": "string", "description": "Lead source (Zillow, Referral, Cold Call, Open House, WhatsApp)"},
            },
            "required": ["first_name", "last_name"],
        },
    },
    {
        "name": "update_contact",
        "description": "Use this to add or change any field on an EXISTING contact. This includes adding email, phone, or any other field to a contact found via search. Update contact information. Requires user confirmation before executing.",
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
        "name": "log_activity",
        "description": "Use this to record something that already happened — a call, meeting, note, showing, or email interaction. Log a call, email, note, showing, or task for a contact. Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "type": {"type": "string", "enum": ["call", "email", "note", "showing", "task"]},
                "body": {"type": "string", "description": "Description of the activity"},
            },
            "required": ["contact_id", "type", "body"],
        },
    },
    {
        "name": "create_deal",
        "description": "Create a new deal in the pipeline. Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "stage_name": {"type": "string", "description": "Pipeline stage name (e.g. Lead, Contacted, Offer)"},
                "title": {"type": "string"},
                "value": {"type": "number", "description": "Deal value in dollars"},
                "notes": {"type": "string"},
            },
            "required": ["contact_id", "title"],
        },
    },
    {
        "name": "update_deal",
        "description": "Update a deal (e.g. move to a different pipeline stage). Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "deal_id": {"type": "string"},
                "stage_name": {"type": "string"},
                "title": {"type": "string"},
                "value": {"type": "number"},
                "notes": {"type": "string"},
            },
            "required": ["deal_id"],
        },
    },
    {
        "name": "delete_contact",
        "description": "Delete a contact and all associated data (deals, activities, buyer profile). Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact to delete"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "delete_deal",
        "description": "Delete a deal from the pipeline. Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "deal_id": {"type": "string", "description": "UUID of the deal to delete"},
            },
            "required": ["deal_id"],
        },
    },
    {
        "name": "create_buyer_profile",
        "description": "Create a buyer profile for a contact with their property preferences. Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "budget_min": {"type": "number", "description": "Minimum budget in dollars"},
                "budget_max": {"type": "number", "description": "Maximum budget in dollars"},
                "bedrooms": {"type": "integer"},
                "bathrooms": {"type": "integer"},
                "locations": {"type": "array", "items": {"type": "string"}, "description": "Preferred areas/neighborhoods"},
                "must_haves": {"type": "array", "items": {"type": "string"}, "description": "Required features (e.g. pool, garage)"},
                "deal_breakers": {"type": "array", "items": {"type": "string"}, "description": "Unwanted features (e.g. HOA, busy street)"},
                "property_type": {"type": "string", "description": "e.g. Single Family, Condo, Townhouse"},
                "pre_approved": {"type": "boolean", "description": "Whether the buyer is pre-approved for a mortgage"},
                "timeline": {"type": "string", "description": "e.g. ASAP, 3 months, 6 months"},
                "notes": {"type": "string"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "update_buyer_profile",
        "description": "Update an existing buyer profile for a contact. Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "budget_min": {"type": "number"},
                "budget_max": {"type": "number"},
                "bedrooms": {"type": "integer"},
                "bathrooms": {"type": "integer"},
                "locations": {"type": "array", "items": {"type": "string"}},
                "must_haves": {"type": "array", "items": {"type": "string"}},
                "deal_breakers": {"type": "array", "items": {"type": "string"}},
                "property_type": {"type": "string"},
                "pre_approved": {"type": "boolean"},
                "timeline": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "create_task",
        "description": "Create a new task with due date and priority. Resolve relative dates (tomorrow, next Monday, etc.) to YYYY-MM-DD before calling. Requires confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "Optional contact UUID to associate the task with"},
                "body": {"type": "string", "description": "Task description"},
                "due_date": {"type": "string", "description": "Due date in YYYY-MM-DD format. Default to tomorrow if user doesn't specify."},
                "priority": {"type": "string", "enum": ["high", "medium", "low"], "description": "Default to medium if not specified."},
            },
            "required": ["body", "due_date"],
        },
    },
    {
        "name": "complete_task",
        "description": "Mark a task as completed. Requires confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "Task UUID"},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "reschedule_task",
        "description": "Change a task's due date. Requires confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "new_due_date": {"type": "string", "description": "YYYY-MM-DD"},
            },
            "required": ["task_id", "new_due_date"],
        },
    },
    # --- Document RAG tools ---
    {
        "name": "search_documents",
        "description": (
            "Search uploaded documents using hybrid semantic + keyword search. "
            "Returns relevant passages with source citations (document name, page number, section). "
            "Use this when the user asks questions that might be answered by their uploaded documents "
            "(contracts, listings, reports, spreadsheets, etc.)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query — be specific for best results"},
                "document_id": {"type": "string", "description": "Optional: limit search to a specific document UUID"},
                "contact_id": {"type": "string", "description": "Optional: search only documents linked to this contact"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "list_documents",
        "description": "List all documents uploaded by the agent. Use to see what documents are available before searching.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "Optional: filter to documents linked to this contact"},
            },
            "required": [],
        },
    },
    # --- Property tools ---
    {
        "name": "search_properties",
        "description": "Search properties by address, MLS ID, status, type, price range, or bedrooms. Returns matching property listings.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term to match against address or MLS ID"},
                "status": {"type": "string", "enum": ["active", "pending", "sold", "off_market"], "description": "Filter by listing status"},
                "property_type": {"type": "string", "description": "e.g. Single Family, Condo, Townhouse"},
                "min_price": {"type": "number", "description": "Minimum price filter"},
                "max_price": {"type": "number", "description": "Maximum price filter"},
                "bedrooms": {"type": "integer", "description": "Minimum number of bedrooms"},
                "limit": {"type": "integer", "description": "Max results (default 10)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_property",
        "description": "Get full details for a single property including linked deals.",
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
        "description": "Match a buyer's profile preferences against active property listings. Returns the buyer profile and ranked property matches with scores.",
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
        "description": "Create a new property listing. Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "address": {"type": "string", "description": "Street address of the property"},
                "city": {"type": "string"},
                "state": {"type": "string"},
                "zip": {"type": "string"},
                "price": {"type": "number", "description": "Listing price in dollars"},
                "bedrooms": {"type": "integer"},
                "bathrooms": {"type": "number"},
                "sqft": {"type": "integer", "description": "Square footage"},
                "property_type": {"type": "string", "description": "e.g. Single Family, Condo, Townhouse"},
                "status": {"type": "string", "enum": ["active", "pending", "sold", "off_market"], "description": "Listing status (default: active)"},
                "listing_type": {"type": "string", "description": "e.g. Sale, Rental"},
                "mls_id": {"type": "string", "description": "MLS listing ID"},
                "description": {"type": "string", "description": "Property description"},
                "year_built": {"type": "integer"},
                "lot_size": {"type": "number", "description": "Lot size in acres or sqft"},
            },
            "required": ["address"],
        },
    },
    {
        "name": "update_property",
        "description": "Update a property listing. Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "property_id": {"type": "string", "description": "UUID of the property"},
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
        "description": "Delete a property listing. Linked deals will have their property_id set to NULL. Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "property_id": {"type": "string", "description": "UUID of the property to delete"},
            },
            "required": ["property_id"],
        },
    },
    {
        "name": "search_sms",
        "description": "Search SMS messages by body text, phone number, or contact. Returns matching text messages.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term to match against message body or phone number"},
                "contact_id": {"type": "string", "description": "Filter by contact UUID"},
                "limit": {"type": "integer", "description": "Max results (default 20)"},
            },
            "required": [],
        },
    },
    # ----- Gmail / Email tools -----
    {
        "name": "search_emails",
        "description": "Search synced Gmail emails. Use contacts_only=true when asked about emails from/to contacts (filters out spam/marketing). Without contacts_only, returns all emails including promotional ones.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term to match against subject, sender name, or snippet"},
                "contact_id": {"type": "string", "description": "Filter to emails linked to this contact UUID"},
                "contacts_only": {"type": "boolean", "description": "If true, only return emails linked to a CRM contact (excludes spam/marketing). Use this when asked about contact messages."},
                "limit": {"type": "integer", "description": "Max results (default 10, use higher like 50 when searching across all contacts)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_sms_conversation",
        "description": "Get all SMS messages with a specific contact or phone number, ordered chronologically.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact"},
                "phone_number": {"type": "string", "description": "Phone number (if no contact_id)"},
                "limit": {"type": "integer", "description": "Max results (default 50)"},
            },
            "required": [],
        },
    },
    {
        "name": "send_sms",
        "description": "Send an SMS text message to a phone number via Twilio. Requires user confirmation before sending.",
        "input_schema": {
            "type": "object",
            "properties": {
                "to": {"type": "string", "description": "Phone number to send to (E.164 format preferred, e.g. +15551234567)"},
                "body": {"type": "string", "description": "The text message content"},
                "contact_id": {"type": "string", "description": "Optional contact UUID to associate with"},
            },
            "required": ["to", "body"],
        },
    },
    {
        "name": "search_call_logs",
        "description": "Search call history. Filter by contact or direction (inbound/outbound).",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact to filter by"},
                "direction": {"type": "string", "description": "Filter by direction: 'inbound' or 'outbound'"},
                "limit": {"type": "integer", "description": "Max results (default 20)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_call_history",
        "description": "Get call history for a specific contact, ordered by most recent first.",
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
        "name": "get_email_thread",
        "description": "Get all emails in a thread (conversation) by thread ID. Returns emails in chronological order. Use search_emails first to find the thread_id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "thread_id": {"type": "string", "description": "Gmail thread ID"},
                "limit": {"type": "integer", "description": "Max emails to return (default 20)"},
            },
            "required": ["thread_id"],
        },
    },
    {
        "name": "draft_email",
        "description": "Generate an email draft for the agent to review and edit before sending. Returns structured {to, subject, body} fields. Does NOT send the email.",
        "input_schema": {
            "type": "object",
            "properties": {
                "to": {"type": "string", "description": "Recipient email address"},
                "subject": {"type": "string", "description": "Email subject line"},
                "context": {"type": "string", "description": "What the email should be about — the AI will write the body"},
                "contact_id": {"type": "string", "description": "Optional contact UUID for context about the recipient"},
            },
            "required": ["to", "context"],
        },
    },
    {
        "name": "send_email",
        "description": "Send an email via the agent's connected Gmail account. Requires Gmail to be connected and user confirmation before sending.",
        "input_schema": {
            "type": "object",
            "properties": {
                "to": {"type": "string", "description": "Recipient email address"},
                "subject": {"type": "string", "description": "Email subject line"},
                "body": {"type": "string", "description": "Email body (plain text)"},
                "cc": {"type": "string", "description": "CC recipient email address (optional)"},
            },
            "required": ["to", "subject", "body"],
        },
    },
    {
        "name": "get_lead_score",
        "description": "Get a contact's lead score with tier classification, dimension breakdown, top signals, and suggested next action. Use this when the user asks about a contact's score, priority, or engagement level.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "UUID of the contact to get lead score for"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "get_call_transcript",
        "description": "Get the full transcript with speaker labels, AI summary, and suggested actions for a specific call. Use when the agent asks about what was said on a call.",
        "input_schema": {
            "type": "object",
            "properties": {
                "call_id": {"type": "string", "description": "UUID of the call log entry"},
            },
            "required": ["call_id"],
        },
    },
    {
        "name": "search_call_transcripts",
        "description": "Search call transcripts by text content. Use when the agent asks about what was discussed on calls or wants to find calls where a topic was mentioned.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term to find in transcript text"},
                "contact_id": {"type": "string", "description": "Optional: limit to a specific contact's calls"},
                "limit": {"type": "integer", "description": "Max results (default 10)"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "initiate_call",
        "description": "Initiate an outbound phone call via Twilio. Requires user confirmation before dialing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "to": {"type": "string", "description": "Phone number to call (E.164 format preferred, e.g. +15551234567)"},
                "contact_id": {"type": "string", "description": "Optional contact UUID to associate with"},
            },
            "required": ["to"],
        },
    },
]

READ_TOOLS = {
    "get_dashboard_summary",
    "search_contacts",
    "get_contact_details",
    "get_contact_activities",
    "get_deal",
    "get_buyer_profile",
    "get_all_activities",
    "list_deals",
    "get_deal_stages",
    "get_analytics",
    "get_overdue_tasks",
    "semantic_search",
    "search_documents",
    "list_documents",
    "search_properties",
    "get_property",
    "match_buyer_to_properties",
    "search_sms",
    "get_sms_conversation",
    "search_call_logs",
    "get_call_history",
    "get_call_transcript",
    "search_call_transcripts",
    "search_emails",
    "get_email_thread",
    "draft_email",
    "get_lead_score",
}

WRITE_TOOLS = {
    "create_contact",
    "update_contact",
    "delete_contact",
    "log_activity",
    "create_deal",
    "update_deal",
    "delete_deal",
    "create_buyer_profile",
    "update_buyer_profile",
    "create_task",
    "complete_task",
    "reschedule_task",
    "create_property",
    "update_property",
    "delete_property",
    "send_sms",
    "initiate_call",
    "send_email",
}

# Tools that are write operations but safe to auto-execute without confirmation.
# These modify existing records (no creates/deletes of primary entities, no emails).
AUTO_EXECUTE_TOOLS = {
    "update_contact", "log_activity", "complete_task", "reschedule_task",
    "update_buyer_profile", "update_deal", "update_property",
}

# ---------------------------------------------------------------------------
# Read tool executors
# ---------------------------------------------------------------------------

async def execute_read_tool(tool_name: str, tool_input: dict, agent_id: str) -> Any:
    if tool_name == "get_dashboard_summary":
        return await run_query(lambda: _get_dashboard_summary(agent_id))
    elif tool_name == "search_contacts":
        return await run_query(lambda: _search_contacts(agent_id, tool_input))
    elif tool_name == "get_contact_details":
        return await run_query(lambda: _get_contact_details(agent_id, tool_input["contact_id"]))
    elif tool_name == "get_contact_activities":
        return await run_query(lambda: _get_contact_activities(agent_id, tool_input["contact_id"], tool_input.get("limit", 20)))
    elif tool_name == "get_deal":
        return await run_query(lambda: _get_deal(agent_id, tool_input["deal_id"]))
    elif tool_name == "get_buyer_profile":
        return await run_query(lambda: _get_buyer_profile(agent_id, tool_input["contact_id"]))
    elif tool_name == "get_all_activities":
        return await run_query(lambda: _get_all_activities(agent_id, tool_input))
    elif tool_name == "list_deals":
        return await run_query(lambda: _list_deals(agent_id, tool_input))
    elif tool_name == "get_deal_stages":
        return await run_query(lambda: _get_deal_stages())
    elif tool_name == "get_analytics":
        return await run_query(lambda: _get_analytics(agent_id))
    elif tool_name == "get_overdue_tasks":
        return await run_query(lambda: _get_overdue_tasks(agent_id, tool_input.get("limit", 20)))
    elif tool_name == "semantic_search":
        return await run_query(lambda: _semantic_search(agent_id, tool_input))
    elif tool_name == "search_documents":
        return await run_query(lambda: _search_documents(agent_id, tool_input))
    elif tool_name == "list_documents":
        return await run_query(lambda: _list_documents(agent_id, tool_input))
    elif tool_name == "search_properties":
        return await run_query(lambda: _search_properties(agent_id, tool_input))
    elif tool_name == "get_property":
        return await run_query(lambda: _get_property(agent_id, tool_input["property_id"]))
    elif tool_name == "match_buyer_to_properties":
        return await run_query(lambda: _match_buyer_to_properties(agent_id, tool_input["contact_id"]))
    elif tool_name == "search_sms":
        return await run_query(lambda: _search_sms(agent_id, tool_input))
    elif tool_name == "get_sms_conversation":
        return await run_query(lambda: _get_sms_conversation(agent_id, tool_input))
    elif tool_name == "search_call_logs":
        return await run_query(lambda: _search_call_logs(agent_id, tool_input))
    elif tool_name == "get_call_history":
        return await run_query(lambda: _get_call_history(agent_id, tool_input))
    elif tool_name == "get_call_transcript":
        return await run_query(lambda: _get_call_transcript(agent_id, tool_input))
    elif tool_name == "search_call_transcripts":
        return await run_query(lambda: _search_call_transcripts(agent_id, tool_input))
    elif tool_name == "search_emails":
        return await run_query(lambda: _search_emails(agent_id, tool_input))
    elif tool_name == "get_email_thread":
        return await run_query(lambda: _get_email_thread(agent_id, tool_input["thread_id"], tool_input.get("limit", 20)))
    elif tool_name == "draft_email":
        return await _draft_email(agent_id, tool_input)
    elif tool_name == "get_lead_score":
        return await run_query(lambda: _get_lead_score(agent_id, tool_input["contact_id"]))
    else:
        return {"error": f"Unknown tool: {tool_name}"}


def _get_dashboard_summary(agent_id: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT COUNT(*) AS total FROM contacts WHERE agent_id = %s", (agent_id,))
        total_contacts = cur.fetchone()["total"]

        cur.execute(
            """SELECT COUNT(*) AS active,
                      COALESCE(SUM(value), 0) AS pipeline_value
               FROM deals d
               JOIN deal_stages s ON s.id = d.stage_id
               WHERE d.agent_id = %s AND s.name NOT IN ('Closed', 'Lost')""",
            (agent_id,),
        )
        row = cur.fetchone()

        cur.execute(
            "SELECT COUNT(*) AS cnt FROM activities WHERE agent_id = %s AND created_at > NOW() - INTERVAL '7 days'",
            (agent_id,),
        )
        recent_activities = cur.fetchone()["cnt"]

        cur.execute(
            """SELECT COUNT(*) AS cnt FROM deals d
               JOIN deal_stages s ON s.id = d.stage_id
               WHERE d.agent_id = %s AND s.name = 'Closed'
               AND d.updated_at > date_trunc('month', NOW())""",
            (agent_id,),
        )
        closed_this_month = cur.fetchone()["cnt"]

        return {
            "total_contacts": int(total_contacts),
            "active_deals": int(row["active"]),
            "pipeline_value": float(row["pipeline_value"]),
            "recent_activities_7d": int(recent_activities),
            "closed_this_month": int(closed_this_month),
        }


def _search_contacts(agent_id: str, inp: dict) -> list:
    query = inp.get("query", "")
    source = inp.get("source")
    limit = inp.get("limit", 10)

    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        params: list = [agent_id]
        where_clauses = ["c.agent_id = %s"]

        if query:
            params.append(f"%{query}%")
            params.append(f"%{query}%")
            params.append(f"%{query}%")
            params.append(f"%{query}%")
            where_clauses.append(
                "(c.first_name ILIKE %s OR c.last_name ILIKE %s OR c.email ILIKE %s OR (c.first_name || ' ' || c.last_name) ILIKE %s)"
            )
        if source:
            params.append(source)
            where_clauses.append("c.source = %s")

        params.append(limit)
        sql = f"""
            SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.source, c.created_at,
                   MAX(a.created_at) AS last_activity_at
            FROM contacts c
            LEFT JOIN activities a ON a.contact_id = c.id
            WHERE {' AND '.join(where_clauses)}
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT %s
        """
        cur.execute(sql, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def _get_contact_details(agent_id: str, contact_id: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
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


def _get_lead_score(agent_id: str, contact_id: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT first_name, last_name, lead_score, lead_score_signals, previous_lead_score "
            "FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "Contact not found"}

        score = row["lead_score"]
        if score is None:
            return {"error": "No lead score calculated yet for this contact"}

        signals = row["lead_score_signals"] or {}
        previous = row["previous_lead_score"]

        # Determine tier
        if score >= 80:
            tier = "Hot"
        elif score >= 50:
            tier = "Warm"
        elif score >= 25:
            tier = "Cool"
        else:
            tier = "Cold"

        # Dimension breakdown — signals JSONB has a `dimensions` key with sub-objects each having a `score` field
        dims_raw = signals.get("dimensions", {})
        dimensions = {
            "engagement": dims_raw.get("engagement", {}).get("score", 0) if isinstance(dims_raw.get("engagement"), dict) else dims_raw.get("engagement", 0),
            "readiness": dims_raw.get("readiness", {}).get("score", 0) if isinstance(dims_raw.get("readiness"), dict) else dims_raw.get("readiness", 0),
            "velocity": dims_raw.get("velocity", {}).get("score", 0) if isinstance(dims_raw.get("velocity"), dict) else dims_raw.get("velocity", 0),
            "profile_completeness": dims_raw.get("profile", {}).get("score", 0) if isinstance(dims_raw.get("profile"), dict) else dims_raw.get("profile_completeness", 0),
        }

        # Top 3 signals from the `signals` list in the JSONB
        top_signals = signals.get("signals", [])[:3]

        # Trend
        if previous is None:
            trend = "new"
        elif score > previous:
            trend = "rising"
        elif score < previous:
            trend = "falling"
        else:
            trend = "stable"

        # Suggested action based on tier
        actions = {
            "Hot": "High priority — reach out today, this lead is actively engaged",
            "Warm": "Good momentum — schedule a follow-up within 2-3 days",
            "Cool": "Needs nurturing — send relevant listings or market updates",
            "Cold": "Re-engage — consider a check-in call or remove from active pipeline",
        }

        return {
            "contact": f"{row['first_name']} {row['last_name']}",
            "score": score,
            "tier": tier,
            "trend": trend,
            "previous_score": previous,
            "dimensions": dimensions,
            "top_signals": top_signals,
            "suggested_action": actions[tier],
        }


def _get_contact_activities(agent_id: str, contact_id: str, limit: int) -> list:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT id, type, body, created_at FROM activities
               WHERE contact_id = %s AND agent_id = %s
               ORDER BY created_at DESC LIMIT %s""",
            (contact_id, agent_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]


def _get_deal(agent_id: str, deal_id: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT d.id, d.title, d.value, d.notes, d.created_at, d.updated_at,
                      s.name AS stage_name, s.color AS stage_color,
                      c.first_name || ' ' || c.last_name AS contact_name,
                      c.id AS contact_id
               FROM deals d
               JOIN deal_stages s ON s.id = d.stage_id
               JOIN contacts c ON c.id = d.contact_id
               WHERE d.id = %s AND d.agent_id = %s""",
            (deal_id, agent_id),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "Deal not found"}
        return dict(row)


def _get_buyer_profile(agent_id: str, contact_id: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # Verify contact belongs to agent
        cur.execute(
            "SELECT id FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        if not cur.fetchone():
            return {"error": "Contact not found"}
        cur.execute("SELECT * FROM buyer_profiles WHERE contact_id = %s", (contact_id,))
        bp = cur.fetchone()
        if not bp:
            return {"error": "No buyer profile exists for this contact"}
        return dict(bp)


def _get_all_activities(agent_id: str, inp: dict) -> list:
    activity_type = inp.get("type")
    limit = inp.get("limit", 25)
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        params: list = [agent_id]
        where_clauses = ["a.agent_id = %s"]
        if activity_type:
            params.append(activity_type)
            where_clauses.append("a.type = %s")
        params.append(limit)
        sql = f"""
            SELECT a.id, a.type, a.body, a.created_at,
                   c.first_name || ' ' || c.last_name AS contact_name,
                   c.id AS contact_id
            FROM activities a
            JOIN contacts c ON c.id = a.contact_id
            WHERE {' AND '.join(where_clauses)}
            ORDER BY a.created_at DESC LIMIT %s
        """
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]


def _list_deals(agent_id: str, inp: dict) -> list:
    stage_name = inp.get("stage_name")
    contact_id = inp.get("contact_id")
    limit = inp.get("limit", 20)

    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        params: list = [agent_id]
        where_clauses = ["d.agent_id = %s"]

        if stage_name:
            params.append(stage_name)
            where_clauses.append("s.name = %s")
        if contact_id:
            params.append(contact_id)
            where_clauses.append("d.contact_id = %s")

        params.append(limit)
        sql = f"""
            SELECT d.id, d.title, d.value, d.notes, d.created_at,
                   s.name AS stage_name, s.color AS stage_color,
                   c.first_name || ' ' || c.last_name AS contact_name
            FROM deals d
            JOIN deal_stages s ON s.id = d.stage_id
            JOIN contacts c ON c.id = d.contact_id
            WHERE {' AND '.join(where_clauses)}
            ORDER BY d.created_at DESC LIMIT %s
        """
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]


def _get_deal_stages() -> list:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id, name, position, color FROM deal_stages ORDER BY position")
        return [dict(r) for r in cur.fetchall()]


def _get_analytics(agent_id: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Pipeline by stage
        cur.execute(
            """SELECT s.name, s.color, COUNT(d.id) AS count, COALESCE(SUM(d.value), 0) AS total_value
               FROM deal_stages s
               LEFT JOIN deals d ON d.stage_id = s.id AND d.agent_id = %s
               GROUP BY s.id ORDER BY s.position""",
            (agent_id,),
        )
        pipeline = [dict(r) for r in cur.fetchall()]

        # Activity counts by type (last 30 days)
        cur.execute(
            """SELECT type, COUNT(*) AS count FROM activities
               WHERE agent_id = %s AND created_at > NOW() - INTERVAL '30 days'
               GROUP BY type""",
            (agent_id,),
        )
        activity_counts = {r["type"]: int(r["count"]) for r in cur.fetchall()}

        # Contact sources
        cur.execute(
            "SELECT source, COUNT(*) AS count FROM contacts WHERE agent_id = %s GROUP BY source",
            (agent_id,),
        )
        sources = {r["source"] or "Unknown": int(r["count"]) for r in cur.fetchall()}

        return {
            "pipeline_by_stage": pipeline,
            "activity_counts_30d": activity_counts,
            "contact_sources": sources,
        }


# ---------------------------------------------------------------------------
# Embedding hooks (fire-and-forget in background)
# ---------------------------------------------------------------------------

def _schedule_embed(source_type: str, source_id: str, agent_id: str) -> None:
    """Schedule embedding generation in a background task (non-blocking)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_embed_async(source_type, source_id, agent_id))
    except RuntimeError:
        pass  # no event loop — skip silently (e.g. during tests)


async def _embed_async(source_type: str, source_id: str, agent_id: str) -> None:
    """Generate and store an embedding in a thread."""
    try:
        from app.services.embeddings import embed_contact, embed_activity
        if source_type == "contact":
            await run_query(lambda: embed_contact(source_id, agent_id))
        elif source_type == "activity":
            await run_query(lambda: embed_activity(source_id, agent_id))
    except Exception as e:
        logger.warning("Embedding generation failed for %s/%s: %s", source_type, source_id, e)


def _search_sms(agent_id: str, inp: dict) -> list:
    query = inp.get("query", "")
    contact_id = inp.get("contact_id")
    limit = inp.get("limit", 20)
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        where_parts = ["s.agent_id = %s"]
        params: list = [agent_id]
        if query:
            params.extend([f"%{query}%", f"%{query}%", f"%{query}%"])
            where_parts.append("(s.body ILIKE %s OR s.from_number ILIKE %s OR s.to_number ILIKE %s)")
        if contact_id:
            params.append(contact_id)
            where_parts.append("s.contact_id = %s")
        where_clause = " AND ".join(where_parts)
        params.append(limit)
        cur.execute(
            f"""SELECT s.id, s.contact_id, s.from_number, s.to_number, s.body, s.direction, s.status, s.sent_at,
                       COALESCE(c.first_name || ' ' || c.last_name, '') as contact_name
                FROM sms_messages s
                LEFT JOIN contacts c ON c.id = s.contact_id
                WHERE {where_clause}
                ORDER BY s.sent_at DESC LIMIT %s""",
            params,
        )
        return [dict(r) for r in cur.fetchall()]


def _get_sms_conversation(agent_id: str, inp: dict) -> list | dict:
    contact_id = inp.get("contact_id")
    phone_number = inp.get("phone_number")
    limit = inp.get("limit", 50)
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if contact_id:
            cur.execute(
                """SELECT s.id, s.from_number, s.to_number, s.body, s.direction, s.status, s.sent_at
                   FROM sms_messages s
                   WHERE s.agent_id = %s AND s.contact_id = %s
                   ORDER BY s.sent_at ASC LIMIT %s""",
                (agent_id, contact_id, limit),
            )
        elif phone_number:
            cur.execute(
                """SELECT s.id, s.from_number, s.to_number, s.body, s.direction, s.status, s.sent_at
                   FROM sms_messages s
                   WHERE s.agent_id = %s AND (s.from_number = %s OR s.to_number = %s)
                   ORDER BY s.sent_at ASC LIMIT %s""",
                (agent_id, phone_number, phone_number, limit),
            )
        else:
            return {"error": "contact_id or phone_number is required"}
        return [dict(r) for r in cur.fetchall()]


async def _send_sms_via_backend(agent_id: str, inp: dict) -> dict:
    """Send SMS by proxying through the Go backend."""
    import httpx
    from app.config import BACKEND_URL, AI_SERVICE_SECRET
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{BACKEND_URL}/api/sms/send",
                json={"to": inp["to"], "body": inp["body"], "contact_id": inp.get("contact_id")},
                headers={
                    "X-AI-Service-Secret": AI_SERVICE_SECRET,
                    "X-Agent-ID": agent_id,
                },
                timeout=15.0,
            )
            if resp.status_code >= 400:
                return {"error": f"Failed to send SMS: {resp.text}"}
            return resp.json()
    except Exception as e:
        return {"error": f"SMS send failed: {str(e)}"}


def _search_call_logs(agent_id: str, inp: dict) -> list:
    contact_id = inp.get("contact_id")
    direction = inp.get("direction")
    limit = inp.get("limit", 20)
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        where = "cl.agent_id = %s"
        params: list = [agent_id]
        if contact_id:
            where += " AND cl.contact_id = %s"
            params.append(contact_id)
        if direction:
            where += " AND cl.direction = %s"
            params.append(direction)
        params.append(limit)
        cur.execute(
            f"""SELECT cl.id, cl.from_number, cl.to_number, cl.direction, cl.status,
                       cl.duration, cl.started_at, cl.ended_at,
                       COALESCE(c.first_name || ' ' || c.last_name, '') AS contact_name
                FROM call_logs cl
                LEFT JOIN contacts c ON c.id = cl.contact_id
                WHERE {where}
                ORDER BY cl.started_at DESC LIMIT %s""",
            params,
        )
        return [dict(r) for r in cur.fetchall()]


def _get_call_history(agent_id: str, inp: dict) -> list:
    contact_id = inp["contact_id"]
    limit = inp.get("limit", 20)
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT cl.id, cl.from_number, cl.to_number, cl.direction, cl.status,
                      cl.duration, cl.started_at, cl.ended_at
               FROM call_logs cl
               WHERE cl.agent_id = %s AND cl.contact_id = %s
               ORDER BY cl.started_at DESC LIMIT %s""",
            (agent_id, contact_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]


def _get_call_transcript(agent_id: str, inp: dict) -> dict:
    call_id = inp["call_id"]
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT ct.id, ct.full_text, ct.speaker_segments, ct.ai_summary,
                      ct.ai_actions, ct.status, ct.duration_seconds, ct.word_count,
                      ct.created_at, ct.completed_at,
                      cl.direction, cl.from_number, cl.to_number, cl.duration,
                      cl.started_at,
                      COALESCE(c.first_name || ' ' || c.last_name, '') AS contact_name
               FROM call_transcripts ct
               JOIN call_logs cl ON cl.id = ct.call_id
               LEFT JOIN contacts c ON c.id = cl.contact_id
               WHERE ct.call_id = %s AND ct.agent_id = %s""",
            (call_id, agent_id),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "No transcript found for this call"}
        result = dict(row)
        # Parse JSONB fields if returned as strings
        if isinstance(result.get("speaker_segments"), str):
            result["speaker_segments"] = json.loads(result["speaker_segments"])
        if isinstance(result.get("ai_actions"), str):
            result["ai_actions"] = json.loads(result["ai_actions"])
        return result


def _search_call_transcripts(agent_id: str, inp: dict) -> list:
    query = inp["query"]
    contact_id = inp.get("contact_id")
    limit = inp.get("limit", 10)
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        where_parts = ["ct.agent_id = %s", "ct.status = 'completed'"]
        params: list = [agent_id]

        # Use PostgreSQL full-text search
        params.append(query)
        where_parts.append("to_tsvector('english', ct.full_text) @@ plainto_tsquery('english', %s)")

        if contact_id:
            params.append(contact_id)
            where_parts.append("cl.contact_id = %s")

        where_clause = " AND ".join(where_parts)
        params.append(limit)
        cur.execute(
            f"""SELECT ct.call_id, ct.ai_summary, ct.word_count, ct.created_at,
                       cl.direction, cl.duration, cl.started_at,
                       COALESCE(c.first_name || ' ' || c.last_name, '') AS contact_name
                FROM call_transcripts ct
                JOIN call_logs cl ON cl.id = ct.call_id
                LEFT JOIN contacts c ON c.id = cl.contact_id
                WHERE {where_clause}
                ORDER BY ct.created_at DESC LIMIT %s""",
            params,
        )
        return [dict(r) for r in cur.fetchall()]


async def _initiate_call_via_backend(agent_id: str, inp: dict) -> dict:
    """Initiate a call by proxying through the Go backend."""
    import httpx
    from app.config import BACKEND_URL, AI_SERVICE_SECRET
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{BACKEND_URL}/api/calls/initiate",
                json={"to": inp["to"], "contact_id": inp.get("contact_id")},
                headers={
                    "X-AI-Service-Secret": AI_SERVICE_SECRET,
                    "X-Agent-ID": agent_id,
                },
                timeout=15.0,
            )
            if resp.status_code >= 400:
                return {"error": f"Failed to initiate call: {resp.text}"}
            return resp.json()
    except Exception as e:
        return {"error": f"Call initiation failed: {str(e)}"}


# ---------------------------------------------------------------------------
# Workflow trigger hooks (fire-and-forget)
# ---------------------------------------------------------------------------

_TOOL_TO_TRIGGER = {
    "create_contact": "contact_created",
    "log_activity": "activity_logged",
    "update_deal": "deal_stage_changed",
    "send_sms": "sms_sent",
    "initiate_call": "call_initiated",
    "send_email": "email_sent",
}


def _schedule_workflow_trigger(
    tool_name: str, agent_id: str, inp: dict, result: dict
) -> None:
    """Fire matching workflows in a background task after a write tool executes."""
    trigger_type = _TOOL_TO_TRIGGER.get(tool_name)
    if not trigger_type:
        return
    trigger_data = {**inp, **{k: v for k, v in result.items() if isinstance(v, (str, int, float, bool, type(None)))}}
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_trigger_workflows_async(trigger_type, agent_id, trigger_data))
    except RuntimeError:
        pass


async def _trigger_workflows_async(
    trigger_type: str, agent_id: str, trigger_data: dict
) -> None:
    try:
        from app.services.workflow_engine import trigger_workflows
        await run_query(lambda: trigger_workflows(trigger_type, agent_id, trigger_data))
    except Exception as e:
        logger.warning("Workflow trigger failed for %s: %s", trigger_type, e)


# ---------------------------------------------------------------------------
# Write tool: queue for confirmation
# ---------------------------------------------------------------------------

def queue_write_tool(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    pending_id = str(uuid.uuid4())
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO pending_actions (id, agent_id, tool, input)
               VALUES (%s, %s, %s, %s)""",
            (pending_id, agent_id, tool_name, json.dumps(tool_input)),
        )
    return {
        "confirmation_required": True,
        "tool": tool_name,
        "preview": tool_input,
        "pending_id": pending_id,
    }


def cleanup_expired_actions() -> int:
    """Delete expired pending actions. Returns count deleted."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM pending_actions WHERE expires_at < NOW()")
        return cur.rowcount


# ---------------------------------------------------------------------------
# Write tool dispatch (shared by execute_write_tool and auto-execute path)
# ---------------------------------------------------------------------------

async def _dispatch_write_tool(tool_name: str, tool_input: dict, agent_id: str) -> dict:
    """Dispatch a write tool to its handler. Returns the tool result dict."""
    if tool_name == "create_contact":
        return await run_query(lambda: _create_contact(agent_id, tool_input))
    elif tool_name == "update_contact":
        return await run_query(lambda: _update_contact(agent_id, tool_input))
    elif tool_name == "delete_contact":
        return await run_query(lambda: _delete_contact(agent_id, tool_input))
    elif tool_name == "log_activity":
        return await run_query(lambda: _log_activity(agent_id, tool_input))
    elif tool_name == "create_deal":
        return await run_query(lambda: _create_deal(agent_id, tool_input))
    elif tool_name == "update_deal":
        return await run_query(lambda: _update_deal(agent_id, tool_input))
    elif tool_name == "delete_deal":
        return await run_query(lambda: _delete_deal(agent_id, tool_input))
    elif tool_name == "create_buyer_profile":
        return await run_query(lambda: _create_buyer_profile(agent_id, tool_input))
    elif tool_name == "update_buyer_profile":
        return await run_query(lambda: _update_buyer_profile(agent_id, tool_input))
    elif tool_name == "create_task":
        return await run_query(lambda: _create_task(agent_id, tool_input))
    elif tool_name == "complete_task":
        return await run_query(lambda: _complete_task(agent_id, tool_input))
    elif tool_name == "reschedule_task":
        return await run_query(lambda: _reschedule_task(agent_id, tool_input))
    elif tool_name == "create_property":
        return await run_query(lambda: _create_property(agent_id, tool_input))
    elif tool_name == "update_property":
        return await run_query(lambda: _update_property(agent_id, tool_input))
    elif tool_name == "delete_property":
        return await run_query(lambda: _delete_property(agent_id, tool_input))
    elif tool_name == "send_sms":
        return await _send_sms_via_backend(agent_id, tool_input)
    elif tool_name == "initiate_call":
        return await _initiate_call_via_backend(agent_id, tool_input)
    elif tool_name == "send_email":
        # Proxy to Go backend — this is an HTTP call, not a DB query.
        # Flow: AI Service → Go Backend → Gmail API (two-hop proxy,
        # avoids duplicating OAuth/token-refresh logic in Python).
        return await _proxy_to_backend("POST", "/api/gmail/send", agent_id, tool_input)
    else:
        return {"error": f"Unknown write tool: {tool_name}"}


# ---------------------------------------------------------------------------
# Write tool executor (called from /ai/confirm)
# ---------------------------------------------------------------------------

async def execute_write_tool(pending_id: str, agent_id: str) -> dict:
    # Fetch and delete the pending action atomically, verifying agent ownership
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """DELETE FROM pending_actions
               WHERE id = %s AND agent_id = %s AND expires_at >= NOW()
               RETURNING tool, input, agent_id""",
            (pending_id, agent_id),
        )
        action = cur.fetchone()
    if not action:
        return {"error": "Pending action not found, expired, or already executed"}
    action = dict(action)
    # input is stored as JSONB, psycopg2 returns it as dict already
    if isinstance(action["input"], str):
        action["input"] = json.loads(action["input"])

    tool_name = action["tool"]
    inp = action["input"]
    agent_id = action["agent_id"]

    result = await _dispatch_write_tool(tool_name, inp, agent_id)

    # Fire workflow triggers (fire-and-forget)
    if result and "error" not in result:
        _schedule_workflow_trigger(tool_name, agent_id, inp, result)

    return result


def _create_contact(agent_id: str, inp: dict) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """INSERT INTO contacts (agent_id, first_name, last_name, email, phone, source)
               VALUES (%s, %s, %s, %s, %s, %s)
               RETURNING id, first_name, last_name, email, phone, source, created_at""",
            (agent_id, inp["first_name"], inp["last_name"],
             inp.get("email"), inp.get("phone"), inp.get("source")),
        )
        contact = dict(cur.fetchone())

        # Auto-create a deal in "Lead" stage for every new contact
        deal_title = f"{inp['first_name']} {inp['last_name']}"
        cur.execute(
            """INSERT INTO deals (contact_id, agent_id, stage_id, title)
               SELECT %s, %s, id, %s
               FROM deal_stages WHERE LOWER(name) = 'lead' LIMIT 1
               RETURNING id""",
            (contact["id"], agent_id, deal_title),
        )
        deal_row = cur.fetchone()
        if deal_row:
            contact["deal_id"] = deal_row["id"]
            contact["pipeline_stage"] = "Lead"

        _schedule_embed("contact", str(contact["id"]), agent_id)
        return contact


_CONTACT_FIELDS = {"first_name", "last_name", "email", "phone", "source"}

def _update_contact(agent_id: str, inp: dict) -> dict:
    inp = dict(inp)  # copy to avoid mutating pending_actions
    contact_id = inp.pop("contact_id")
    # Only allow known contact fields
    inp = {k: v for k, v in inp.items() if k in _CONTACT_FIELDS}
    if not inp:
        return {"error": "No fields to update"}
    select_cols = ", ".join(inp.keys())
    fields = ", ".join(f"{k} = %s" for k in inp)
    vals = list(inp.values()) + [contact_id, agent_id]
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            f"SELECT {select_cols} FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        prev_row = cur.fetchone()
        if not prev_row:
            return {"error": "Contact not found"}
        previous = dict(prev_row)
        cur.execute(
            f"UPDATE contacts SET {fields} WHERE id = %s AND agent_id = %s RETURNING id",
            vals,
        )
        row = cur.fetchone()
        if row:
            _schedule_embed("contact", contact_id, agent_id)
        return {"updated": True, "contact_id": contact_id, "previous": previous, "new": {k: inp[k] for k in inp}}


def _log_activity(agent_id: str, inp: dict) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """INSERT INTO activities (agent_id, contact_id, type, body)
               VALUES (%s, %s, %s, %s)
               RETURNING id, type, body, created_at""",
            (agent_id, inp["contact_id"], inp["type"], inp["body"]),
        )
        result = dict(cur.fetchone())
        _schedule_embed("activity", str(result["id"]), agent_id)
        return result


def _create_deal(agent_id: str, inp: dict) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        stage_name = inp.get("stage_name", "Lead")
        cur.execute("SELECT id FROM deal_stages WHERE name = %s", (stage_name,))
        stage_row = cur.fetchone()
        if not stage_row:
            return {"error": f"Stage '{stage_name}' not found"}
        cur.execute(
            """INSERT INTO deals (agent_id, contact_id, stage_id, title, value, notes)
               VALUES (%s, %s, %s, %s, %s, %s)
               RETURNING id, title, value, created_at""",
            (agent_id, inp["contact_id"], stage_row["id"],
             inp["title"], inp.get("value"), inp.get("notes")),
        )
        return dict(cur.fetchone())


_DEAL_FIELDS = {"stage_id", "title", "value", "notes"}

def _update_deal(agent_id: str, inp: dict) -> dict:
    inp = dict(inp)  # copy to avoid mutating pending_actions
    deal_id = inp.pop("deal_id")
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if "stage_name" in inp:
            stage_name = inp.pop("stage_name")
            cur.execute("SELECT id FROM deal_stages WHERE name = %s", (stage_name,))
            row = cur.fetchone()
            if row:
                inp["stage_id"] = str(row["id"])
        # Only allow known deal fields
        inp = {k: v for k, v in inp.items() if k in _DEAL_FIELDS}
        if not inp:
            return {"error": "No fields to update"}
        select_cols = ", ".join(inp.keys())
        cur.execute(
            f"SELECT {select_cols} FROM deals WHERE id = %s AND agent_id = %s",
            (deal_id, agent_id),
        )
        prev_row = cur.fetchone()
        if not prev_row:
            return {"error": "Deal not found"}
        previous = dict(prev_row)
        fields = ", ".join(f"{k} = %s" for k in inp)
        vals = list(inp.values()) + [deal_id, agent_id]
        cur.execute(
            f"UPDATE deals SET {fields} WHERE id = %s AND agent_id = %s RETURNING id",
            vals,
        )
        row = cur.fetchone()
        return {"updated": True, "deal_id": deal_id, "previous": previous, "new": {k: inp[k] for k in inp}}


def _delete_contact(agent_id: str, inp: dict) -> dict:
    contact_id = inp["contact_id"]
    with get_conn() as conn:
        conn.autocommit = False
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            # Get contact name before deleting for confirmation message
            cur.execute(
                "SELECT first_name, last_name FROM contacts WHERE id = %s AND agent_id = %s",
                (contact_id, agent_id),
            )
            contact = cur.fetchone()
            if not contact:
                conn.rollback()
                return {"error": "Contact not found"}
            # Cascade: delete activities, deals, buyer_profile, ai_profile, then contact
            cur.execute("DELETE FROM activities WHERE contact_id = %s AND agent_id = %s", (contact_id, agent_id))
            cur.execute("DELETE FROM deals WHERE contact_id = %s AND agent_id = %s", (contact_id, agent_id))
            cur.execute("DELETE FROM buyer_profiles WHERE contact_id = %s", (contact_id,))
            cur.execute("DELETE FROM ai_profiles WHERE contact_id = %s", (contact_id,))
            cur.execute("DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_id = %s AND agent_id = %s)", (contact_id, agent_id))
            cur.execute("DELETE FROM conversations WHERE contact_id = %s AND agent_id = %s", (contact_id, agent_id))
            cur.execute("DELETE FROM contacts WHERE id = %s AND agent_id = %s", (contact_id, agent_id))
            conn.commit()
            return {"deleted": True, "contact": f"{contact['first_name']} {contact['last_name']}"}
        except Exception:
            conn.rollback()
            raise


def _delete_deal(agent_id: str, inp: dict) -> dict:
    deal_id = inp["deal_id"]
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT d.title FROM deals d WHERE d.id = %s AND d.agent_id = %s",
            (deal_id, agent_id),
        )
        deal = cur.fetchone()
        if not deal:
            return {"error": "Deal not found"}
        cur.execute("DELETE FROM deals WHERE id = %s AND agent_id = %s", (deal_id, agent_id))
        return {"deleted": True, "deal": deal["title"]}


def _create_buyer_profile(agent_id: str, inp: dict) -> dict:
    inp = dict(inp)  # copy to avoid mutating pending_actions
    contact_id = inp.pop("contact_id")
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # Verify contact belongs to agent
        cur.execute("SELECT id FROM contacts WHERE id = %s AND agent_id = %s", (contact_id, agent_id))
        if not cur.fetchone():
            return {"error": "Contact not found"}
        # Check if profile already exists
        cur.execute("SELECT id FROM buyer_profiles WHERE contact_id = %s", (contact_id,))
        if cur.fetchone():
            return {"error": "Buyer profile already exists for this contact. Use update_buyer_profile instead."}
        cur.execute(
            """INSERT INTO buyer_profiles (contact_id, budget_min, budget_max, bedrooms, bathrooms,
                   locations, must_haves, deal_breakers, property_type, pre_approved, timeline, notes)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING id, contact_id, budget_min, budget_max, bedrooms, bathrooms, property_type, pre_approved, timeline""",
            (contact_id, inp.get("budget_min"), inp.get("budget_max"),
             inp.get("bedrooms"), inp.get("bathrooms"),
             inp.get("locations"), inp.get("must_haves"), inp.get("deal_breakers"),
             inp.get("property_type"), inp.get("pre_approved", False),
             inp.get("timeline"), inp.get("notes")),
        )
        return dict(cur.fetchone())


_BUYER_PROFILE_FIELDS = {
    "budget_min", "budget_max", "bedrooms", "bathrooms", "locations",
    "must_haves", "deal_breakers", "property_type", "pre_approved", "timeline", "notes",
}

def _update_buyer_profile(agent_id: str, inp: dict) -> dict:
    inp = dict(inp)  # copy to avoid mutating pending_actions
    contact_id = inp.pop("contact_id")
    # Only allow known buyer profile fields
    inp = {k: v for k, v in inp.items() if k in _BUYER_PROFILE_FIELDS}
    if not inp:
        return {"error": "No fields to update"}
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # Verify contact belongs to agent
        cur.execute("SELECT id FROM contacts WHERE id = %s AND agent_id = %s", (contact_id, agent_id))
        if not cur.fetchone():
            return {"error": "Contact not found"}
        select_cols = ", ".join(inp.keys())
        cur.execute(
            f"SELECT {select_cols} FROM buyer_profiles WHERE contact_id = %s",
            (contact_id,),
        )
        prev_row = cur.fetchone()
        if not prev_row:
            return {"error": "No buyer profile exists for this contact. Use create_buyer_profile first."}
        previous = dict(prev_row)
        fields = ", ".join(f"{k} = %s" for k in inp)
        vals = list(inp.values()) + [contact_id]
        cur.execute(
            f"UPDATE buyer_profiles SET {fields} WHERE contact_id = %s RETURNING id",
            vals,
        )
        return {"updated": True, "contact_id": contact_id, "previous": previous, "new": {k: inp[k] for k in inp}}


def _semantic_search(agent_id: str, inp: dict) -> list:
    try:
        from app.services.embeddings import semantic_search
        return semantic_search(inp["query"], agent_id, inp.get("limit", 10))
    except Exception as e:
        return [{"error": str(e)}]


def _search_documents(agent_id: str, inp: dict) -> dict:
    """Hybrid semantic + keyword search across uploaded documents."""
    try:
        from app.services.document_search import hybrid_search, determine_k, refine_results_by_score_gap

        query = inp["query"]
        document_id = inp.get("document_id")
        contact_id = inp.get("contact_id")
        k = determine_k(query)

        raw_results = hybrid_search(query, agent_id, k, document_id, contact_id)
        results = refine_results_by_score_gap(raw_results, k)

        formatted = []
        for r in results:
            formatted.append({
                "chunk_id": r["chunk_id"],
                "document_id": r["document_id"],
                "filename": r["filename"],
                "page_number": r.get("page_number"),
                "section_heading": r.get("section_heading"),
                "content": r["content"],
                "score": round(r["rrf_score"], 4),
            })

        return {
            "results": formatted,
            "total_found": len(formatted),
            "query": query,
            "k_used": k,
        }
    except Exception as e:
        logger.exception("search_documents tool error")
        return {"error": str(e), "results": []}


def _list_documents(agent_id: str, inp: dict) -> list:
    """List all documents for the agent, optionally filtered by contact."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        contact_id = inp.get("contact_id")
        if contact_id:
            cur.execute(
                """SELECT id, filename, file_type, file_size, status, page_count, chunk_count, created_at
                   FROM documents WHERE agent_id = %s AND contact_id = %s AND status = 'ready'
                   ORDER BY created_at DESC""",
                (agent_id, contact_id),
            )
        else:
            cur.execute(
                """SELECT id, filename, file_type, file_size, status, page_count, chunk_count, created_at
                   FROM documents WHERE agent_id = %s AND status = 'ready'
                   ORDER BY created_at DESC""",
                (agent_id,),
            )
        return [dict(r) for r in cur.fetchall()]


def _get_overdue_tasks(agent_id: str, limit: int) -> list:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT a.id, a.body, a.due_date, a.priority, a.created_at,
                      c.first_name || ' ' || c.last_name AS contact_name
               FROM activities a
               LEFT JOIN contacts c ON c.id = a.contact_id
               WHERE a.agent_id = %s AND a.type = 'task'
                 AND a.due_date < CURRENT_DATE AND a.completed_at IS NULL
               ORDER BY a.due_date ASC
               LIMIT %s""",
            (agent_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]


def _search_properties(agent_id: str, inp: dict) -> list:
    query = inp.get("query", "")
    status = inp.get("status")
    property_type = inp.get("property_type")
    min_price = inp.get("min_price")
    max_price = inp.get("max_price")
    bedrooms = inp.get("bedrooms")
    limit = inp.get("limit", 10)

    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        params: list = [agent_id]
        where_clauses = ["agent_id = %s"]

        if query:
            params.append(f"%{query}%")
            params.append(f"%{query}%")
            where_clauses.append("(address ILIKE %s OR mls_id ILIKE %s)")
        if status:
            params.append(status)
            where_clauses.append("status = %s")
        if property_type:
            params.append(property_type)
            where_clauses.append("property_type = %s")
        if min_price is not None:
            params.append(min_price)
            where_clauses.append("price >= %s")
        if max_price is not None:
            params.append(max_price)
            where_clauses.append("price <= %s")
        if bedrooms is not None:
            params.append(bedrooms)
            where_clauses.append("bedrooms >= %s")

        params.append(limit)
        sql = f"""
            SELECT id, address, city, state, zip, price, bedrooms, bathrooms,
                   sqft, property_type, status, listing_type, mls_id, created_at
            FROM properties
            WHERE {' AND '.join(where_clauses)}
            ORDER BY created_at DESC LIMIT %s
        """
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]


def _get_property(agent_id: str, property_id: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT * FROM properties WHERE id = %s AND agent_id = %s",
            (property_id, agent_id),
        )
        prop = cur.fetchone()
        if not prop:
            return {"error": "Property not found"}
        cur.execute(
            """SELECT d.id, d.title, d.value,
                      s.name AS stage_name,
                      c.first_name || ' ' || c.last_name AS contact_name
               FROM deals d
               JOIN deal_stages s ON s.id = d.stage_id
               JOIN contacts c ON c.id = d.contact_id
               WHERE d.property_id = %s AND d.agent_id = %s""",
            (property_id, agent_id),
        )
        deals = [dict(r) for r in cur.fetchall()]
        result = dict(prop)
        result["linked_deals"] = deals
        return result


def _match_buyer_to_properties(agent_id: str, contact_id: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id FROM contacts WHERE id = %s AND agent_id = %s",
            (contact_id, agent_id),
        )
        if not cur.fetchone():
            return {"error": "Contact not found"}
        cur.execute("SELECT * FROM buyer_profiles WHERE contact_id = %s", (contact_id,))
        bp = cur.fetchone()
        if not bp:
            return {"error": "No buyer profile exists for this contact"}
        bp = dict(bp)
        cur.execute(
            """SELECT id, address, city, state, zip, price, bedrooms, bathrooms,
                      sqft, property_type, status, listing_type
               FROM properties
               WHERE agent_id = %s AND status = 'active'""",
            (agent_id,),
        )
        properties = [dict(r) for r in cur.fetchall()]
        matches = []
        for prop in properties:
            score = 0
            if bp.get("budget_min") is not None and bp.get("budget_max") is not None and prop.get("price") is not None:
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


def _create_task(agent_id: str, inp: dict) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """INSERT INTO activities (agent_id, contact_id, type, body, due_date, priority)
               VALUES (%s, %s, 'task', %s, %s, %s)
               RETURNING id, body, due_date, priority, created_at""",
            (agent_id, inp.get("contact_id"), inp["body"],
             inp["due_date"], inp.get("priority", "medium")),
        )
        return dict(cur.fetchone())


def _complete_task(agent_id: str, inp: dict) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """UPDATE activities SET completed_at = NOW()
               WHERE id = %s AND agent_id = %s AND type = 'task'
               RETURNING id, body, completed_at""",
            (inp["task_id"], agent_id),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "Task not found"}
        return dict(row)


def _reschedule_task(agent_id: str, inp: dict) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """UPDATE activities SET due_date = %s
               WHERE id = %s AND agent_id = %s AND type = 'task'
               RETURNING id, body, due_date""",
            (inp["new_due_date"], inp["task_id"], agent_id),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "Task not found"}
        return dict(row)


_PROPERTY_FIELDS = {
    "address", "city", "state", "zip", "price", "bedrooms", "bathrooms",
    "sqft", "property_type", "status", "listing_type", "mls_id",
    "description", "year_built", "lot_size",
}


def _create_property(agent_id: str, inp: dict) -> dict:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """INSERT INTO properties (agent_id, address, city, state, zip, price, bedrooms, bathrooms,
                   sqft, property_type, status, listing_type, mls_id, description, year_built, lot_size)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING id, address, city, state, price, bedrooms, bathrooms, sqft, property_type, status, created_at""",
            (agent_id, inp["address"], inp.get("city"), inp.get("state"), inp.get("zip"),
             inp.get("price"), inp.get("bedrooms"), inp.get("bathrooms"), inp.get("sqft"),
             inp.get("property_type"), inp.get("status", "active"), inp.get("listing_type"),
             inp.get("mls_id"), inp.get("description"), inp.get("year_built"), inp.get("lot_size")),
        )
        return dict(cur.fetchone())


def _update_property(agent_id: str, inp: dict) -> dict:
    inp = dict(inp)
    property_id = inp.pop("property_id")
    inp = {k: v for k, v in inp.items() if k in _PROPERTY_FIELDS}
    if not inp:
        return {"error": "No fields to update"}
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        select_cols = ", ".join(inp.keys())
        cur.execute(
            f"SELECT {select_cols}, address FROM properties WHERE id = %s AND agent_id = %s",
            (property_id, agent_id),
        )
        prev_row = cur.fetchone()
        if not prev_row:
            return {"error": "Property not found"}
        address = prev_row["address"]
        previous = {k: prev_row[k] for k in inp.keys()}
        fields = ", ".join(f"{k} = %s" for k in inp)
        vals = list(inp.values()) + [property_id, agent_id]
        cur.execute(
            f"UPDATE properties SET {fields} WHERE id = %s AND agent_id = %s RETURNING id, address",
            vals,
        )
        row = cur.fetchone()
        return {"updated": True, "property_id": property_id, "address": row["address"], "previous": previous, "new": {k: inp[k] for k in inp}}


def _delete_property(agent_id: str, inp: dict) -> dict:
    property_id = inp["property_id"]
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT address FROM properties WHERE id = %s AND agent_id = %s",
            (property_id, agent_id),
        )
        prop = cur.fetchone()
        if not prop:
            return {"error": "Property not found"}
        cur.execute("DELETE FROM properties WHERE id = %s AND agent_id = %s", (property_id, agent_id))
        return {"deleted": True, "property": prop["address"]}


# ---------------------------------------------------------------------------
# Proxy helper: AI Service → Go Backend (for tools that need Go's APIs)
# ---------------------------------------------------------------------------

async def _proxy_to_backend(method: str, path: str, agent_id: str, payload: dict) -> dict:
    """Call the Go backend on behalf of an agent. Used by send_email to
    proxy through Go's Gmail API integration (avoids duplicating OAuth logic)."""
    url = f"{BACKEND_URL}{path}"
    headers = {
        "X-AI-Service-Secret": AI_SERVICE_SECRET,
        "X-Agent-ID": agent_id,
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.request(method, url, json=payload, headers=headers)
        if resp.status_code == 200 or resp.status_code == 201:
            return resp.json()
        # Surface Go backend errors as structured tool results
        try:
            body = resp.json()
            error_msg = body.get("error", resp.text)
        except Exception:
            error_msg = resp.text
        if resp.status_code == 429:
            return {"error": f"Gmail rate limit — try again later. ({error_msg})"}
        if resp.status_code == 401:
            return {"error": "Email service authentication failed. Check AI_SERVICE_SECRET config."}
        return {"error": f"Email service error ({resp.status_code}): {error_msg}"}
    except httpx.ConnectError:
        return {"error": "Email service unavailable — Go backend is not reachable."}
    except httpx.TimeoutException:
        return {"error": "Email service timed out — try again."}
    except Exception as e:
        logger.error("Proxy to backend failed: %s", e)
        return {"error": f"Email service error: {str(e)}"}


# ---------------------------------------------------------------------------
# Gmail / Email tool handlers
# ---------------------------------------------------------------------------

def _search_emails(agent_id: str, inp: dict) -> list:
    query = inp.get("query", "")
    contact_id = inp.get("contact_id")
    contacts_only = inp.get("contacts_only", False)
    limit = inp.get("limit", 50 if contacts_only else 10)

    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        params: list = [agent_id]
        where_clauses = ["e.agent_id = %s"]

        if contacts_only:
            where_clauses.append("e.contact_id IS NOT NULL")
        if query:
            params.extend([f"%{query}%"] * 3)
            where_clauses.append(
                "(e.subject ILIKE %s OR e.from_name ILIKE %s OR e.snippet ILIKE %s)"
            )
        if contact_id:
            params.append(contact_id)
            where_clauses.append("e.contact_id = %s")

        params.append(limit)
        sql = f"""
            SELECT e.id, e.thread_id, e.subject, e.snippet, e.from_name, e.from_address,
                   e.to_addresses, e.is_read, e.is_outbound, e.labels, e.gmail_date,
                   e.contact_id,
                   CASE WHEN c.id IS NOT NULL THEN c.first_name || ' ' || c.last_name ELSE NULL END AS contact_name
            FROM emails e
            LEFT JOIN contacts c ON c.id = e.contact_id
            WHERE {' AND '.join(where_clauses)}
            ORDER BY e.gmail_date DESC LIMIT %s
        """
        cur.execute(sql, params)
        results = [dict(r) for r in cur.fetchall()]
        return results


def _get_email_thread(agent_id: str, thread_id: str, limit: int) -> list:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT id, subject, snippet, from_name, from_address,
                      to_addresses, cc_addresses, body_text, is_read,
                      is_outbound, gmail_date
               FROM emails
               WHERE agent_id = %s AND thread_id = %s
               ORDER BY gmail_date ASC LIMIT %s""",
            (agent_id, thread_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]


async def _draft_email(agent_id: str, inp: dict) -> dict:
    """Generate an email draft using Claude. Returns structured fields for
    the frontend compose modal — does NOT send anything."""
    to = inp.get("to", "")
    subject = inp.get("subject", "")
    context = inp.get("context", "")
    contact_id = inp.get("contact_id")

    # Gather contact context if available
    contact_info = ""
    if contact_id:
        contact_data = await run_query(lambda: _get_contact_details(agent_id, contact_id))
        if isinstance(contact_data, dict) and "error" not in contact_data:
            name = f"{contact_data.get('first_name', '')} {contact_data.get('last_name', '')}".strip()
            contact_info = f"\nRecipient: {name} ({contact_data.get('email', to)})"

    # Get agent name for signature
    agent_name = "Agent"
    try:
        def _get_agent_name():
            with get_conn() as conn:
                cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                cur.execute("SELECT name FROM users WHERE id = %s", (agent_id,))
                row = cur.fetchone()
                return row["name"] if row else "Agent"
        agent_name = await run_query(_get_agent_name)
    except Exception:
        pass

    import anthropic
    from app.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    prompt = (
        f"Write a professional, friendly email for a real estate agent named {agent_name}.\n"
        f"To: {to}{contact_info}\n"
        f"Subject suggestion: {subject or '(generate an appropriate subject)'}\n"
        f"Context: {context}\n\n"
        "Return ONLY a JSON object with exactly these fields:\n"
        '{"subject": "...", "body": "..."}\n'
        "The body should be plain text, professional but warm. Include a sign-off with the agent's name. "
        "Do NOT include any markdown, code fences, or explanation — just the JSON."
    )

    try:
        response = await client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        # Parse the JSON response
        draft = json.loads(text)
        return {
            "draft": True,
            "to": to,
            "subject": draft.get("subject", subject or ""),
            "body": draft.get("body", ""),
        }
    except json.JSONDecodeError:
        # If Claude didn't return valid JSON, use the raw text as the body
        return {
            "draft": True,
            "to": to,
            "subject": subject or "",
            "body": text if 'text' in dir() else "Failed to generate draft.",
        }
    except Exception as e:
        logger.error("Draft email generation failed: %s", e)
        return {"error": f"Failed to generate email draft: {str(e)}"}


def check_gmail_status(agent_id: str) -> dict:
    """Check if Gmail is connected for this agent. Used by agent.py for system prompt."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT gmail_address, last_synced_at FROM gmail_tokens WHERE agent_id = %s",
            (agent_id,),
        )
        row = cur.fetchone()
        if row:
            return {
                "connected": True,
                "gmail_address": row["gmail_address"],
                "last_synced_at": row["last_synced_at"],
            }
        return {"connected": False}


def get_recent_emails_for_contact(contact_id: str, agent_id: str, limit: int = 5) -> list:
    """Get recent emails for a contact. Used by agent.py for contact-scoped context."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT subject, snippet, from_name, is_outbound, gmail_date
               FROM emails
               WHERE contact_id = %s AND agent_id = %s
               ORDER BY gmail_date DESC LIMIT %s""",
            (contact_id, agent_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]
