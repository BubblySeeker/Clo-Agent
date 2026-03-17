# Requirements: CloAgent Tool Routing

**Defined:** 2026-03-17
**Core Value:** Claude Code should automatically use the right specialized tool for each task to produce good design by default.

## v1 Requirements

### Tool Defaults

- [ ] **TOOL-01**: When building or modifying frontend UI, use the `frontend-design` skill for dashboard/app pages
- [ ] **TOOL-02**: When building or modifying landing/marketing pages, use the `ui-ux-pro-max` skill
- [ ] **TOOL-03**: When creating new reusable components or doing styling/theming work, use Stitch
- [ ] **TOOL-04**: When any image asset is needed (marketing, app, icons, placeholders), use Gemini (nano banana 2)
- [ ] **TOOL-05**: When 3D interactive components are needed on landing/marketing pages, use 21st.dev

### Hard Constraints

- [ ] **CNST-01**: 21st.dev is NEVER used in dashboard pages — landing/marketing only
- [ ] **CNST-02**: Design tools are not invoked for backend (Go), AI service (Python), or pure logic changes (API calls, state management, hooks)
- [ ] **CNST-03**: All tool output must use Tailwind CSS consistent with existing codebase patterns

### Integration

- [ ] **INTG-01**: Rules are added to the existing CLAUDE.md file as a new section
- [ ] **INTG-02**: Rules are concise — broad defaults with few specific exceptions, not an exhaustive routing table

## v2 Requirements

### Advanced Routing

- **ADV-01**: Multi-tool composition sequencing for complex tasks
- **ADV-02**: Component reuse awareness (check existing components before creating new ones)
- **ADV-03**: Brand-specific prompt templates for Gemini image generation

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backend/AI service changes | This is a CLAUDE.md instruction update only |
| New frontend features | Configuring how Claude builds, not what it builds |
| Complex precedence rules | User wants broad defaults, not hyper-specific routing |
| Per-file routing rules | Brittle; use broad directory/task-type rules instead |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INTG-01 | Phase 1 — Integration & Structure | Pending |
| INTG-02 | Phase 1 — Integration & Structure | Pending |
| TOOL-01 | Phase 2 — Tool Defaults & Routing Rules | Pending |
| TOOL-02 | Phase 2 — Tool Defaults & Routing Rules | Pending |
| TOOL-03 | Phase 2 — Tool Defaults & Routing Rules | Pending |
| TOOL-04 | Phase 2 — Tool Defaults & Routing Rules | Pending |
| TOOL-05 | Phase 2 — Tool Defaults & Routing Rules | Pending |
| CNST-01 | Phase 3 — Hard Constraints & Exclusions | Pending |
| CNST-02 | Phase 3 — Hard Constraints & Exclusions | Pending |
| CNST-03 | Phase 3 — Hard Constraints & Exclusions | Pending |

**Coverage:**
- v1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after roadmap phase mapping*
