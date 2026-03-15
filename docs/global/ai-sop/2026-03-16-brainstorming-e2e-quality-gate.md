# Brainstorming: E2E Tests in Quality Gate

**Date:** 2026-03-16

## Questions and Answers

**Q1 — When should E2E run?**
Options: (A) every phase, (B) final phase only, (C) configurable.
**Answer: B — final phase only.**

**Q2 — Full suite or subset?**
Options: (A) full suite, (B) related tests via `--grep`, (C) curated smoke tests.
**Answer: B — related tests only, agent selects via `--grep` based on feature area.**

**Q3 — Server management**
Options: (A) `pnpm test:e2e` directly (Playwright webServer config), (B) preview build + manual server.
**Answer: A — rely on Playwright's `webServer` config.**

**Q4 — Failure behavior**
Options: (A) hard stop, (B) warn only.
**Answer: A — hard stop, same as lint/build.**

**Q5 — Placement in the gate**
E2E runs after the existing gate commands (lint, build, build-storybook, check).
**Answer: confirmed, placement is correct.**

**Q6 — Multiple feature areas**
**Answer: combine with a pipe — `--grep "shopping|tags"`.**

## Final Decision

- E2E runs **on the final phase only**, not after every intermediate step
- Scope: **related tests only** using `--grep "<feature-areas>"` (e.g. `shopping|tags`)
- Server: `pnpm test:e2e` — Playwright's `webServer` config handles startup
- Failure: **hard stop** — fix before finishing the branch

## CLAUDE.md Change

Added to the **Verification Gate** section:
- New block after the existing bash commands explaining the final-phase E2E step
- Guidance on identifying and combining feature area patterns
- Added E2E hard-stop rule to the Rules list
