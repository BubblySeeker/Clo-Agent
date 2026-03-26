# AI Tool Expansion Plan

Expand the AI service tool set to cover all backend API endpoints. Organized by user impact, each phase adds a themed batch of tools following the existing module pattern in `ai-service/app/tools/`.

## Current State (52 tools)

| Module | READ | AUTO | WRITE | Total |
|--------|------|------|-------|-------|
| contacts.py | 5 | 1 | 5 | 11 |
| deals.py | 4 | 0 | 3 | 7 |
| emails.py | 4 | 0 | 1 | 5 |
| activities.py | 1 | 1 | 2 | 4 |
| tasks.py | 2 | 2 | 1 | 5 |
| properties.py | 4 | 0 | 3 | 7 |
| documents.py | 2 | 1 | 1 | 4 |
| folders.py | 2 | 1 | 2 | 5 |
| leads.py | 1 | 1 | 1 | 3 |
| search.py | 2 | 0 | 0 | 2 |
| automations.py | 2 | 1 | 3 | 6 |
| analytics.py | 1 | 0 | 0 | 1 |
| workflows.py | 0 | 0 | 0 | 0 (helper only) |
| **Total** | **31** | **8** | **22** | **62** |

---

## Completed Phases

### Phase 1: Prompt & Tool Infrastructure — DONE

Rebuilt `prompt_builder.py`, tool registry (`__init__.py`), and modular domain files. Established the DEFINITIONS/READ/AUTO_EXECUTE/WRITE/dispatch pattern used by all modules.

### Phase 2: Core Gaps — DONE

- `list_tasks` with full filtering (status, contact, priority) in `tasks.py`
- `update_activity` / `delete_activity` in `activities.py`
- `get_gmail_status` in `emails.py`

### Phase 3: Organization — DONE

- `folders.py` (5 tools): list/create contact folders, move contacts, list/create document folders
- `documents.py` (+2 tools): update_document, delete_document

### Phase 4: Lead Suggestions — DONE

- `leads.py` (3 tools): list_lead_suggestions, accept_lead_suggestion, dismiss_lead_suggestion
- Dedup check on accept, auto-create Lead deal

---

## Full Backend Gap Analysis

Every backend route (`backend/cmd/api/main.go`) vs existing AI tools:

| Backend Endpoint | AI Tool | Status |
|-----------------|---------|--------|
| **Workflows** | | |
| `GET /api/workflows` | — | **MISSING** |
| `POST /api/workflows` | — | **MISSING** |
| `GET /api/workflows/{id}` | — | **MISSING** (covered by list) |
| `PATCH /api/workflows/{id}` | — | **MISSING** |
| `DELETE /api/workflows/{id}` | — | **MISSING** |
| `POST /api/workflows/{id}/toggle` | — | **MISSING** |
| `GET /api/workflows/{id}/runs` | — | **MISSING** |
| **Analytics** | | |
| `GET /api/analytics/pipeline` | — | **MISSING** |
| `GET /api/analytics/activities` | — | **MISSING** |
| `GET /api/analytics/contacts` | — | **MISSING** |
| **Portal** | | |
| `POST /api/portal/invite/{contact_id}` | — | **MISSING** |
| `GET /api/portal/invites` | — | **MISSING** |
| `DELETE /api/portal/invite/{token_id}` | — | **MISSING** |
| `GET /api/portal/settings` | — | **MISSING** |
| `PATCH /api/portal/settings` | — | **MISSING** |
| **Gmail** | | |
| `POST /api/gmail/forward` | — | **MISSING** |
| `PATCH /api/gmail/emails/{id}/read` | — | **MISSING** |
| **AI Profile** | | |
| `GET /api/contacts/{id}/ai-profile` | — | **MISSING** |
| `POST /api/contacts/{id}/ai-profile/regenerate` | — | **MISSING** |
| **Properties** | | |
| `GET /api/properties/{id}/matches` | — | **MISSING** (only buyer→property exists) |
| **Folders** | | |
| `PATCH /api/contact-folders/{id}` | — | **MISSING** (rename) |
| `DELETE /api/contact-folders/{id}` | — | **MISSING** |
| `DELETE /api/contact-folders/{id}/contacts` | — | **MISSING** (remove from folder) |
| `PATCH /api/document-folders/{id}` | — | **MISSING** (rename) |
| `DELETE /api/document-folders/{id}` | — | **MISSING** |
| **Already covered** | | |
| Contacts CRUD | ✅ 9 tools | |
| Deals CRUD + stages | ✅ 7 tools | |
| Properties CRUD + buyer match | ✅ 6 tools | |
| Activities CRUD | ✅ 4 tools | |
| Tasks CRUD | ✅ 5 tools | |
| Emails search/thread/draft/send/status | ✅ 5 tools | |
| Documents search/list/update/delete | ✅ 4 tools | |
| Folders list/create/move | ✅ 5 tools | |
| Lead suggestions | ✅ 3 tools | |
| Search + dashboard | ✅ 2 tools | |

**Total gaps: 25 tools across 7 domains**

---

### Phase 5: Workflows & Automation — DONE

- `automations.py` (6 tools): list_workflows, get_workflow_runs, create_workflow, update_workflow, delete_workflow, toggle_workflow
- Direct DB queries matching backend handler patterns, with last_run_at subquery on list

---

## Phase 6: Communication — DONE

Extends `ai-service/app/tools/emails.py` and adds `ai-service/app/tools/portal.py`.

### Extend: `emails.py` (2 tools)

1. **`forward_email`** (WRITE) — Forward an email to another address.
   - Input: email_id (required), to (required), comment (optional — text to prepend)
   - Backend: `POST /api/gmail/forward` via httpx proxy (same pattern as send_email)

2. **`mark_email_read`** (AUTO_EXECUTE) — Mark an email as read.
   - Input: email_id (required)
   - Backend: `PATCH /api/gmail/emails/{id}/read` via httpx proxy
   - Note: goes through backend (not direct DB) because backend syncs read status with Gmail API

### New file: `portal.py` (2 tools)

3. **`list_portal_invites`** (READ) — List active portal invites with contact names.
   - Input: none
   - Query: `SELECT pt.id, pt.token, pt.expires_at, pt.last_used_at, c.first_name, c.last_name FROM portal_tokens pt JOIN contacts c ON c.id = pt.contact_id WHERE pt.agent_id = %s ORDER BY pt.expires_at DESC`

4. **`create_portal_invite`** (WRITE) — Generate a portal link for a contact.
   - Input: contact_id (required)
   - Insert into portal_tokens with generated UUID token and 30-day expiry
   - Return the token URL

Register portal.py in `__init__.py`.

---

## Phase 7: Intelligence & Matching — DONE

- `contacts.py` (+2 tools): get_ai_profile (READ), regenerate_ai_profile (AUTO_EXECUTE via httpx proxy)
- `properties.py` (+1 tool): match_property_to_buyers (READ via httpx proxy)
- `analytics.py` (1 tool): get_analytics with type param for pipeline/activities/contacts (READ via httpx proxy)

---

## Phase 8: Folder Polish — DONE

Extends `ai-service/app/tools/folders.py`.

1. **`rename_contact_folder`** (AUTO_EXECUTE) — Rename a contact folder.
   - Input: folder_id (required), name (required)
   - Query: `UPDATE contact_folders SET name = %s WHERE id = %s AND agent_id = %s`
   - Handle unique constraint

2. **`delete_contact_folder`** (WRITE) — Delete a contact folder.
   - Input: folder_id (required)
   - Nullify contacts' folder_id first, then DELETE. Return folder name + count of unfoldered contacts.

3. **`remove_contacts_from_folder`** (AUTO_EXECUTE) — Remove contacts from their folder without deleting the folder.
   - Input: contact_ids (array, required)
   - Query: `UPDATE contacts SET folder_id = NULL WHERE id = ANY(%s) AND agent_id = %s`

4. **`rename_document_folder`** (AUTO_EXECUTE) — Rename a document folder.
   - Input: folder_id (required), name (required)
   - Same pattern as contact folder rename

5. **`delete_document_folder`** (WRITE) — Delete a document folder.
   - Input: folder_id (required)
   - Nullify documents' folder_id first, then DELETE

---

## Phase 9: Portal Settings & Cleanup — DONE

### Extend: `portal.py` (2 tools)

1. **`revoke_portal_invite`** (AUTO_EXECUTE) — Revoke a portal invite.
   - Input: invite_id (required)
   - Query: `DELETE FROM portal_tokens WHERE id = %s AND agent_id = %s`

2. **`update_portal_settings`** (WRITE) — Update portal display settings.
   - Input: show_deal_value (bool), show_activities (bool), show_properties (bool), welcome_message (string), agent_phone (string), agent_email (string) — all optional
   - Dynamic UPDATE on portal_settings

---

## Summary

| Phase | Theme | Tools | Status |
|-------|-------|-------|--------|
| 1 | Infrastructure | — | ✅ DONE |
| 2 | Core Gaps | 4 | ✅ DONE |
| 3 | Organization | 7 | ✅ DONE |
| 4 | Lead Suggestions | 3 | ✅ DONE |
| 5 | Workflows & Automation | 6 | ✅ DONE |
| 6 | Communication | 4 | ✅ DONE |
| 7 | Intelligence & Matching | 4 | ✅ DONE |
| 8 | Folder Polish | 5 | ✅ DONE |
| 9 | Portal Settings | 2 | ✅ DONE |

**Completed: 35 new tools (Phases 2-9) — ALL PHASES DONE**
**Target total: 52 + 21 = 73 tools**

---

## ISSUE-003 Leftover: Confirm Endpoint 404

### Problem

`POST /ai/confirm` returns HTTP 404 for ALL error types. The frontend can't distinguish "pending action expired" from "contact doesn't exist" from "tool execution failed."

### Root Cause

`ai-service/app/routes/chat.py` lines 55-59 route errors by string matching:

```python
if "not found" in msg.lower() or "expired" in msg.lower():
    raise HTTPException(status_code=404, detail=msg)
raise HTTPException(status_code=400, detail=msg)
```

Every error path returns messages containing "not found" or "expired":
- Pending action lookup: `"Pending action not found, expired, or already executed"` → contains BOTH "not found" AND "expired" → 404
- Tool errors: `"Contact not found"`, `"Document not found"`, `"Activity not found"` → all contain "not found" → 404
- Even valid 400 errors get caught by overly broad string matching

### Fix

**File: `ai-service/app/tools/__init__.py`** — Add `error_type` field to error results:

```python
# In execute_write_tool(), change the "not found" return to:
if not action:
    return {"error": "Pending action not found, expired, or already executed", "error_type": "expired"}
```

**File: `ai-service/app/routes/chat.py`** — Use error_type instead of string matching:

```python
@router.post("/confirm", dependencies=[Depends(verify_secret)])
async def confirm_action(req: ConfirmRequest):
    """Execute a pending write tool action after user confirmation."""
    import logging
    logger = logging.getLogger(__name__)
    logger.info("Confirm request: pending_id=%s agent_id=%s", req.pending_id, req.agent_id)
    result = await execute_write_tool(req.pending_id, req.agent_id)
    logger.info("Confirm result: %s", result)
    if "error" in result:
        error_type = result.get("error_type", "")
        if error_type == "expired":
            raise HTTPException(status_code=410, detail=result["error"])  # 410 Gone
        raise HTTPException(status_code=400, detail=result["error"])
    return {"status": "executed", "result": result}
```

Key changes:
1. Expired/consumed pending actions → **410 Gone** (semantically correct: resource existed but is no longer available)
2. Tool execution errors (contact not found, etc.) → **400 Bad Request**
3. No more fragile string matching

### Impact

Frontend can now:
- 410 → Show "This action expired. Please try again." and re-offer the action
- 400 → Show the specific error message from the tool
