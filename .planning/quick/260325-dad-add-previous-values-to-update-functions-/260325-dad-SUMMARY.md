---
phase: quick
plan: 260325-dad
subsystem: ai-service
tags: [tools, update-functions, previous-values, change-reporting]
dependency_graph:
  requires: []
  provides: [previous-value capture in update tool results]
  affects: [ai-service/app/tools.py]
tech_stack:
  added: []
  patterns: [SELECT-before-UPDATE pattern for change capture]
key_files:
  created: []
  modified:
    - ai-service/app/tools.py
decisions:
  - SELECT column list built dynamically from inp.keys() — only fetches fields being updated, not all fields
  - _update_property SELECT includes address separately so it is available in result even if address is not in inp
  - Removed post-UPDATE not-found check in _update_buyer_profile and _update_property (SELECT handles not-found)
metrics:
  duration: ~10 minutes
  completed: "2026-03-25"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 260325-dad: Add Previous Values to Update Functions Summary

**One-liner:** SELECT-before-UPDATE pattern added to all four update tool functions returning `{previous, new}` dicts for change reporting.

## What Was Built

All four update functions in `ai-service/app/tools.py` now capture the previous field values before executing the UPDATE query. This enables the AI to report "changed X from A to B" rather than just "updated X".

### Functions Modified

| Function | Table | Not-found handling |
|---|---|---|
| `_update_contact` | contacts | Returns `{"error": "Contact not found"}` before UPDATE |
| `_update_deal` | deals | Returns `{"error": "Deal not found"}` before UPDATE |
| `_update_buyer_profile` | buyer_profiles | Returns `{"error": "No buyer profile exists..."}` before UPDATE |
| `_update_property` | properties | Returns `{"error": "Property not found"}` before UPDATE |

### Return Format (all four)

```python
{
    "updated": True,
    "<entity>_id": "<id>",
    "previous": {"field1": "old_val", ...},
    "new": {"field1": "new_val", ...}
}
```

`_update_property` also includes `"address"` from the RETURNING clause.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- ai-service/app/tools.py: FOUND
- Commit 21b4d32: FOUND
