---
name: sync-tool-labels
description: /sync-tool-labels — Compare AI tool definitions in Python against frontend label maps and report any drift
user_invocable: true
---

# Sync Tool Labels

Compares tool names defined in the AI service against the frontend label maps to detect drift.

## Steps

1. Read `ai-service/app/tools.py` and extract:
   - All tool names from `TOOL_DEFINITIONS` (the `"name"` field of each dict)
   - The `READ_TOOLS` set
   - The `WRITE_TOOLS` set

2. Read `frontend/src/lib/ai-chat-helpers.ts` and extract:
   - All keys from `toolLabel`
   - All keys from `confirmLabel`

3. Compare and report:

   **toolLabel check**: Every tool in `TOOL_DEFINITIONS` should have an entry in `toolLabel`. Report any missing.

   **confirmLabel check**: Every tool in `WRITE_TOOLS` should have an entry in `confirmLabel`. Report any missing.

   **Stale entries**: Any key in `toolLabel` or `confirmLabel` that does NOT appear in `TOOL_DEFINITIONS` or `WRITE_TOOLS` respectively. These are dead entries that should be removed.

4. Output a summary table:

```
| Check          | Status | Missing/Stale |
|----------------|--------|---------------|
| toolLabel      | OK/DRIFT | list...    |
| confirmLabel   | OK/DRIFT | list...    |
```

5. If drift is found, offer to fix `ai-chat-helpers.ts` by adding the missing entries with reasonable default labels (tool name in title case, prefixed with action verb).

## Notes

- This skill is read-only by default — it only writes if the user confirms the fix.
- Run this after adding new AI tools to catch frontend label drift early.
