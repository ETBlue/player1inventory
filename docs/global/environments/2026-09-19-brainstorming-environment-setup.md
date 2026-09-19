# Environment setup — brainstorming

**Date:** 2026-09-19
**Branch:** `docs/environment-setup`
**Design:** [2026-09-19-environment-setup-design.md](2026-09-19-environment-setup-design.md)

## How this started

The PWA offline work ([#292](https://github.com/ETBlue/player1inventory/pull/292)) owed a
manual check: sign in to cloud mode, go offline, confirm the banner and that the pantry
still reads. The designer tried it on a Cloudflare Pages preview URL and could not use
cloud mode.

The investigation went through three layers. Each looked like the answer and was not.

## Layer 1 — CORS on the API

**Found:** `apps/server/src/index.ts:16` was

```ts
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? DEFAULT_CLIENT_ORIGIN }))
```

`origin` took a single string. Only the production domain was accepted.

**Fixed** in [#294](https://github.com/ETBlue/player1inventory/pull/294): the server now
also accepts `https://<label>.player1inventory.pages.dev`.

**This was necessary but not sufficient.** The PR description first claimed it unblocked
the cloud-mode check on #292. That claim was wrong and has been corrected in the PR itself.

## Layer 2 — Clerk rejects the origin first

Tested on #294's own preview URL, `https://fefc8687.player1inventory.pages.dev`. The
request never reached the API. Clerk refused it:

```
GET https://clerk.player1inventory.etblue.tw/v1/environment

{"errors":[{"message":"Invalid HTTP Origin header",
  "long_message":"The Request HTTP Origin header must be equal to or a subdomain of the requesting URL.",
  "code":"origin_invalid"}]}
```

`clerk.player1inventory.etblue.tw` is a **production** Clerk instance on a custom domain.
A production instance is bound to one domain. `fefc8687.player1inventory.pages.dev` is
neither equal to it nor a subdomain of it, so Clerk refuses — correctly. That check is
what stops another site from using this Clerk instance.

## Layer 3 — the real cause is that there is only one of everything

Facts gathered from the designer:

| Thing | Today |
|---|---|
| Railway | one service, production only |
| Cloudflare Pages | one project, `VITE_CLERK_PUBLISHABLE_KEY` starts with `pk_live` |
| Clerk | one production instance on a custom domain |

So a preview deployment borrows **production auth** and **production data**. Clerk is
simply the first component to say no.

Fixing the symptom (adding `pages.dev` to Clerk) would leave the deeper problem in place:
previews would still authenticate real users against real data.

## Question asked

> "Regardless of current configuration, from an architecture perspective, what's the best
> strategy for arranging all environments including dev, preview, e2e, and production?"

## Decision

**An environment is a matched set, not a pile of variables.** Web origin, API, database and
auth instance all belong to the same tier. Most environment bugs come from mixing tiers.

Four environments, each matched. See the design doc for the full table.

The two decisions that carry the most weight:

1. **Preview uses the Clerk development instance.** Clerk gives every application a
   development and a production instance. Development instances accept most origins, which
   is what a rotating `*.pages.dev` hostname needs. This is the intended use of that
   instance, not a workaround.

2. **E2E uses no Clerk at all, and that stays.** `E2E_TEST_MODE=true` already skips
   `clerkMiddleware()` (`apps/server/src/index.ts:18`) and identity comes from an
   `x-e2e-user-id` header. E2E therefore cannot break because of a Clerk outage or a
   domain change. This was already correct before this work and must not be "improved"
   into a real login.

## Rejected: satellite domains

Clerk supports adding another domain to a production instance as a **satellite domain**.

Rejected for three reasons, in order of weight:

1. Previews would still authenticate **production users against production data**. That is
   the real objection.
2. It needs code, not only dashboard settings:
   `<ClerkProvider isSatellite domain={…} signInUrl={…}>`, plus DNS. The app would carry a
   permanent preview-only branch in `ClerkProvider`.
3. Sign-in redirects to the primary domain and back, which is a worse flow.

## Accepted cost

A second Railway service costs money. The Clerk development instance and an extra Neon
branch are free or close to it.

If the cost is unwanted, the honest fallback is: **previews test local mode only, and cloud
mode is verified on production after merge.** That is a reasonable choice for a personal
project. It is recorded here so it stays a decision rather than a surprise.

## Immediate plan, separate from the architecture work

1. Merge #294. It is correct and needed either way.
2. Test the iPhone install and local-mode offline on the preview URL — neither needs the
   API or Clerk.
3. Do the cloud-offline check on the production domain after #292 merges. Low risk: a
   misbehaving banner is visible at once, and the service worker off switch
   (`window.__unregisterServiceWorkers()`) shipped in the same PR.
4. Build the preview tier as its own piece of work.
