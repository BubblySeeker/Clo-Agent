# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — AI Contact Intelligence

**Shipped:** 2026-03-24
**Phases:** 2 | **Plans:** 2 | **Tasks:** 4

### What Was Built
- 8-rule `<contact_resolution>` XML protocol in AI system prompt covering name parsing, recency, ambiguity, and pronoun resolution
- Updated `search_contacts` tool description with UUID safety and resolution guidance
- Pronoun resolution (Rule 8) with 4 sub-rules: contact-scoped, single-contact, gender-match, ambiguous-ask

### What Worked
- Prompt-only approach: 40 lines of changes across 2 files delivered all 12 requirements — no backend, no migrations, no frontend changes
- XML tags for behavioral contracts: `<contact_resolution>` triggers native pattern recognition in Haiku 4.5
- Phase 1/Phase 2 split: shipping core resolution first gave empirical evidence for pronoun resolution design
- Early placement in system prompt maximized Haiku instruction-following

### What Was Inefficient
- Phase 1 ROADMAP.md shows "0/1 Not started" despite being complete on disk — roadmap update-plan-progress wasn't called during Phase 1 execution
- Human verification items (6 total across both phases) require live Haiku sessions — no automated testing path exists for prompt adherence

### Patterns Established
- XML-tagged behavioral contracts in system prompts for Claude Haiku 4.5
- Rule numbering with sub-rules (8a, 8b, 8c, 8d) for complex behaviors
- Structural validation of prompt integrity (char count, XML balance, rule count, Python syntax) as part of verification

### Key Lessons
1. System prompt engineering is high-leverage for Haiku 4.5 — explicit numbered rules with XML delimiters are more reliable than prose instructions
2. Token budget monitoring matters: 11,576 chars is near the practical limit for Haiku prompt attention; future additions should be measured
3. Gender inference from first names is a pragmatic heuristic but will fail for gender-neutral names — the "ask when ambiguous" fallback (Rule 8d) is essential

### Cost Observations
- Model mix: 100% Sonnet for execution agents, Sonnet for verification
- Sessions: 3 (discuss → plan → execute for each phase)
- Notable: Entire milestone completed in a single day — prompt-only changes are extremely fast to ship

---

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 2 |
| Plans | 2 |
| Files Changed | 2 |
| Lines Added | 40 |
| Timeline | 1 day |
| Requirements | 12/12 |
