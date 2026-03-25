# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Tool Routing

**Shipped:** 2026-03-24
**Phases:** 3 | **Plans:** 3

### What Was Built
- "Design & Build Tool Routing" section in CLAUDE.md (50 lines, 5 subsections)
- 5 tool routing defaults with path-based first-match-wins precedence
- Hard constraints (21st.dev dashboard ban, backend exclusions, Tailwind conformance)

### What Worked
- Phase 1 was comprehensive enough that Phases 2 and 3 were verification-only (no edits needed)
- Compact milestone — 3 phases for a config-only change was appropriate granularity

### What Was Inefficient
- Phases 2 and 3 were pure verification of Phase 1's work — could have been a single phase
- STATE.md requirement tracking stayed "Pending" despite work being complete

### Patterns Established
- Path-based routing as the primary signal for tool selection
- First-match-wins rule ordering for predictable precedence

### Key Lessons
1. For CLAUDE.md-only changes, coarse granularity (fewer phases) is better — verification phases without code changes add overhead
2. Summary one-liners should be populated properly for downstream consumption

### Cost Observations
- Model mix: 100% opus (quality profile)
- Notable: Small milestone, could have used balanced profile

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 3 | 3 | Initial milestone — established GSD workflow |

### Top Lessons (Verified Across Milestones)

1. (Awaiting more milestones for cross-validation)
