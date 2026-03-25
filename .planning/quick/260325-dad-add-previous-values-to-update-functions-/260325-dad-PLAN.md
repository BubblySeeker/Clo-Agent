---
phase: quick
plan: 260325-dad
type: execute
wave: 1
depends_on: []
files_modified: [ai-service/app/tools.py]
autonomous: true
requirements: [QUICK-260325-dad]
must_haves:
  truths:
    - "Each update function returns previous values for all fields being changed"
    - "Each update function returns new values for all fields being changed"
    - "If the record does not exist, the function returns an error dict before attempting UPDATE"
  artifacts:
    - path: "ai-service/app/tools.py"
      provides: "Updated _update_contact, _update_deal, _update_buyer_profile, _update_property with previous value capture"
  key_links:
    - from: "SELECT (previous values)"
      to: "UPDATE (new values)"
      via: "Same cursor, same connection block, SELECT runs before UPDATE"
      pattern: "previous.*SELECT|SELECT.*previous"
---

<objective>
Add previous-value capture to all four update functions in tools.py so the AI can report what changed (old -> new) when confirming updates to the user.

Purpose: Enables the AI to show "changed X from A to B" instead of just "updated X"
Output: Modified _update_contact, _update_deal, _update_buyer_profile, _update_property
</objective>

<execution_context>
@/Users/matthewfaust/CloAgent/Clo-Agent/.claude/get-shit-done/workflows/execute-plan.md
@/Users/matthewfaust/CloAgent/Clo-Agent/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@ai-service/app/tools.py (lines 1072-1253, 1534-1552)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add previous-value SELECT to all four update functions</name>
  <files>ai-service/app/tools.py</files>
  <action>
Modify these four functions in ai-service/app/tools.py to capture previous values before updating:

**1. _update_contact (line 1074):**
After filtering inp to _CONTACT_FIELDS and the empty check, inside the `with get_conn()` block, BEFORE the UPDATE query:
- Add: `SELECT {comma-separated keys from inp} FROM contacts WHERE id = %s AND agent_id = %s` with params `[contact_id, agent_id]`
- Fetch the row. If no row returned, return `{"error": "Contact not found"}`
- Store as `previous = dict(row)`
- After the existing UPDATE + RETURNING, change the return to:
  `{"updated": True, "contact_id": contact_id, "previous": previous, "new": {k: inp[k] for k in inp}}`
- Keep the existing `_schedule_embed` call and its conditional on `row`.

**2. _update_deal (line 1129):**
After stage_name resolution and filtering inp to _DEAL_FIELDS and the empty check, BEFORE the UPDATE query:
- Add: `SELECT {comma-separated keys from inp} FROM deals WHERE id = %s AND agent_id = %s` with params `[deal_id, agent_id]`
- Fetch the row. If no row returned, return `{"error": "Deal not found"}`
- Store as `previous = dict(row)`
- After the existing UPDATE + RETURNING, change the return to:
  `{"updated": True, "deal_id": deal_id, "previous": previous, "new": {k: inp[k] for k in inp}}`

**3. _update_buyer_profile (line 1231):**
After the contact ownership check and filtering inp to _BUYER_PROFILE_FIELDS and the empty check, BEFORE the UPDATE query:
- Add: `SELECT {comma-separated keys from inp} FROM buyer_profiles WHERE contact_id = %s` with params `[contact_id]`
- Fetch the row. If no row returned, return `{"error": "No buyer profile exists for this contact. Use create_buyer_profile first."}`
- Store as `previous = dict(row)`
- After the existing UPDATE + RETURNING, change the return to:
  `{"updated": True, "contact_id": contact_id, "previous": previous, "new": {k: inp[k] for k in inp}}`
- Remove the existing `if not row` check after UPDATE since the SELECT already handles not-found.

**4. _update_property (line 1534):**
After filtering inp to _PROPERTY_FIELDS and the empty check, inside the `with get_conn()` block, BEFORE the UPDATE query:
- Add: `SELECT {comma-separated keys from inp} FROM properties WHERE id = %s AND agent_id = %s` with params `[property_id, agent_id]`
- Fetch the row. If no row returned, return `{"error": "Property not found"}`
- Store as `previous = dict(row)`
- After the existing UPDATE + RETURNING, change the return to:
  `{"updated": True, "property_id": property_id, "address": row["address"], "previous": previous, "new": {k: inp[k] for k in inp}}`
- Remove the existing `if not row` check after UPDATE since the SELECT already handles not-found.

**Key implementation detail for all four:** The SELECT column list must be dynamically built from `inp.keys()` the same way the UPDATE fields are built — use `", ".join(inp.keys())` for the SELECT columns. This ensures we only fetch the fields being updated, not all fields.

**Important:** Use `%s` placeholders only for values (id, agent_id), NOT for column names. Column names come from the validated inp keys (already filtered against the allowed field sets), so string formatting for column names is safe here (same pattern already used for UPDATE SET clauses).
  </action>
  <verify>
    <automated>cd /Users/matthewfaust/CloAgent/Clo-Agent && python3 -c "
import ast, sys
with open('ai-service/app/tools.py') as f:
    source = f.read()

# Check all four functions contain 'previous' in their body
for fn in ['_update_contact', '_update_deal', '_update_buyer_profile', '_update_property']:
    # Find function and check for previous pattern
    idx = source.find(f'def {fn}(')
    if idx == -1:
        print(f'FAIL: {fn} not found'); sys.exit(1)
    # Get function body (up to next def at same indent level)
    next_def = source.find('\ndef ', idx + 1)
    body = source[idx:next_def] if next_def != -1 else source[idx:]
    if 'previous' not in body:
        print(f'FAIL: {fn} missing previous value capture'); sys.exit(1)
    if 'SELECT' not in body.split('UPDATE')[0]:
        print(f'FAIL: {fn} SELECT not before UPDATE'); sys.exit(1)
    print(f'OK: {fn} has previous-value capture')

print('All checks passed')
"
    </automated>
  </verify>
  <done>All four update functions capture previous values via SELECT before UPDATE and return both previous and new values in their result dict. Records not found return an error dict before any UPDATE is attempted.</done>
</task>

</tasks>

<verification>
- All four update functions contain a SELECT query before their UPDATE query
- The SELECT dynamically uses only the fields being updated (from inp.keys())
- Each function returns {"previous": {...}, "new": {...}} alongside existing return fields
- Not-found cases return {"error": "..."} before the UPDATE executes
- No other functions in tools.py are modified
</verification>

<success_criteria>
- python3 -c "import ast; ast.parse(open('ai-service/app/tools.py').read())" succeeds (valid Python)
- Each of the 4 functions has SELECT before UPDATE with previous value capture
- Return dicts include both "previous" and "new" keys
</success_criteria>

<output>
After completion, create `.planning/quick/260325-dad-add-previous-values-to-update-functions-/260325-dad-SUMMARY.md`
</output>
