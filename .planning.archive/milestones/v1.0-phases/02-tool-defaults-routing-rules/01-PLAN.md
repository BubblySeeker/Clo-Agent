# Phase 2: Tool Defaults & Routing Rules

```yaml
wave: 1
depends_on: []
files_modified:
  - CLAUDE.md
autonomous: true
requirements:
  - TOOL-01
  - TOOL-02
  - TOOL-03
  - TOOL-04
  - TOOL-05
```

## Goal

Verify that all 5 tool-routing defaults are correctly defined in the CLAUDE.md `## Design & Build Tool Routing` section that was created in Phase 1. Phase 1's implementation was comprehensive and already included the full Tool Inventory, Routing Rules, and Multi-Tool Tasks content that Phase 2 requires.

## must_haves

- `frontend-design` appears in Tool Inventory as Orchestrator for Dashboard/app UI (TOOL-01)
- `ui-ux-pro-max` appears in Tool Inventory as Orchestrator for Landing/marketing (TOOL-02)
- `Stitch` appears in Tool Inventory as Specialist for reusable components/styling (TOOL-03)
- `Gemini (nano banana 2)` appears in Tool Inventory as Specialist for image generation (TOOL-04)
- `21st.dev` appears in Tool Inventory as Specialist for 3D on marketing only (TOOL-05)
- Routing rules use directory-level patterns (`dashboard/**`, `(marketing)/**`)
- Precedence order: Gemini > 21st.dev > Stitch > ui-ux-pro-max > frontend-design
- Multi-tool composition sequence documented

## Tasks

<task id="T1" wave="1">
<title>Verify tool routing defaults in CLAUDE.md</title>

<read_first>
- CLAUDE.md (lines 324-373, the Design & Build Tool Routing section)
</read_first>

<action>
Verify the existing section satisfies all 5 TOOL requirements. No edits needed — Phase 1 already inserted the complete content. Run the acceptance criteria checks to confirm.
</action>

<acceptance_criteria>
- grep "frontend-design" CLAUDE.md | grep -c "Orchestrator" returns at least 1
- grep "ui-ux-pro-max" CLAUDE.md | grep -c "Orchestrator" returns at least 1
- grep "Stitch" CLAUDE.md | grep -c "Specialist" returns at least 1
- grep "Gemini" CLAUDE.md | grep -c "Specialist" returns at least 1
- grep "21st.dev" CLAUDE.md | grep -c "Specialist" returns at least 1
- grep -c "dashboard/\*\*" CLAUDE.md returns at least 1
- grep -c "(marketing)/\*\*" CLAUDE.md returns at least 1
- Routing Rules list starts with Gemini (rule 1) and ends with frontend-design (rule 6) — correct precedence
- grep -c "Assets first" CLAUDE.md returns at least 1 (multi-tool composition)
</acceptance_criteria>
</task>

## Verification

```bash
# Verify all 5 tools present with correct roles
echo "TOOL-01:" && grep "frontend-design" CLAUDE.md | grep "Orchestrator"
echo "TOOL-02:" && grep "ui-ux-pro-max" CLAUDE.md | grep "Orchestrator"
echo "TOOL-03:" && grep "Stitch" CLAUDE.md | grep "Specialist"
echo "TOOL-04:" && grep "Gemini" CLAUDE.md | grep "Specialist"
echo "TOOL-05:" && grep "21st.dev" CLAUDE.md | grep "Specialist"

# Verify directory-level patterns
grep "dashboard/\*\*" CLAUDE.md
grep "(marketing)/\*\*" CLAUDE.md

# Verify precedence (Gemini is rule 1, frontend-design is rule 6)
grep -n "Image needed.*Gemini" CLAUDE.md
grep -n "Dashboard/app UI.*frontend-design" CLAUDE.md

# Verify multi-tool composition
grep "Assets first" CLAUDE.md
```
