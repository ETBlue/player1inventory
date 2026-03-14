# Brainstorming Log: Brainstorming Log SOP

**Date:** 2026-02-04

**Goal:** Establish SOP for creating brainstorming logs when decisions are made.

---

## Q&A

**Q1: When should brainstorming logs be created?**
- Options: Every brainstorming session / When decisions are made / When user requests
- Answer: **When decisions are made**
- Rationale: Not every brainstorming session results in actionable decisions. Only log when there's something to document and implement.

**Q2: What should be in the brainstorming log?**
- Options: Q&A only / Q&A + decision / Full context (Q&A + decision + rationale/trade-offs)
- Answer: **Full context**
- Rationale: Complete documentation helps future maintainers understand not just what was decided, but why, and what alternatives were considered.

**Q3: File naming and location?**
- Current pattern: `brainstorming-log-<topic>.md`
- Options: Keep current / Add date prefix / Date in filename
- Answer: **Date in filename** (`YYYY-MM-DD-brainstorming-<topic>.md`)
- Rationale: Aligns with design doc pattern in `docs/plans/`. Makes chronological sorting natural.

**Q4: Should we rename existing brainstorming logs to match?**
- Options: Rename existing / Keep old use new / Add dates to content only
- Answer: **Rename existing logs**
- Rationale: Consistency across all logs. Git history preserves original names. Dating from git log ensures accuracy.

---

## Decision

**Add brainstorming log SOP to CLAUDE.md:**

- Create logs when brainstorming leads to decisions
- Use format: `YYYY-MM-DD-brainstorming-<topic>.md`
- Include: Q&A, decision, rationale, trade-offs
- Rename all 7 existing logs to match pattern

**Implementation:**
1. Get creation dates from git history
2. Rename all existing logs with dates
3. Update CLAUDE.md AI Agent SOP
4. Create design doc
5. Create this brainstorming log
