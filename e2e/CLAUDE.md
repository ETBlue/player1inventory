# E2E — Agent Rules

Playwright specs for the full stack. Structure and authoring conventions live in the
root `CLAUDE.md` → **E2E Test Format**. This file records the *environment* hazards —
each one has already cost a session by presenting as a code regression.

## Only one E2E suite may run on this machine at a time

`pnpm test:e2e` cannot run concurrently in two worktrees (or two agent sessions). The
ports are plain constants in `e2e/constants.ts` — `LOCAL_WEB_PORT 5175`,
`CLOUD_WEB_PORT 5174`, `CLOUD_SERVER_PORT 4001` — with no env override, and every
`webServer` entry sets `reuseExistingServer: false`. Cloud specs additionally share one
dev database under the same `E2E_USER_ID`, so a concurrent run cross-contaminates rows
even when the ports happen to work out.

**The symptom is not a port error.** Playwright starts, then dozens of specs fail with
`net::ERR_CONNECTION_REFUSED at http://localhost:5175/` because the other run tore the
vite server down mid-flight. That reads as a mass code regression; it is an environment
collision. It happened on 2026-08-27 between two worktrees.

**Before running E2E,** check the ports are free *and stay* free:

```bash
lsof -nP -iTCP:5175 -sTCP:LISTEN     # identify the owner with: ps -o command -p <pid>
```

The process path names which worktree owns it. Wait for a **sustained** quiet window
(~90s of consecutive free checks), not the first free instant, or you race the other
session's next launch. **Never kill the other session's server.** A run showing
`ERR_CONNECTION_REFUSED` is void — re-run it alone before believing any failure.

## A stale `generated/graphql.ts` breaks E2E with symptoms that point elsewhere

`apps/web/src/generated/graphql.ts` is gitignored, so a checkout or worktree can carry a
stale copy. When it is stale the app **fails to boot entirely** — `<div id="root">` stays
empty with a single `pageerror`:

```
The requested module '/src/generated/graphql.ts' does not provide
an export named 'useApplyShelfFilterPicksMutation'
```

Nothing in the failure says "codegen". What you see instead:

- `a11y.spec.ts` fails on `landmark-one-main` and `page-has-heading-one` — an empty body
  has no `<main>` and no `<h1>` — *not* on any real violation
- seeds die with `NotFoundError: One of the specified object stores was not found`,
  because `indexedDB.open()` created an empty v1 DB when Dexie never ran

Both look like genuine bugs in whatever you are working on.

**If a page renders nothing, or E2E fails on missing landmarks plus "object store not
found", run `pnpm codegen` from the repo root before investigating anything else.**
`EnterWorktree`'s hook runs it on creation, but the main checkout drifts on its own after
a branch switch. The root `pnpm build` runs codegen too — which is why it catches drift
that `pnpm test`, `pnpm check` and `build-storybook` all miss.

## Cloud E2E is not database-isolated

The `cloud` project runs against whatever `DATABASE_URL` is set in `apps/server/.env` —
normally the **dev database**. There is no dedicated test database.

Isolation is by **row ownership, not by database**: every write is scoped to
`E2E_USER_ID` (`e2e/constants.ts`, `'e2e-test-user'`), and the `/e2e/cleanup` endpoint
(`apps/server/src/index.ts`) runs `deleteMany({ where: { userId } })` per model — it
deletes only that user's rows, never all data. **Do not describe the cleanup endpoint as
wiping the database.**

This was obscured for a while by a leftover `MONGODB_URI` from the MongoDB → Prisma
migration, which made the config *look* isolated. The server never read it (Prisma reads
`DATABASE_URL`/`DIRECT_URL`), so it was inert rather than erroring. Removed in PR #242;
the real invariant is now commented in `e2e/playwright.config.ts`.

**Fixed (2026-08-30, cloud locations PR 1).** The cloud `webServer` now runs with
`DATABASE_URL=$TEST_DATABASE_URL` / `DIRECT_URL=$TEST_DIRECT_URL` (see
`apps/server/.env.example`), a dedicated Neon branch. Row-ownership scoping under
`E2E_USER_ID` still applies and `/e2e/cleanup` is unchanged — but a spec that needs a
second synthetic user no longer leaves rows in the dev database. If `E2E_TEST_MODE=true`
and `TEST_DATABASE_URL` is unset, `apps/server/src/lib/prisma.ts` throws rather than
falling back to `DATABASE_URL` — verified directly (see the task-2 report) — so a missing
test database fails loudly instead of silently writing multi-user fixtures into dev.
