# Brainstorming Log: AI Agent SOP

**Date:** 2026-02-04

**Goal:** Setup SOP for AI agents working in this codebase.

---

## User Inputs

Initial request:
- Update related docs before creating a PR
- For feature based tests, use given-when-then format and use "user" as a subject term

---

## Q&A

**Q1: Where should the AI agent SOP live?**
- Options: CLAUDE.md only / separate doc / both
- Answer: **Add to CLAUDE.md** - Single source of truth

**Q2: How strict should Given-When-Then test format be?**
- Options: Full GWT in test name / GWT as comments / GWT for feature tests only
- Answer: **GWT for feature tests only + GWT as comments inside test** + use "user can ..." in test name

**Q3: Which docs should be checked before PR?**
- Options: CLAUDE.md only / + design docs / + inline comments
- Answer: **All three** - CLAUDE.md + design docs + inline comments

**Q4: Any rules about commit granularity or messages?**
- Options: Just commitlint / add frequency guidance / add scope guidance
- Answer: **Add scope guidance** - Always include scope like `feat(cart):`

**Q5: Pre-PR verification steps?**
- Options: Basic / Standard / Thorough
- Answer: **Standard** - But noted that Husky already handles this on pre-push

**Q6: Other behaviors to enforce?**
- Options: Branch naming / PR format / when to ask
- Answer: **Branch naming + PR format**

---

## Final Design

Added to CLAUDE.md:
1. Documentation update rules (CLAUDE.md, design docs, inline comments)
2. Test format (feature tests: "user can ..." + GWT comments; unit tests: simple)
3. Commit scope requirement
4. Branch naming prefixes (feature/, fix/, docs/)
5. PR description format (Summary + Test Plan)
