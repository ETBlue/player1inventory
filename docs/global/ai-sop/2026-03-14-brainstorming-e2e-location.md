# Brainstorming: E2E Test Location

Date: 2026-03-14

## Context

E2E tests lived in `apps/web/e2e/`. The existing tests are purely frontend (local IndexedDB mode). Cloud-mode tests are being added and require both the frontend dev server and the backend server running.

## Questions & Answers

**Q: Do current e2e tests hit the backend?**
A: No, existing tests are purely frontend (local IndexedDB mode).

**Q: What's the pain point?**
A: It feels wrong for backend-dependent tests to live inside the frontend folder.

**Q: One playwright project or separate suites?**
A: One playwright project for both local and cloud mode.

## Options Explored

**Option A — Keep in `apps/web/e2e/`**: extend playwright config to also start the backend. Minimal change but semantically wrong — backend-dependent tests in a frontend folder.

**Option B — `e2e/` at monorepo root**: system-level test suite, neutral location, clearly communicates "tests the whole system".

**Option C — `apps/e2e/` workspace**: same as B but inside `apps/`, adding workspace ceremony for no real gain.

## Decision

**Option B — `e2e/` at monorepo root.**

E2E tests are system tests, not frontend tests. They test frontend + backend together. A root-level `e2e/` directory makes ownership clear and keeps the `apps/` directory for runnable services only.
