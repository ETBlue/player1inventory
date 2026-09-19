# Environment setup — design

**Date:** 2026-09-19
**Status:** 🔲 Designed, not implemented
**Branch:** `docs/environment-setup`
**Brainstorming:** [2026-09-19-brainstorming-environment-setup.md](2026-09-19-brainstorming-environment-setup.md)
**Related:** [#294 CORS for preview origins](https://github.com/ETBlue/player1inventory/pull/294) · [e2e/CLAUDE.md](../../../e2e/CLAUDE.md)

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

Each step leaves the system working. Do not start step 3 before step 2.

1. Create the staging Neon branch.
2. Create the Railway preview service with the variables above. Confirm it starts and
   answers a GraphQL query.
3. Set the Cloudflare Pages **Preview** variables. Redeploy a preview.
4. Confirm cloud mode works on a preview URL, and that the user you sign in as appears in
   the **development** Clerk instance, not production.
5. Record the result at the end of this document.

## Still open

- **Does the staging database need seed data?** An empty database sends a new preview user
  straight to onboarding. That may be the correct behaviour for testing. Not decided.
- **Should preview deployments be restricted?** A Cloudflare Pages preview URL is public to
  anyone who has the link. With the development Clerk instance and a staging database,
  nothing production is exposed, but the preview app itself is reachable. Not decided.
- **Should `CLIENT_ORIGIN` on the preview service be the preview domain instead of the
  production one?** The pattern match in #294 covers the preview hostnames either way, so
  this is about clarity rather than behaviour. Not decided.
