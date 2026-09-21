# Environment setup — design

**Date:** 2026-09-19
**Status:** ⏸️ Designed — decided **not to build yet** (2026-09-21). See [Decision](#decision-2026-09-21-not-building-this-yet).
**Branch:** `docs/environment-setup`
**Brainstorming:** [2026-09-19-brainstorming-environment-setup.md](2026-09-19-brainstorming-environment-setup.md)
**Related:** [#294 CORS for preview origins](https://github.com/ETBlue/player1inventory/pull/294) · [e2e/CLAUDE.md](../../../e2e/CLAUDE.md)

## Decision (2026-09-21): not building this yet

**The preview tier described below is not being built.** The design stands and is ready to
follow when it is needed. This section says why it is not needed today, and what would
change that.

### The current state fails safe

Preview ships `pk_live` and points at the production API, but the Clerk **production**
instance refuses to issue a token for a `pages.dev` origin (`origin_invalid`). No token
means no authenticated request, so **a preview cannot read or write production data.** It
stops before it starts.

Local mode on preview is unaffected — IndexedDB only, no Clerk, no API. That is what a
preview is actually used for here, and it keeps working. Each preview deployment is also
its own origin, so preview local data never mixes with production local data.

### What is given up

Cloud mode cannot be tested before merge. Cloud bugs reach production first.

Today there is one cloud user and production is that user's own instance, so the same
person finds the bug either way. The preview URL is rarely used. That is a fair trade.

### Migration safety does not depend on this

An earlier draft argued that a staging branch forked from production would make every
preview deploy a migration rehearsal. That is true but redundant. Migration safety is
already covered, and better:

- `pnpm --filter server verify:migration` applies migrations to real Postgres and asserts
  the result
- `apps/server/prisma/CLAUDE.md` documents production-data rehearsals — additive-only, a
  fresh copy each time, and proving the `DATABASE_URL` override is real before the first
  write
- Risky migrations get a deploy runbook

A preview tier would be a weaker version of all of that. It is not the reason to build one.

### The one risk of leaving it

**The protection is a side effect, not a guard that was built on purpose.** It holds only
while nobody "fixes" the `origin_invalid` error.

The tempting wrong fix is adding the preview domain as a **satellite domain** on the
production instance. Searching that error code leads there. It would work, and it would
point every preview at production users and production data — test rows in a real pantry.
See [Rejected: satellite domains](#rejected-satellite-domains).

**Do not resolve `origin_invalid` on a preview URL by changing the Clerk production
instance.** On a preview, that error is the system working correctly.

### When to revisit

Build the preview tier when any of these becomes true:

- a second person contributes, so "I will find it on production" stops being true
- cloud-mode bugs start reaching production often enough to cost more than a Railway service
- cloud gains a user who is not the developer

## Goal

Four environments, each one a complete and matched set. A preview deployment must never
touch production data or production auth.

## The principle

**An environment is a matched set, not a pile of variables.**

Four things belong to every tier, and they must all come from the same tier:

1. the web origin
2. the API
3. the database
4. the Clerk instance

Most environment bugs come from mixing tiers. Two examples that are easy to create by
accident:

- A `pk_live` frontend talking to an `sk_test` API. The API cannot verify a token issued by
  a different Clerk instance, so every request fails with an auth error that looks like a
  code bug.
- A preview web app pointed at the production database. Test data lands in real rows, and
  nobody notices until someone reads their pantry.

## The problem today

There is one of everything.

| Thing | Today |
|---|---|
| Railway | one service — production |
| Cloudflare Pages | one project; Preview carries `pk_live` |
| Clerk | one production instance, custom domain `clerk.player1inventory.etblue.tw` |
| Neon | production branch, plus a test branch for E2E |

So a preview deployment borrows production auth and production data.

Clerk is the first component to refuse, and it refuses correctly:

```
"code": "origin_invalid"
"The Request HTTP Origin header must be equal to or a subdomain of the requesting URL."
```

A Clerk production instance is bound to one domain. A Cloudflare Pages preview hostname is
not that domain, and its hash changes on every deployment.

## The target

| Environment | Web | API | Database | Clerk |
|---|---|---|---|---|
| **Local dev** | `vite dev` :5173 | local node :4000 | dev Neon branch | development (`pk_test`) |
| **E2E** | `vite dev` :5174 / :5175 | local node :4001 | test Neon branch | **none — bypassed** |
| **Preview** | Pages preview | Railway preview service | staging Neon branch | development (`pk_test`) |
| **Production** | Pages production | Railway production | production Neon branch | production (`pk_live`) |

### Local dev

Unchanged. `apps/web/.env.local` and `apps/server/.env` already hold development Clerk keys
(`pk_test` / `sk_test`).

### E2E — already correct, do not change

`E2E_TEST_MODE=true` makes the server skip `clerkMiddleware()` entirely
(`apps/server/src/index.ts:18`). The web app reads `VITE_E2E_TEST_USER_ID` and sends an
`x-e2e-user-id` header instead of a Clerk token (`apps/web/src/main.tsx:54`).

**E2E therefore depends on no third-party auth service.** It cannot fail because Clerk had
an outage, a key rotated, or a domain changed.

`E2E_TEST_MODE=true` also points Prisma at `TEST_DATABASE_URL`, a dedicated Neon branch
(`apps/server/src/lib/prisma.ts`). If that variable is unset the server throws rather than
falling back to `DATABASE_URL`, so a missing test database fails loudly instead of writing
test rows into dev.

**Do not "improve" this into a real login.** Signing in through Clerk during E2E would make
the suite slower, flakier, and dependent on a service outside this repository.

### Preview — the part that needs building

Three changes, and they must land together. A preview with half of them is worse than one
with none, because it will fail in a way that looks like a code bug.

**1. A second Railway service.**

| Variable | Value |
|---|---|
| `CLERK_SECRET_KEY` | `sk_test_…` (development instance) |
| `CLERK_PUBLISHABLE_KEY` | `pk_test_…` |
| `DATABASE_URL` / `DIRECT_URL` | a staging Neon branch |
| `CLIENT_ORIGIN` | the production web origin (the preview subdomains are matched separately — see below) |
| `PORT` | as Railway provides |

`E2E_TEST_MODE` must **not** be set here. It is for the local E2E server only.

**2. Cloudflare Pages Preview variables, set separately from Production.**

Pages keeps two variable sets and **Preview does not inherit Production**. Today Preview
appears to carry the production values, which is why a preview build ships `pk_live`.

| Variable | Production | Preview |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_…` | `pk_test_…` |
| `VITE_GRAPHQL_HTTP_URL` | production API | preview API |
| `VITE_GRAPHQL_WS_URL` | production API | preview API |

**3. Nothing in the Clerk dashboard.**

No satellite domain and no origin list. A development instance accepts the origins a
preview needs.

### Production

Unchanged.

## Why preview uses the development Clerk instance

Clerk gives every application two instances: development and production. They have separate
user pools, separate keys, and different rules about origins.

- **Production instances** are bound to one domain. This is a security feature.
- **Development instances** accept most origins.

A Cloudflare Pages preview hostname changes on every deployment
(`5bb1b97f.player1inventory.pages.dev`), and the per-branch alias
(`feature-pwa-offline.player1inventory.pages.dev`) changes with every new branch. No
fixed-domain allowlist can keep up with that.

Using the development instance for previews is the intended use of that instance, not a
workaround. It also means preview sign-ins create users in the development pool, which is
what you want: **a preview must not create or read production users.**

## Which Neon branch to fork for staging

A Neon branch is a copy-on-write clone of a parent branch. The parent decides two things:
the schema the branch starts with, and the rows it starts with.

**Fork from the production branch, then delete the rows.**

### Why not the dev branch

Your local dev database is usually *ahead* of production. You run `prisma migrate dev`
while building a feature, so dev already holds migrations that have never been released.
A migration that applies cleanly against dev proves nothing about production.

### Why not production's data

Railway applies migrations on every deploy (`railway.toml`):

```toml
releaseCommand = "pnpm --filter server exec prisma migrate deploy"
```

So a staging branch that starts at production's migration state makes every preview deploy
a migration rehearsal against the exact schema production has. That is worth keeping. The
**data** is not.

Preview signs in through the **development** Clerk instance (`pk_test`). Production rows
are owned by **production** Clerk user ids. `userId` is the Clerk user id — see
`apps/server/src/index.ts`:

```ts
const auth = getAuth(req)
return { userId: auth.userId ?? null }
```

The two Clerk instances have separate user pools, so the ids never match. Every resolver
scopes by `userId`, directly or through `location`. A preview user therefore **sees none of
the copied data**. You would store real personal data behind a public preview URL and get
nothing back for it.

Check whether your Neon plan offers schema-only branches — that does this in one step. If
not, fork the branch and truncate the tables.

### Re-fork when production migrates

The rehearsal only works while the staging branch matches production. The moment a PR's
migration is applied to staging, it no longer does. Re-create the staging branch from
production after each production migration. Neon branches are copy-on-write, so this is
fast and cheap.

### Concurrent PRs share one database

The design above has **one** Railway preview service, so every open PR's preview points at
the same staging branch. Two PRs carrying different migrations will collide: the second
`migrate deploy` may fail, or the first PR's schema change may break the second PR's
preview.

With one or two PRs open at a time this is acceptable. It is written down so that when it
happens it is recognised, not debugged as a code bug. The industry answer is a database
branch per PR — Neon's GitHub integration creates one on PR open and deletes it on close —
but that only helps if each PR also gets its own API service, which is the cost this design
already chose not to pay.


## Rejected: satellite domains

Clerk can add another domain to a production instance as a satellite domain.

Rejected, in order of weight:

1. **Previews would still use production users and production data.** This is the real
   objection. The other two are only cost.
2. It needs code, not just dashboard settings —
   `<ClerkProvider isSatellite domain={…} signInUrl={…}>` plus DNS. The app would carry a
   permanent preview-only branch in `ClerkProvider`.
3. Sign-in would redirect to the primary domain and back.

## How #294 fits

[#294](https://github.com/ETBlue/player1inventory/pull/294) makes the API accept
`https://<label>.player1inventory.pages.dev` as well as `CLIENT_ORIGIN`.

It is **necessary but not sufficient**. It lets a preview web app reach an API at all. It
does nothing about Clerk, which refuses the origin before the API is reached.

It is still needed after this design is built: the preview API must accept the rotating
preview hostnames, and that is exactly what it does.

## Cost

| Item | Cost |
|---|---|
| Second Railway service | real money, per month |
| Clerk development instance | free, already exists |
| Staging Neon branch | free or near-free |

**If the Railway cost is unwanted, the fallback is explicit:** previews test local mode
only, and cloud mode is verified on production after merge. That is a reasonable choice for
a personal project. It is written here so it stays a decision rather than a surprise
discovered later.

## Order of work

**On hold** — see [Decision](#decision-2026-09-21-not-building-this-yet). These steps are
the recipe for when the tier is built, not a task list for today.

Each step leaves the system working. Do not start step 3 before step 2.

1. Create the staging Neon branch — fork it from **production**, then delete the rows.
   See [Which Neon branch to fork for staging](#which-neon-branch-to-fork-for-staging).
2. Create the Railway preview service with the variables above. Confirm it starts and
   answers a GraphQL query.
3. Set the Cloudflare Pages **Preview** variables. Redeploy a preview.
4. Confirm cloud mode works on a preview URL, and that the user you sign in as appears in
   the **development** Clerk instance, not production.
5. Record the result at the end of this document.

## Still open

- **Does the staging database need seed data?** The staging branch is forked from
  production and emptied, so a new preview user lands on onboarding. That may be the
  correct behaviour for testing. Not decided.
- **Should preview deployments be restricted?** A Cloudflare Pages preview URL is public to
  anyone who has the link. With the development Clerk instance and a staging database,
  nothing production is exposed, but the preview app itself is reachable. Not decided.
- **Should `CLIENT_ORIGIN` on the preview service be the preview domain instead of the
  production one?** The pattern match in #294 covers the preview hostnames either way, so
  this is about clarity rather than behaviour. Not decided.
