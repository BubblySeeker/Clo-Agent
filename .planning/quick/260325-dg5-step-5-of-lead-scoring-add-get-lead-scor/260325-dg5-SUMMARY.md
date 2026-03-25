---
phase: quick
plan: 260325-dg5
subsystem: ai-service
tags: [lead-scoring, ai-tools, read-tools, morning-briefing]
dependency_graph:
  requires: [lead_score column in contacts table, lead_score_signals JSONB column]
  provides: [get_lead_score AI tool, lead score in morning briefings]
  affects: [ai-service/app/tools.py, ai-service/app/services/agent.py]
tech_stack:
  added: []
  patterns: [psycopg2 RealDictCursor read executor, READ_TOOLS set classification]
key_files:
  created: []
  modified:
    - ai-service/app/tools.py
    - ai-service/tests/test_tools.py
    - ai-service/app/services/agent.py
decisions:
  - Tier thresholds: 80+ Hot, 50-79 Warm, 25-49 Cool, <25 Cold (matches scoring engine)
  - Trend values: "new" when no previous_score, "rising"/"falling"/"stable" based on diff
  - Dimension extraction handles both nested dict (score field) and flat int forms from signals JSONB
metrics:
  duration: ~5 minutes
  completed: "2026-03-25T13:46:49Z"
  tasks_completed: 3
  files_modified: 3
---

# Phase quick Plan 260325-dg5: Add get_lead_score AI Tool Summary

**One-liner:** Added `get_lead_score` read tool (#35 overall, #21 read) to AI service with tier/trend/dimension/signal breakdown, plus Lead Score Alerts section in morning briefings.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add get_lead_score tool definition, READ_TOOLS, routing, and _get_lead_score executor | ec76695 | ai-service/app/tools.py |
| 2 | Add 3 tests for get_lead_score to test_tools.py | bd4763e | ai-service/tests/test_tools.py |
| 3 | Update Brief Me system prompt with lead score step and alerts section | 5a8a990 | ai-service/app/services/agent.py |

## What Was Built

### get_lead_score Tool (tools.py)

- Tool definition in TOOL_DEFINITIONS with `contact_id` as required parameter
- Added to READ_TOOLS set (now 21 read tools, 37 tools total)
- Routing branch in `execute_read_tool`
- `_get_lead_score(agent_id, contact_id)` executor:
  - Queries `lead_score`, `lead_score_signals`, `previous_lead_score` from contacts table
  - Returns error if contact not found or no score calculated
  - Computes tier (Hot/Warm/Cool/Cold), trend (new/rising/falling/stable), dimensions breakdown, top 3 signals, suggested action

### Tests (test_tools.py)

3 new tests added to `TestToolDefinitions` class:
- `test_get_lead_score_exists_in_definitions`
- `test_get_lead_score_is_read_tool`
- `test_get_lead_score_requires_contact_id`

All 3 pass. Pre-existing `test_trigger_mapping_values` failure (email_sent trigger) is unrelated and was present before this task.

### Morning Briefing Prompt (agent.py)

- Step 5 added to tool chain: call `get_lead_score` for contacts with deals
- `### Lead Score Alerts` section added to briefing format: Hot scores needing action + falling scores

## Deviations from Plan

None — plan executed exactly as written. The `_get_lead_score` executor follows the plan spec precisely. Dimension extraction includes handling for both nested dict form (with `score` field) and flat int form to be robust against signal structure variations.

## Self-Check: PASSED

- ai-service/app/tools.py: FOUND (get_lead_score in TOOL_DEFINITIONS and READ_TOOLS verified)
- ai-service/tests/test_tools.py: FOUND (3 new tests pass)
- ai-service/app/services/agent.py: FOUND (get_lead_score and Lead Score Alerts in prompt verified)
- Commits: ec76695, bd4763e, 5a8a990 all present
