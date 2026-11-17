# Households H5b (invites, join, members) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a household owner or manager can invite a person with a link. The person opens
the link, signs in, and joins. Members are listed, can change role, be removed, or leave.
A person with no household sees a screen that says so and can create one.

**Architecture:** one migration adds the `HouseholdInvite` table and the nullable column
`User.activeHouseholdId`. `requireHousehold` gets a fixed rule for "which household is
mine" when a person is in two. Seven new mutations and three new queries live in a new
`invite.resolver.ts` and in `household.resolver.ts`. Every new mutation publishes the
household-level `LOCATION` live event, which makes every open tab of the household refetch
everything. The web gets `/join/$token`, `/settings/household/members`, a no-household
screen, a sign-in page that returns to the link, and a guard that clears the Apollo cache
when the caller's household changes.

**Tech Stack:** React 19, TanStack Router and Query, Apollo 4, Dexie (web); Express 5, Apollo
Server 4, Prisma 6, Postgres on Neon (server); Clerk (`@clerk/react` ^6.1.0); Vitest,
Playwright, Biome.

**Spec:** [2026-10-04-households-design.md](2026-10-04-households-design.md), sections
*Household roles*, *Data model* (`HouseholdInvite`), *Authorization*, *First sign-in*,
*Invite and join*, *Household roles, removal and leaving*, *Create and delete a household*,
*Screens* (*Desktop*, *Mobile*, *Invite and empty screens*, *Local mode*). H5 plan:
[2026-11-17-households-plan-h5.md](2026-11-17-households-plan-h5.md), sections *H5b —
invites, join, members (outline…)*, *Owner answers (2026-11-17)*, decisions T11 and T12,
*Deploy notes*, *Known gaps*, *What this plan got wrong*. Phase plan:
[2026-10-31-households-plan.md](2026-10-31-households-plan.md), *H5*, *H6*, *H7*.

---

## Global Constraints

Every task brief passes these down (see also *Rules every task brief must pass down* at the
end).

- Local mode has no role checks and no households. Nothing in `apps/web/src/db/` changes.
  Every new screen except the `/join` local-mode notice is cloud only.
- Never write `row.userId === ctx.userId` or `row.householdId === …` as an authorization
  check. Every server check goes through `apps/server/src/lib/authz.ts`. A `where` filter on
  a read is fine.
- Household ladder `member < manager < owner`; location ladder
  `viewer < participant < organizer`. Owner and manager give any location role (design).
- Every new `Mutation` field goes into `publishes` (or `publishesNothing` with a reason) in
  `apps/server/src/resolvers/live-publish.guard.test.ts`. Today: **62** fields, all in
  `publishes`. This plan adds **7**.
- `forgetRolesAroundEach` (`lib/mutationRoleCache.ts`) already clears the location role
  caches around every root mutation field. The new writers of `HouseholdMember` and
  `LocationMember` rows need nothing extra for those caches. They DO need the new
  `householdId` forget (decision T15).
- **Do not break the old-bundle shim.** `apps/server/src/test/oldBundleCompat.test.ts`
  must stay green. This plan only ADDS types, fields, queries and mutations. Do not change
  or remove an existing field, argument or input field. If a task finds it must, stop and
  ask the main session.
- A server schema change that makes an EXISTING web document invalid must go in one
  commit with that document (root `CLAUDE.md`, *`pnpm codegen` is all-or-nothing*). This
  plan adds new fields only, so a new web document may come in a later task than its
  schema. Adding a field never invalidates an existing document.
- Node 22.17.1 (`.node-version`). Node 25 breaks the web suite.
- No database command in a subagent. `prisma migrate dev`, `migrate reset`,
  `verify:migration` and `migrate deploy` against the test database are run **only by the
  main session, only against `TEST_*`, and only with the owner's consent** given after
  Prisma's warning is shown.
- Feature test titles start with `user can …` / `user sees …`. Role tests that really set up
  a role use the role name.
- Location and household names render as stored, never `capitalize`. Person names
  (`displayName`) also render as stored.
- Plain English in every comment, doc, commit and report.

## Review Focus

The cases most likely to hurt a real person first. Each has its test in the task named.

1. **A brand-new person opens an invite link.** They have no Clerk account, no `data-mode`
   key (so the app starts in LOCAL mode), and their first cloud request makes them an empty
   household with an empty catalog. Three things can each send them away from the link:
   the local-mode default, the sign-in page (which always goes to `/`), and the onboarding
   redirect (an empty catalog sends every page to `/onboarding`). Expected: they end on the
   join page, press Join, and land in the inviting household. (G.7 unit tests, G.10 E2E
   with a context that does NOT set `e2e-skip-onboarding`.)
2. **Two people press Join on the same link at the same time.** Expected: one joins, the
   other is told the link is no longer valid. Nobody is added twice. (G.4, decision T17.)
3. **A removed member is invited again with fewer roles.** Expected: they get only the new
   roles. Their old location roles do NOT come back (H5 plan D9, decisions T11 and T20).
   (G.5 unit test, G.10 E2E.)
4. **A person in two households.** Expected: every request uses one household, the same
   one every time, and it is the one they joined last (owner decision O2-A). Their other
   household's data never shows. (G.2, G.10 #381 test.)
5. **The joiner's own browser after Join.** The Apollo cache (memory and the persisted
   `Player1InventoryCloudCache`) and `active-location-id:cloud` still hold the OLD
   household. Expected: no row of the old household shows after the join. (G.7, decision
   T23.)

---

## Summary

### Where this sits

| Phase | State |
|---|---|
| H1, H2 | ✅ merged into `main`, deployed |
| H3a, H3b, H3c-1, H3c-2, H4 | ✅ merged into `develop`, not deployed |
| H5a | ✅ merged into `develop` (#384, merge `4307d30a`, 2026-11-18), not deployed |
| **H5b** | this plan: invites, join, members, the "which household" rule, the no-household screen |
| H5c | the location people page (outline in the H5 plan) |
| H6 | transfer, hand-over, purges, activity log |
| H7 | personal location order, household switch and create from "Switch to…" |

H5a gave the web every role and every read-only view, but nobody can reach a second person
in production: the only way into another household is the E2E-only route
`POST /e2e/household-members`. H5b is the step that makes sharing real.

### Relations

- **Blocked by:** nothing. H5a is merged (#384).
- **Blocks:** H5c (the people page chooses from household members, which only exist after
  H5b), H6 (transfer needs a second member), H7 (the household switch needs a person in two
  households, which H5b creates).
- **Ships with:** H3a–H5a and H5c at the next checkpoint release (H5 decision T13).
- **Deploy order:** the migration deploys with the server, then the web. Server first is
  already the rule for the whole households release (owner decision 2026-11-17, option 4;
  H4 runbook section 8.3). The new bundle selects new queries, so it cannot run on an old
  server.

### What the user gets (once merged AND deployed)

H5b alone, merged and deployed (H5c not yet):

- An owner or manager opens **Members**, presses **Invite**, chooses a household role and,
  for each location, a location role, and copies a link. The link works once, for 7 days,
  and can be revoked until used.
- The invited person opens the link on any device. If the app is in local mode, it says
  that joining uses cloud sync and offers **Sign in to join**. After sign-in or sign-up
  they come back to the link, see the household name, who invited them and their roles,
  and press **Join**. They land on the pantry of the shared household.
- If their own household is still empty (the usual case right after sign-up), it is
  deleted. If it has data, it is kept, and it comes back with H7's "Switch to…".
- Members are listed with their household roles. The owner changes a member to manager or
  back, and removes anyone. A manager removes members. A manager or member can leave.
- A person who left, or was removed, and has no other household sees "You are not in any
  household." and **Create a household**.

What H5b does NOT give: changing a person's location roles after they joined (H5c), moving
between two households (H7), ownership transfer (H6). Until H5c the location roles of a
member are fixed at join time; to change them, remove the person and invite again.

### What the developer gets

| DX gain | Specifics |
|---|---|
| Fewer ways to get it wrong | `requireHousehold` gives one household per person by a fixed rule. Today `ensureHousehold` uses `findFirst` with no `orderBy` (`lib/household.ts:134`, `:151`), so a person in two households would get a random one |
| Fewer ways to get it wrong | One lock order for the whole server: the `User` row before any `Household` row (decision T16), so join, leave and create cannot wait on each other in a cycle |
| A failure that now has a name | `NO_HOUSEHOLD` gets a screen. Today `git grep NO_HOUSEHOLD apps/web/src` finds nothing: a removed person would see empty pages and failing requests |
| A failure that now has a name | A refused join says why: `INVITE_INVALID` or `ALREADY_MEMBER` in `extensions.reason` |
| Real-SQL coverage | The first E2E where a person joins through the real flow, and the first real-SQL test with one person in two households (the #381 test owed by H4) |
| Honest documentation | The "one household per person" comment in `lib/e2eHouseholds.ts` and the `householdId is NOT forgotten` comment in `lib/authz.ts` stop being true; both are rewritten |

**Costs, stated plainly:**

- One more migration (a table and a column), and one more `verify-migration.ts` block. The
  test database must be migrated by hand, with consent.
- `/e2e/cleanup` deletes **19** models instead of 18, and `purge-coverage.test.ts` and
  `cleanup-endpoint.spec.ts` must learn the new one.
- Every invite, join, role change, removal and leave refetches EVERY active query in every
  open tab of the household (household-level `LOCATION`, decision T19). These events are
  rare, so the cost is small, but it is not zero.
- The web gets a second cache guard (`last-household-id`) beside the account guard
  (`LAST_USER_ID_KEY`). One more thing that can reload the page.
- `pnpm test:e2e:all` grows by one cloud spec file.

---

## Facts this plan is built on (checked 2026-11-18 at `770a75e8`)

Line numbers drift. Each task re-reads the code before it trusts a line here.

| Fact | Where |
|---|---|
| `ensureHousehold` reads a person's household with `householdMember.findFirst({ where: { userId } })` and no `orderBy`, twice | `apps/server/src/lib/household.ts:134`, `:151` |
| `NO_HOUSEHOLD` is thrown only when the first sign-in claim is set and no membership exists | `lib/household.ts:74–77`, `:148–158` |
| `requireHousehold` caches the household PROMISE on `ctx.requestCache.householdId`, and `forgetLocationRoles` does NOT forget it. Its comment says "H5b's join will, and must decide then" | `lib/authz.ts:37–46`, `:240–241` |
| `forgetRolesAroundEach` wraps every `Mutation` field and calls `forgetLocationRoles` before and after | `lib/mutationRoleCache.ts:50–68` |
| `lockHousehold` is an `UPDATE` of `Household.updatedAt`, taken FIRST in `deleteLocation` and `clearAllData` | `lib/household.ts:251–256` |
| `User` has `householdSetupAt` and no "active household" column. `HouseholdMember` has `joinedAt` and primary key `(householdId, userId)`; its `user` relation has no `onDelete` (Restrict) | `apps/server/prisma/schema.prisma:320–348`, `:400–411` |
| The design's `HouseholdInvite`: `id`, `householdId`, `token (unique)`, `householdRole`, `locationRoles` (JSON list of `{locationId, role}`), `createdBy`, `expiresAt`, `usedAt?`, `usedBy?`, `revokedAt?`. No such model exists | design, *New models*; `schema.prisma` |
| The newest migration is `20261114000000_shared_carts` | `apps/server/prisma/migrations/` |
| `verify-migration.ts` lists **9** migrations, and its comment says `shared_carts` "must be the LAST entry". It applies `shared_carts` in a fourth `migrate deploy`, after the `finally` that restores every parked migration | `apps/server/scripts/verify-migration.ts:2014–2035`, `:2290–2380` |
| `household { id name role }` is the only household query. One mutation, `renameHousehold` (owner) | `apps/server/src/schema/household.graphql`; `resolvers/household.resolver.ts` |
| The live guard lists **62** `Mutation` fields, all in `publishes`; `publishesNothing` is empty | `resolvers/live-publish.guard.test.ts` |
| `shouldDeliver` checks household membership for a household-level event, with a fresh context per event | `resolvers/live.resolver.ts:46–90` |
| `POST /e2e/household-members` refuses (409) a member who is already in any household, because of the random `findFirst` | `lib/e2eHouseholds.ts:46–62`, `:205–216` |
| `/e2e/cleanup` deletes 18 models in one array `$transaction`, children before parents, and reads owned households by the `owner` member row | `lib/e2eCleanup.ts:38–58`, `:81–155` |
| `/sign-in` always navigates to `/` after sign-in, with no return path | `apps/web/src/routes/sign-in.tsx:13–15` |
| `CloudAuthGuard` sends a signed-out cloud user to `/sign-in` with no search | `apps/web/src/routes/__root.tsx:30–45` |
| The onboarding redirect fires on ANY path except `/onboarding` when items, tags and vendors are all empty, unless `onboarding-dismissed` or `e2e-skip-onboarding` is set | `routes/__root.tsx:74–92`; `routes/shouldRedirectToOnboarding.ts:28` |
| `newUserContext` always sets `e2e-skip-onboarding: true` | `e2e/helpers/userContext.ts`; `e2e/CLAUDE.md` *A browser context can be any user* |
| A new visitor starts in LOCAL mode. Switching to cloud is `localStorage['data-mode'] = 'cloud'` plus a reload; `PostLoginMigrationDialog` opens only when `migration-strategy` is set | `hooks/useDataMode.ts`; `components/settings/DataModeCard/DataModeCard.tsx:322–331`; `PostLoginMigrationDialog.tsx` header |
| `clearCache()` empties the in-memory `cloudCache` and the persisted snapshot; `ApolloWrapper` calls it when a different ACCOUNT signs in. Nothing reacts to a different HOUSEHOLD | `apps/web/src/apollo/persistence.ts:69–88`; `apollo/ApolloWrapper.tsx:96–107` |
| `useHousehold()` returns `{ data, isLoading, isError }` and no error code | `apps/web/src/hooks/useHousehold.ts:31–50` |
| No web code handles `NO_HOUSEHOLD` | `git grep NO_HOUSEHOLD -- apps/web/src` finds nothing |
| The household sidebar has no Members item; its comment says Members (H5) is added by the phase that builds it | `components/global/Sidebar/HouseholdSidebar.tsx:17–25`; `routes/settings/index.tsx` (mobile accordion) |
| `isFullscreenPage` makes `/onboarding` full-screen; nothing knows `/join` | `apps/web/src/lib/layoutRules.ts:36–45` |
| `public/_redirects` and the service worker's `navigateFallback: '/index.html'` serve any path, so `/join/<token>` loads the app | `apps/web/public/_redirects`; `apps/web/vite.config.ts:24` |
| Test baseline at `770a75e8`, Node 22.17.1, load 2.2: server **1840 / 71 files**, all passed. Web **2927 passed, 1 failed / 305 files**. The failure is `routes/shopping/index.stories.test.tsx` › Offline › `shows the OfflineBanner with the seeded sync time` (received "Showing no data"); it passed 3 of 3 runs alone, so it is flaky under load. `scripts/spec` did not run because the web suite failed first | measured by this plan's author |

## Where the design and the outline disagree with the code

| # | The design or outline says | The code today | What this plan does |
|---|---|---|---|
| E1 | Outline: "`requireHousehold` reads `User.activeHouseholdId` when the person is still a member there, else the oldest membership by `joinedAt`, then `householdId`" | There is no column. And `requireHousehold` itself reads nothing: it calls `ensureHousehold`, which does the reads | The rule goes into `ensureHousehold`'s two reads, with ONE query on the common path (decision T14) |
| E2 | Outline: "`requireCatalogRole(ctx, 'member')` now means something" | It already throws `NO_HOUSEHOLD` through `requireHousehold` for a person with no membership. What is new is that a person can REACH that state | No server change for this. G.8 adds the web screen |
| E3 | Outline: "`joinHousehold` in one transaction, `lockHousehold` first" | `joinHousehold` must also write the person's `User` row (`activeHouseholdId`) and may delete their OLD household. With two locks, the order matters | Lock the `User` row first, then the target household (decision T16). Never the reverse anywhere |
| E4 | Outline: "Removal and leaving delete the person's `LocationMember` rows of that household" (T11) | Correct, but rows can also exist from BEFORE T11 (data the E2E route or an H3a-era removal left) | Join also deletes any leftover rows of the joiner in the target household before it writes the invite's roles (decision T20) |
| E5 | Design, *Invite and join*: "Already in this household: the link is not used up" | — | `ALREADY_MEMBER` is checked BEFORE the claim (decision T17). `invitePreview` returns it as a status, so the page says it before the person presses Join |
| E6 | Design, *First sign-in*: "A person who signs up through an invite link gets their own household too, then joins the inviting one" | True: the root component's `useItems` / `useTags` / `useVendors` call `requireCatalogRole`, so the first page load makes the household. But the same empty catalog then triggers the onboarding redirect | The join page is excluded from the onboarding redirect (decision T25). The empty own household is deleted at join (O2-A, decision T21) |
| E7 | Design, *Invite and empty screens*: "No household: **Create a household**". *Create and delete a household*: create is from "Switch to…" (H7) | No `createHousehold` mutation | G.5 adds `createHousehold(name)`, for a person with NO household only (owner decision O16). H7 lifts that limit with "Switch to…" |
| E8 | Outline: `joinHousehold(token)` runs in a transaction | A person with NO household (left, removed) who opens an invite must be able to join. `requireHousehold` throws `NO_HOUSEHOLD` for them | `joinHousehold`, `invitePreview` and `createHousehold` never call `requireHousehold` (decision T22). They use `requireAuth` only |
| E9 | The design's "Known gaps": a household switch must clear the household-scoped Apollo cache, including the persisted one, and set the active location, in one step | Join, leave and removal ARE household switches for the web. Nothing reacts to a household change today | Decision T23: the web stores the last household id and, when `GetHousehold` returns a different one, clears the cache, drops `active-location-id:cloud` and reloads. H7 reuses it |
| E10 | Outline: "`e2eCleanup` deletes the user's memberships in other households already; check that a joined person's own (kept) household is deleted too" | It deletes every household the user OWNS (by the `owner` member row). A kept household is still owned by the person | Nothing to change for the kept household. The new `HouseholdInvite` model needs a statement (G.6) |
| E11 | Brief: "the old-bundle shim must not be broken" | `main`'s bundle never calls the new fields. The new server must still accept `main`'s documents | Additive only. Every server task runs `oldBundleCompat.test.ts`; no task may change an existing field |
| E12 | Outline: each new mutation publishes `LOCATION` at household level | `createHousehold` has no other member, so nobody else would hear it; but the person's OTHER tabs would, and they need it | All 7 publish `LOCATION` (decision T19), including `createHousehold` |

## Gaps folded in from earlier plans

Every gap in the H5 plan (and the plans before it) that names H5b, and where it goes.

| Gap | From | Goes to |
|---|---|---|
| A rule for which household a person is in (D1) | H3a, H5 O2 | **G.2** |
| What happens to a person's own household when they accept an invite | H3a, H5 O2 | **G.4** (O2-A: kept, deleted when empty) |
| A removed member gets `NO_HOUSEHOLD`; the web shows nothing | H3a | **G.8** |
| Re-invite brings old location roles back (D9) | H5 | **G.5** (T11), **G.4** (T20) |
| Invite tokens: random, single use, checked under `lockHousehold` (T12) | H5 | **G.3**, **G.4** |
| O7-A: the owner or manager can copy an open invite link again | H5 | **G.3** (token stored plainly, shown to owner and manager), **G.9** |
| O9-A: Create a household on the no-household screen | H5 | **G.5**, **G.8** |
| O12-A: an invite opened in local mode | H5 | **G.7** |
| `/sign-in` has no return URL | H5 *Facts* | **G.7** |
| `PostLoginMigrationDialog` must stay closed on the join path | H5 outline | **G.7** (the join page never sets `migration-strategy`) |
| The Members item in the household sidebar and the mobile accordion (P4) | phase plan | **G.9** |
| `/e2e/cleanup` must delete invites | H5 outline | **G.6** |
| The #381 real-SQL test with one person in two households | H4 Known gaps, H5 | **G.10** |
| `POST /e2e/household-members` comment: "one household per person" | H3a | **G.6** (rewrite the reasoning; keep the 409 rule) |
| "A removed member's open tab is not told" | H5 Known gaps | Partly closed by **G.7** (the household guard) and **G.8**: the NEXT request shows the right screen. Still nothing pushes it sooner (*Known gaps*) |
| Clerk redirect rules for `/join/*` | H5 Deploy notes | **G.11** (runbook) |

Not folded in, on purpose: changing a member's location roles (H5c), the "No organizer"
fix for deleted accounts (H6), household switch (H7).

---

## Decisions

### Technical decisions (made in this plan)

T11 and T12 are from the H5 plan and are repeated here because H5b builds them.

| # | Decision | Why | Rejected |
|---|---|---|---|
| T11 | **Removing or leaving deletes the person's `LocationMember` rows of that household** in the same transaction as the `HouseholdMember` row | Decision H18 only HIDES a leftover row. A re-invite would bring it back (D9) | Relying on H18 |
| T12 | **Tokens are 32 random bytes, base64url** (`crypto.randomBytes(32).toString('base64url')`, 43 characters). Never logged | Not guessable. A `cuid` is unique, not secret | `cuid()`; a shorter code |
| T14 | **`User.activeHouseholdId String?`**, a foreign key to `Household` with `onDelete: SetNull`. The rule: the active household when the person is still a member there; else the OLDEST membership by `joinedAt`, then `householdId`. ONE query on the common path: `prisma.user.findUnique({ where: { id }, select: { activeHouseholdId: true, householdMemberships: { orderBy: [{ joinedAt: 'asc' }, { householdId: 'asc' }], select: { householdId: true } } } })`. The same rule inside the transaction's `count === 0` branch | O2-A. A fixed order means the same answer on every request. "Oldest" is a stable fallback that needs no write | A `findFirst` with an `orderBy` and a second read for the column (two queries); "newest membership" (a manager added later would silently move a person) |
| T15 | **`forgetRolesAroundEach` also forgets `ctx.requestCache.householdId`** (add `delete cache.householdId` to `forgetLocationRoles`, renamed nowhere; update its comment) | `joinHousehold`, `leaveHousehold`, `removeMember` and `createHousehold` change the answer. A later root field of the same mutation must not read the old household. The forget BEFORE the first field clears an empty cache, so a one-field mutation pays nothing | Each of the four resolvers clearing it by hand: the H5a review replaced that pattern because a source-text guard could not check it |
| T16 | **One lock order: the `User` row, then a `Household` row.** A new `lockUser(tx, userId)` in `lib/household.ts` (an `UPDATE` of `User.updatedAt`, like `lockHousehold`). Only `joinHousehold` and `createHousehold` take it, always first. `removeMember`, `leaveHousehold` and `setHouseholdRole` take `lockHousehold` only and **never write a `User` row** | Two locks taken in different orders by two transactions can wait on each other. Postgres would detect it and abort one with `40P01`, so it would not hang, but a person would see an error | Not locking the user (two joins by one person at once could both pass "not yet a member" checks of different households and both delete the same old household) |
| T17 | **The invite is claimed with a conditional `updateMany`** after the household lock: `where: { id, usedAt: null, revokedAt: null, expiresAt: { gt: now } }`, `data: { usedAt: now, usedById: userId }`. `count === 0` → `INVITE_INVALID`. `ALREADY_MEMBER` is checked BEFORE the claim, so it leaves the link unused | The same claim idea as `householdSetupAt` (decision H1). Under READ COMMITTED the second of two joins re-checks the `WHERE` after the first commits and matches 0 rows | Read the invite, check it, then `update`: two joins can both read "unused" before either writes |
| T18 | **Error shape.** A refused join or invite write uses `BAD_USER_INPUT` with `extensions.reason`: `INVITE_INVALID` (not found, expired, used or revoked: ONE answer for all four, so a caller learns nothing about a token), `ALREADY_MEMBER`, `ALREADY_IN_HOUSEHOLD` (`createHousehold`, owner decision O16). Role refusals stay `FORBIDDEN`. `invitePreview` never throws for a token; it returns `status` | `extensions.reason` is the pattern H4 used (`IMPORT_NEEDS_LOCATION`). One answer for four invalid states stops probing | A different error per state |
| T19 | **All 7 new mutations publish household-level `LOCATION`** (`publishHouseholdChange(ctx, ['LOCATION'], householdId)`), after commit. No new `ChangeKind` | `LOCATION` already refetches every active query (`'all'`), which covers `GetHousehold` (role), `GetLocations` (`myRole`), the members and invites lists. These events are rare | A new `MEMBERS` kind: a schema enum change, a new runner entry and a new test, to save refetches on a rare event |
| T20 | **Join deletes the joiner's leftover `LocationMember` rows in the target household, then writes the invite's roles** | Rows from before T11 (E2E route, an H3a-era removal) must not survive a re-invite | `createMany({ skipDuplicates: true })`: a leftover row with an old, higher role would silently win |
| T21 | **The joiner's old household is deleted at join only when it is empty**, with ONE conditional statement inside the join transaction: `household.deleteMany({ where: { id: { in: otherIds }, members: { every: { userId } }, items: { none: {} }, tags: { none: {} }, tagTypes: { none: {} }, vendors: { none: {} }, recipes: { none: {} }, shelves: { none: {} }, locations: { every: { itemStocks: { none: {} }, inventoryLogs: { none: {} }, carts: { every: { items: { none: {} } } } } } } })`. Locations ("Home"), empty carts and open invites do not make it "not empty". The relation names are those of `schema.prisma` at `770a75e8` (`Location.itemStocks`, `.inventoryLogs`, `.carts`, `Cart.items`); check them again | O2-A. One statement means no gap between "is it empty" and "delete it" in our own code | A count, then a delete (two statements, a wider gap). The remaining risk is stated in *Known gaps* |
| T22 | **`invitePreview`, `joinHousehold` and `createHousehold` never call `requireHousehold`** | A person with no household must be able to preview, join and create. `requireHousehold` throws `NO_HOUSEHOLD` for them | — |
| T23 | **Household-change guard on the web.** A component mounted in the root in cloud mode (in both the Clerk tree and the E2E tree) compares `GetHousehold`'s `household.id` with `localStorage['last-household-id']`. No stored id: store it. A different id: `clearCache()`, remove `active-location-id:cloud`, store the new id, `window.location.reload()`. The join page calls the same function directly after Join | Join, leave and removal change the household under a live cache. The account guard (`LAST_USER_ID_KEY`) does not see it. H7's switch needs the same step | Clearing only in the join handler: misses removal, leave, and the person's other tabs |
| T24 | **`/sign-in?redirect=<path>`.** `safeRedirectPath(raw)` in `apps/web/src/lib/safeRedirect.ts` returns the path only when it starts with `/` and not with `//` or `/\`, else `/`. `CloudAuthGuard` passes the current `pathname + search`. `<SignIn>` gets `forceRedirectUrl` and `signUpForceRedirectUrl` with the same path. Check the two prop names against the installed `@clerk/react` types before you use them | A new person must come back to the link after sign-up, not only after sign-in. A raw `redirect` is an open redirect | `sessionStorage` for the return path: lost when Clerk opens a new tab for e-mail verification |
| T25 | **`/join/$token` is full-screen and is excluded from the onboarding redirect and from `NoHouseholdGate`**: `shouldRedirectToOnboarding` returns `false` when `pathname.startsWith('/join/')`; `isFullscreenPage` returns `true` for it | Review Focus 1. A brand-new person's catalog is empty, so the redirect fires on the join page | Setting `onboarding-dismissed` on the join page: that would also hide onboarding later for a person whose join fails |
| T26 | **One migration, `20261118000000_add_household_invites`.** `HouseholdInvite`: `id String @id @default(cuid())`, `householdId` (FK, `onDelete: Cascade`), `token String @unique`, `householdRole HouseholdRole`, `locationRoles Json` (a list of `{ locationId, role }`, parsed by a checked parser on every read), `createdById` (FK to `User`, no `onDelete`, so Restrict like the member tables), `createdAt @default(now())`, `expiresAt`, `usedAt?`, `usedById?` (FK to `User`, `onDelete: SetNull`), `revokedAt?`, `@@index([householdId])`. `User.activeHouseholdId String?` (FK, `onDelete: SetNull`, `@@index`), with a named relation (`"ActiveHousehold"`), because `User`–`Household` already has `"HouseholdOwner"` | The design's table. `usedById` is history, so losing it when an E2E user is cleaned up is fine. `createdById` follows the member tables' "fail loudly" rule; `/e2e/cleanup` deletes those rows first | A child table for location roles: more joins for no gain, and an invite naming a deleted location must still be readable |
| T27 | **Who sees what.** `householdMembers`: every member (owner decision O13). `householdInvites`: owner and manager; a manager sees only `member` invites (owner decision O15). The `token` is in `householdInvites` only, never in `householdMembers` or `invitePreview` | O7-A keeps the token readable for those who may share it | — |
| T28 | **Expiry is tested with a clock in unit tests, not in E2E.** No E2E route moves time | A route that rewrites `expiresAt` would be one more E2E-only write path | An E2E-only "expire this invite" route |
| T29 | **`POST /e2e/household-members` stays, with its 409 rule.** Only its comment changes: a person CAN be in two households since H5b (through invites), and the rule picks one by T14; the route still refuses, because many specs depend on "the member's first request reads this household" | Changing the route would touch 6 spec files for no gain | Letting the route add a person who has a household |

### Owner decisions (needed before the task that uses them)

O1–O12 were answered on 2026-11-17 (H5 plan, *Owner answers*). H5b uses O2-A, O3-A, O6-A,
O7-A, O9-A and O12-A. These are NEW. **A** is the recommendation unless it says otherwise.

| # | Question | Options | Recommendation | Needed by |
|---|---|---|---|---|
| O13 | What does a household `member` see on the Members page? | **A.** Every person's name and household role, and their own **Leave** button. No e-mail addresses. No invites. **B.** Only their own row and **Leave**. **C.** Everything the owner sees, read-only, including open invites | **A.** Family members know each other, and the list tells a member whom to ask. E-mail stays private. Invites hold secret links | G.5, G.9 |
| O14 | Must an invite give at least one location role? | **A.** No. The invite form lists every location with **No access** pre-selected. A person who joins with none sees "You have no locations in this household yet" (H5a's screen) until H5c lets someone give them a role. **B.** Yes, at least one | **A** matches the design ("optionally, location roles"). But note: until H5c, a member who joined with no location role can only get one by being removed and invited again. If you expect that often, choose **B** | G.3, G.9 |
| O15 | Who may revoke an open invite? | **A.** The owner revokes any invite. A manager revokes only `member` invites (the kind a manager may create). **B.** Owner and manager revoke any invite | **A.** It mirrors O3-A: a manager cannot make a manager, so they should not cancel one the owner made either | G.3, G.9 |
| O16 | `createHousehold` in H5b: who may use it? | **A.** Only a person who is in NO household (the no-household screen). Anyone else gets `ALREADY_IN_HOUSEHOLD`. H7 adds "Switch to… › Create new" for everyone. **B.** Anyone, now. They become active in the new household, with no way back to the old one until H7 | **A.** With B a person could strand their own data in a household they cannot switch back to | G.5, G.8 |
| O17 | The new texts. English first, then the first `tw` version (the owner corrects `tw` in the PR) | See the table below | Approve, or give the words you prefer | G.7, G.8, G.9 |

### Owner answers (2026-11-18)

| # | Answer | Note |
|---|---|---|
| O13 | **A** | |
| O14 | **A** | The owner asked whether an invite can give a location role. Yes: the invite form lists every location with a role picker (design, *Invite and join*, step 1). O14 only decides that no role is REQUIRED |
| O15 | **A** | The owner asked for the rule that matches the other role rules. **A** follows the same line as inviting (O3-A) and removing (design, *Household roles*): a manager acts only on `member`, the owner on anyone. Confirmed by the owner |
| O16 | **A** | |
| O17 | deferred | The owner reviews the texts later, in the PR. Tasks use the table below as written |

**O17 texts (proposed).** Role names reuse the O11 answers: 據點王 organizer, 搬運工
participant, 圍觀的 viewer, 擁有者 owner, 管理者 manager, 成員 member.

| Key (proposed) | English | `tw` |
|---|---|---|
| `settings.household.members.title` | Members | 成員 |
| `…members.you` | (you) | （你） |
| `…members.invite` | Invite someone | 邀請成員 |
| `…members.inviteRole` | Household role | 家庭角色 |
| `…members.inviteLocations` | Location roles | 據點角色 |
| `…members.noAccess` | No access | 無權限 (O11 text) |
| `…members.createLink` | Create invite link | 建立邀請連結 |
| `…members.copyLink` | Copy link | 複製連結 |
| `…members.copied` | Link copied | 已複製連結 |
| `…members.linkNote` | Anyone with this link can join once, until {{date}}. | 任何拿到這個連結的人都可以加入一次，期限到 {{date}}。 |
| `…members.openInvites` | Open invites | 尚未使用的邀請 |
| `…members.revoke` | Revoke | 撤銷 |
| `…members.remove` | Remove | 移除 |
| `…members.removeConfirm` | Remove {{name}} from this household? They lose access to all its locations. | 要把 {{name}} 移出這個家庭嗎？他會失去所有據點的權限。 |
| `…members.leave` | Leave household | 離開家庭 |
| `…members.leaveConfirm` | Leave this household? You lose access to all its locations. | 要離開這個家庭嗎？你會失去所有據點的權限。 |
| `…members.ownerCannotLeave` | The owner cannot leave. Handing over the household comes in a later version. | 擁有者不能離開。轉讓家庭的功能之後才會有。 |
| `join.title` | Join {{household}} | 加入 {{household}} |
| `join.invitedBy` | {{name}} invited you. | {{name}} 邀請了你。 |
| `join.yourRoles` | Your roles | 你的角色 |
| `join.join` | Join | 加入 |
| `join.alreadyMember` | You are already in this household. | 你已經在這個家庭裡了。 |
| `join.invalid` | This invite is no longer valid. Ask for a new one. | 這個邀請已經失效，請再要一個新的。 |
| `join.needsCloud` | Joining a household uses cloud sync. Your data on this device stays here and is not copied. | 加入家庭需要使用雲端同步。這台裝置上的資料會留在這裡，不會被複製。 |
| `join.signIn` | Sign in to join | 登入以加入 |
| `join.ownDataKept` | Your own household has data, so it is kept. You can go back to it in a later version. | 你自己的家庭有資料，所以會保留。之後的版本可以切換回去。 |
| `noHousehold.title` | You are not in any household. | 你目前不在任何家庭裡。 |
| `noHousehold.create` | Create a household | 建立家庭 |
| `noHousehold.nameLabel` | Household name | 家庭名稱 |

---

## File map

| File | Task | Change |
|---|---|---|
| `apps/server/prisma/schema.prisma` | G.1 | `HouseholdInvite`; `User.activeHouseholdId` and the named relations |
| `apps/server/prisma/migrations/20261118000000_add_household_invites/migration.sql` | G.1 | new |
| `apps/server/scripts/verify-migration.ts` | G.1 | the new entry in `MIGRATIONS`; a new assertion block |
| `apps/server/src/test/householdFake.ts` (and `userFake.ts`) | G.1, G.2 | model the new column and the invite store |
| `apps/server/src/lib/household.ts` | G.2, G.4, G.5 | the T14 rule in `ensureHousehold`; `lockUser`; `createHousehold`'s writes |
| `apps/server/src/lib/authz.ts` | G.2 | `forgetLocationRoles` forgets `householdId` (T15) |
| `apps/server/src/lib/invite.ts` | G.3, G.4 | new: token, `parseLocationRoles`, the empty-household `where` |
| `apps/server/src/schema/household.graphql` | G.3, G.5 | invite and member types, queries, mutations |
| `apps/server/src/resolvers/invite.resolver.ts` | G.3, G.4 | new |
| `apps/server/src/resolvers/household.resolver.ts` | G.5 | members, roles, remove, leave, create |
| `apps/server/src/resolvers/index.ts` | G.3 | register the invite resolvers (inside `forgetRolesAroundEach`) |
| `apps/server/src/resolvers/live-publish.guard.test.ts` | G.3–G.5 | 7 new entries |
| `apps/server/src/lib/e2eCleanup.ts`, `purge-coverage.test.ts`, `e2eCleanup.test.ts`, `lib/e2eHouseholds.ts` | G.6 | invites in cleanup; comment |
| `e2e/tests/cleanup-endpoint.spec.ts`, `e2e/helpers/cloudUsers.ts` | G.6 | the 19th model; invite helpers |
| `apps/web/src/apollo/operations/household.graphql` | G.7–G.9 | new documents |
| `apps/web/src/lib/safeRedirect.ts`, `routes/sign-in.tsx`, `routes/__root.tsx`, `routes/shouldRedirectToOnboarding.ts`, `lib/layoutRules.ts` | G.7 | return path; join exclusions |
| `apps/web/src/routes/join/$token.tsx` | G.7 | new |
| `apps/web/src/apollo/householdGuard.ts` (+ component) | G.7 | T23 |
| `apps/web/src/hooks/useHousehold.ts` | G.8 | `errorCode` |
| `apps/web/src/components/household/NoHouseholdGate/`, `NoHouseholdScreen/` | G.8 | new |
| `apps/web/src/routes/settings/household/members.tsx` (+ `members/index.tsx` if the folder pattern needs it) | G.9 | new |
| `apps/web/src/components/household/MemberList/`, `InviteDialog/`, `InviteList/` | G.9 | new |
| `HouseholdSidebar.tsx`, `routes/settings/index.tsx` | G.9 | the Members item (cloud only) |
| `apps/web/src/i18n/locales/en.json`, `tw.json` | G.7–G.9 | O17 texts |
| `apps/web/src/apollo/liveUpdates.ts` | G.9 | comment-table rows for the new queries |
| `e2e/tests/household-invites.spec.ts`, `e2e/pages/MembersPage.ts`, `e2e/pages/JoinPage.ts`, `e2e/helpers/userContext.ts`, `e2e/playwright.config.ts` | G.10 | new spec and page objects |
| root `CLAUDE.md`, `e2e/CLAUDE.md`, `apps/server/prisma/CLAUDE.md`, `apps/web/src/hooks/CLAUDE.md`, `apps/web/src/routes/CLAUDE.md`, `apps/web/src/routes/settings/CLAUDE.md`, the design, the phase plan, the H5 plan, `docs/INDEX.md`, the H4 runbook | G.11 | docs and deploy |

---

## Task G.1 — migration: `HouseholdInvite` and `User.activeHouseholdId`

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/20261118000000_add_household_invites/migration.sql`
- Modify: `apps/server/scripts/verify-migration.ts`
- Modify: `apps/server/src/test/householdFake.ts`, `userFake.ts` (and their `.test.ts`): the
  new column and an invite store. Read both fakes first; add only what G.2–G.5 need, with
  contract tests

**Interfaces:**
- Produces (Prisma): `model HouseholdInvite` and `User.activeHouseholdId` as decision T26.

- [ ] **Step 1: Read** `apps/server/prisma/CLAUDE.md` in full, and `verify-migration.ts`
  lines 2000–2400. Note the comment that `shared_carts` "must be the LAST entry".
- [ ] **Step 2: Write the schema** (T26). On `User`: `activeHouseholdId String?`,
  `activeHousehold Household? @relation("ActiveHousehold", fields: [activeHouseholdId],
  references: [id], onDelete: SetNull)`, `@@index([activeHouseholdId])`,
  `invitesCreated HouseholdInvite[] @relation("InviteCreatedBy")`,
  `invitesUsed HouseholdInvite[] @relation("InviteUsedBy")`. On `Household`:
  `activeFor User[] @relation("ActiveHousehold")`, `invites HouseholdInvite[]`. A comment on
  each new field saying WHY (copy the reasons from T14 and T26).
- [ ] **Step 3: Write `migration.sql` by hand**, not with `migrate dev` (a subagent runs no
  database command). Generate the SQL with
  `pnpm --filter server exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`
  ONLY if it needs no database (it needs a shadow database; if it asks for one, write the
  SQL by hand from the shape of `20261031000000_add_user` and `20261104000000_add_households`).
  It is additive: `CREATE TABLE "HouseholdInvite"`, its unique index on `token`, its index on
  `householdId`, three foreign keys, `ALTER TABLE "User" ADD COLUMN "activeHouseholdId" TEXT`,
  its index and foreign key. **No backfill and no `RAISE` guard**: the column is nullable
  and every existing person falls back to their oldest membership (T14). Say that in the SQL
  comment, in data terms (prisma `CLAUDE.md`, *Adding a NULLABLE column*). Every statement
  references only objects an earlier COMMITTED migration created.
- [ ] **Step 4: `verify-migration.ts`.** Add `'20261118000000_add_household_invites'` to
  `MIGRATIONS` after `shared_carts`. Change the comment that says `shared_carts` must be the
  LAST entry: it must be the last entry that is applied BEFORE the fourth deploy; the new
  one is restored by `restoreIfParked` in `finally` and applied by the same fourth
  `migrate deploy`. Re-read `main()` and confirm that is what happens. Add
  `assertHouseholdInvites()`, called after `assertSharedCarts()`:
  1. the table exists with the design's columns (read `information_schema`, `::text` casts);
  2. `token` has a UNIQUE index (insert two rows with one token: the second fails with
     `23505`);
  3. `User.activeHouseholdId` is `text`, nullable, and every pre-existing `User` row reads
     `NULL`;
  4. the column is NOT on `HouseholdMember` (the "two halves" rule);
  5. deleting a household sets `activeHouseholdId` to `NULL` (SetNull) and deletes its
     invites (Cascade);
  6. deleting a `User` that `usedById` names sets it to `NULL`; deleting a `User` that
     `createdById` names FAILS (`23503`). Clean up the rows each check writes.
  Re-read every earlier assertion: a later migration can kill one (prisma `CLAUDE.md`).
- [ ] **Step 5: Fakes.** `userFake`: `activeHouseholdId` and a `findUnique` that can
  `select` `householdMemberships` with `orderBy` (model the order, do not hardcode it).
  `householdFake`: a `householdInvite` store with `create`, `findUnique` (by `id` and by
  `token`), `findMany`, `updateMany` (applies `where` key by key, including
  `expiresAt: { gt }` and `null` matches, and returns a count), registered with
  `runInTransaction`. It THROWS on a `where` key it does not know (root `CLAUDE.md`, *Write
  test doubles to model the constraint*). It returns copies. A contract test for each row
  of that list, including "a second row with the same token raises `P2002`".
- [ ] **Step 6: Gate** (root `CLAUDE.md`, *Verification Gate*). `pnpm build` regenerates the
  Prisma client. Commit `feat(households): household invites table and active household column`.
- [ ] **Step 7 (MAIN SESSION ONLY, with the owner's consent):** run `verify:migration`
  against `TEST_*` (prisma `CLAUDE.md`, *How to run it*: absolute `--env-file`, show
  Prisma's AI warning, get a "yes" AFTER it, pass that text in
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`). Record the count of `ok —` lines and
  `FAIL:` lines in this plan. The script leaves the test database fully migrated, which the
  cloud E2E of G.10 needs. **A subagent never runs this.**

**Mutation checks** (copy the file aside first; restore from the copy; never
`git checkout --`):
- `householdFake.householdInvite.updateMany` ignores `expiresAt` → its contract test goes red.
- The fake allows a second row with the same token → its contract test goes red.
- (main session, Step 7, optional) `ON DELETE SET NULL` changed to `CASCADE` on
  `activeHouseholdId` → assertion 5 fails. Only if the owner agrees to a second run.

**The brief must pass down:** no database command; the consent rule; the "two halves" rule;
"re-read every earlier assertion"; the fake rules (throw on an unknown key, return copies,
register with `runInTransaction`).

---

## Task G.2 — server: the "which household" rule

**Files:**
- Modify: `apps/server/src/lib/household.ts` (`ensureHousehold`), `apps/server/src/lib/authz.ts`
  (`forgetLocationRoles` and its comment), `apps/server/src/lib/mutationRoleCache.ts` (comment
  only)
- Test: `apps/server/src/lib/household.test.ts`, `lib/mutationRoleCache.test.ts`,
  `lib/authz.test.ts`

**Interfaces:**
- Consumes: G.1's column and fakes.
- Produces: `ensureHousehold(userId, language, now?)` with the T14 rule. Same signature.

- [ ] **Step 1: Failing tests** in `household.test.ts`, with one person P in TWO households
  H1 (joined first) and H2 (joined later), and a second person Q:
  - `a person in two households gets the active one` → `activeHouseholdId = H2` → H2.
  - `a person whose active household they left gets the oldest membership` →
    `activeHouseholdId = H3` (no member row there) → H1.
  - `a person with no active household gets the oldest membership` → `null` → H1.
  - `two memberships with the same joinedAt are ordered by householdId` → the smaller id.
  - `the common path costs one query` → spy: exactly one `user.findUnique`, no
    `householdMember.findFirst`.
  - `the count === 0 branch uses the same rule` (the claim is already set, the first read
    found nothing because the membership was added in between) → the active one.
  - `NO_HOUSEHOLD` still thrown with the claim set and no membership (existing test; keep).
  - Q's rows never change P's answer (the second person rule of the design's *Testing notes*).
- [ ] **Step 2: Run** `pnpm --filter server exec vitest run src/lib/household.test.ts` →
  FAIL.
- [ ] **Step 3: Implement.** One private function, `pickHousehold(row)`, used by both
  reads, so the two cannot drift. Keep the claim the first statement of the transaction.
  Update the long comment above `ensureHousehold` ("THE COMMON PATH: ONE QUERY" stays
  true). `verify-migration.ts` copies only the claim `updateMany`, which does not change; say
  so in the comment.
- [ ] **Step 4: T15.** Failing test in `mutationRoleCache.test.ts`: a fake mutation field
  sets `ctx.requestCache.householdId`, a second field reads it → the second sees no cached
  value. Then add `delete cache.householdId` to `forgetLocationRoles`, and rewrite its
  comment (the line "H5b's join will, and must decide then" is now decided). Also a test
  that a ONE-field mutation still reads the household once (the forget before the field
  clears an empty cache).
- [ ] **Step 5: Run** `pnpm test:server` → PASS. Run `oldBundleCompat.test.ts` by name and
  confirm it is green.
- [ ] **Step 6: Mutation checks**:
  - `pickHousehold` ignores `activeHouseholdId` → "gets the active one" red.
  - `pickHousehold` returns the active id without checking membership → "left their active
    household" red.
  - `orderBy` removed → the `joinedAt` test red (the fixture must have H1 created AFTER H2
    in the store but with an EARLIER `joinedAt`, or the store order hides it).
  - the `count === 0` branch keeps its old `findFirst` → its test red.
  - `delete cache.householdId` removed → the T15 test red.
- [ ] **Step 7: Gate**, commit `feat(households): one fixed household per request`.

**The brief must pass down:** a fixture where store order and `joinedAt` order DIFFER (or
the `orderBy` mutation stays green); the second-person rule; `verify-migration.ts` copies
the claim, so the claim must not change.

---

## Task G.3 — server: create, list, preview and revoke invites

**Files:**
- Create: `apps/server/src/lib/invite.ts` (+ `invite.test.ts`),
  `apps/server/src/resolvers/invite.resolver.ts`, `invite.resolver.test.ts`
- Modify: `apps/server/src/schema/household.graphql`, `apps/server/src/resolvers/index.ts`,
  `apps/server/src/resolvers/live-publish.guard.test.ts`, `apps/server/src/context.ts` (only if
  a new cache entry is needed; it should not be)

**Interfaces (schema):**

```graphql
enum InviteStatus { VALID ALREADY_MEMBER INVALID }

type InviteLocationRole { locationId: ID!, locationName: String!, role: LocationRole! }

type HouseholdInvite {
  id: ID!
  # The secret link part. Only in householdInvites, for owner and manager (O7-A).
  token: String!
  householdRole: HouseholdRole!
  # Only locations that still exist in the household.
  locationRoles: [InviteLocationRole!]!
  createdByName: String!
  expiresAt: String!
}

type InvitePreview {
  status: InviteStatus!
  # All null when status is INVALID.
  householdName: String
  invitedByName: String
  householdRole: HouseholdRole
  locationRoles: [InviteLocationRole!]
}

input InviteLocationRoleInput { locationId: ID!, role: LocationRole! }

extend type Query {
  householdInvites: [HouseholdInvite!]!
  invitePreview(token: String!): InvitePreview!
}

extend type Mutation {
  createInvite(householdRole: HouseholdRole!, locationRoles: [InviteLocationRoleInput!]!): HouseholdInvite!
  revokeInvite(id: ID!): Boolean!
}
```

Dates are `String!` in this schema (`Location.createdAt: String!`, `location.graphql:5`), so `expiresAt` is `String!` too, in the same format the existing resolvers send.

- [ ] **Step 1: `lib/invite.ts` unit tests, then code.** `newInviteToken()` (T12: 43
  characters, base64url alphabet, two calls differ). `parseLocationRoles(json: unknown)`:
  returns `{ locationId, role }[]` or throws a plain `Error` naming the problem; refuses a
  non-array, an unknown role, a duplicate id. `INVITE_LIFETIME_DAYS = 7` (O6-A).
  `inviteInvalid()`, `alreadyMember()` error builders (T18).
- [ ] **Step 2: Failing resolver tests** in `invite.resolver.test.ts`. Fixture: household H
  with owner O, manager M, member B, locations K and G; household X with its own owner Y
  and location Z. Use `householdFake`, `userFake`, `stockFake`.
  - `household owner can create a manager invite with location roles` → a row with
    `householdRole: manager`, `locationRoles` `[K organizer]`, `expiresAt` = now + 7 days
    (inject the clock), a 43-character token.
  - `household manager can create a member invite` → OK.
  - `household manager cannot create a manager invite` → `FORBIDDEN` (O3-A).
  - `household member cannot create an invite` → `FORBIDDEN`.
  - `an invite for owner is refused` → `BAD_USER_INPUT`.
  - `an invite naming another household's location is refused` → Z → `FORBIDDEN`, nothing
    written. (Use `requireLocationInHousehold`, or one scoped `location.findMany`; never
    compare a `householdId` in code.)
  - `an invite naming a location twice is refused` → `BAD_USER_INPUT`.
  - `an invite with no location roles is accepted` (O14-A; if the owner chooses B, this
    test flips to `BAD_USER_INPUT`).
  - `householdInvites lists only open invites` → used, revoked and expired ones are left out.
  - `household manager sees only member invites` (O15-A / T27).
  - `household member cannot list invites` → `FORBIDDEN`.
  - `householdInvites leaves out a location deleted since` → K deleted → its entry gone.
  - `invitePreview` for VALID (names, roles), for ALREADY_MEMBER (B previews H's invite),
    and INVALID for: unknown token, used, revoked, expired. INVALID carries NO household
    name.
  - `invitePreview works for a person with no household` (T22): a user whose claim is set
    and who has no membership → VALID, and `ensureHousehold` is not called (spy).
  - `owner can revoke any invite`; `manager can revoke a member invite`; `manager cannot
    revoke a manager invite` (O15-A); `member cannot revoke`; `revoking another household's
    invite is FORBIDDEN`; `revoking twice returns false the second time`.
  - Live events: `createInvite` and `revokeInvite` each publish `LOCATION` once for H, and
    a refused call publishes nothing (the pattern of `location-live-publish.resolver.test.ts`).
- [ ] **Step 3: Run** the file → FAIL.
- [ ] **Step 4: Implement.** `createInvite`: `requireHousehold`, `requireHouseholdRole(ctx,
  h, 'manager')`, then the O3-A rule (a `manager` caller asking for `manager` →
  `FORBIDDEN`), parse and check the locations, write. No `lockHousehold`: one `INSERT`
  needs none. `revokeInvite`: one conditional `updateMany` (`where: { id, householdId: h,
  usedAt: null, revokedAt: null }`, plus `householdRole: 'member'` when the caller is a
  manager) → `count === 1`. A `where` filter is fine; it is not a comparison in code.
  `invitePreview`: `requireAuth` only. Read by token, decide the status, then read the
  caller's membership in that household with ONE `householdMember.findUnique`.
  Register the resolvers in `resolvers/index.ts` so the `Mutation` map stays inside
  `forgetRolesAroundEach`. Add both mutations to `publishes` with `['LOCATION']`.
- [ ] **Step 5: Run** the file, `pnpm test:server`, and `oldBundleCompat.test.ts` → PASS.
  Run `pnpm codegen` and check the output, not the log:
  `grep -c InvitePreview apps/server/src/generated/graphql.ts`.
- [ ] **Step 6: Mutation checks**:
  - the O3-A check removed → "manager cannot create a manager invite" red.
  - `householdInvites` without the manager filter → T27 test red.
  - `invitePreview` returns the household name for INVALID → its test red.
  - `invitePreview` calls `requireHousehold` → the T22 test red.
  - `expiresAt: { gt: now }` dropped from the list filter → "lists only open invites" red.
  - `revokeInvite` without `householdId` in the `where` → the other-household test red.
- [ ] **Step 7: Gate**, commit `feat(households): create, list, preview and revoke invites`.

**The brief must pass down:** T18 (one answer for four invalid states); T22; a role test
always has a second person with a different role and a location the caller has no role on;
the live guard; never compare a `householdId` in code; the old-bundle shim; inject the clock.

---

## Task G.4 — server: `joinHousehold`

**Files:**
- Modify: `apps/server/src/schema/household.graphql`, `resolvers/invite.resolver.ts`,
  `lib/household.ts` (`lockUser`), `lib/invite.ts` (`emptyHouseholdWhere`)
- Test: `resolvers/invite-join.resolver.test.ts` (new), `lib/household.test.ts`

**Interfaces:**

```graphql
extend type Mutation {
  # Join the household of this invite. Refused with BAD_USER_INPUT and
  # extensions.reason INVITE_INVALID or ALREADY_MEMBER.
  joinHousehold(token: String!): Household!
}
```

- [ ] **Step 1: Failing tests.** Fixture as G.3, plus person P with their OWN household HP
  (owner, location "Home", nothing else), and person R with their own household HR that has
  one item.
  - `user can join a household with an invite` → P joins H with `member` + `[K participant]`:
    a `HouseholdMember` row (member), a `LocationMember` row (K, participant), the invite's
    `usedAt` and `usedById` set, `P.activeHouseholdId = H`. The answer is
    `{ id: H, name, role: member }`.
  - `joining deletes the joiner's own household when it is empty` → HP is gone, and its
    "Home" and P's organizer row with it.
  - `joining keeps the joiner's own household when it has data` → R joins: HR stays, R is
    still its owner, R now in two households, `R.activeHouseholdId = H`.
  - One test per thing that makes a household "not empty" (T21): an item, a tag, a tag
    type, a vendor, a recipe, a shelf, a stock row, a log, a cart ROW, and a second member.
    Each one alone keeps it. An empty cart and an open invite do NOT keep it.
  - `an invite location deleted since is skipped` → G deleted after the invite was made →
    only K's row is written, no error.
  - `joining replaces leftover location roles` (T20) → P has an old `organizer` row on G
    with no household membership (an H18 leftover); the invite gives only K → after the
    join P has NO row on G.
  - `already in this household` → B joins with an H invite → `ALREADY_MEMBER`, the invite
    stays unused (T17), nothing written.
  - `expired, used, revoked and unknown tokens give INVITE_INVALID` → four tests, one
    `extensions.reason`, nothing written.
  - `the second of two joins on one link is refused` → simulate: claim the invite between
    the read and the claim (the fake's `updateMany` sees `usedAt` set) → `INVITE_INVALID`,
    no member row.
  - `a person with no household can join` (T22) → claim set, no membership → joins;
    `ensureHousehold` not called.
  - `the user lock is taken before the household lock` (T16) → spy on the order of the two
    `UPDATE`s: `user.update` then `household.update`.
  - `a refused join rolls back` → force the `LocationMember` write to throw → no member row,
    invite still unused (`runInTransaction` restores both).
  - Live: one `LOCATION` event for H after the commit; none for a refusal; none for the
    deleted HP.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, inside one interactive `prisma.$transaction`, in this order:
  1. `lockUser(tx, userId)` (T16).
  2. Read the invite by token. None → `INVITE_INVALID`.
  3. `lockHousehold(tx, invite.householdId)`.
  4. `householdMember.findUnique` for the caller in that household → `ALREADY_MEMBER`.
  5. The claim (T17). `count === 0` → `INVITE_INVALID`.
  6. `householdMember.create` with the invite's role.
  7. Delete the caller's `LocationMember` rows on the target household's locations (T20);
     then create one row per invite location that still exists in that household (one
     scoped `location.findMany` with `{ id: { in }, householdId }`).
  8. `user.update` → `activeHouseholdId` (the User lock is already held; no new lock).
  9. `household.deleteMany(emptyHouseholdWhere(userId, otherHouseholdIds))` (T21). Put the
     `where` in `lib/invite.ts` with a comment listing what "empty" means and why each
     relation is there. Check every relation name against `schema.prisma`.
     **The shared fakes must model this `where`**: a household store that can answer
     `members: { every }`, the six catalog `none`s and the nested location `every` by
     reading the other stores. A fake that ignores a key passes against a `where` that
     forgot it, so it must THROW on a key it does not model, with a contract test per key.
  After the transaction: `publishHouseholdChange(ctx, ['LOCATION'], target)`. Add
  `joinHousehold` to `publishes`. `forgetRolesAroundEach` clears the role caches and, since
  G.2, the household id.
  Copy `lockUser`'s `UPDATE` reasoning from `lockHousehold`'s comment. The Prisma fake has no
  row lock, so the unit tests prove only the ORDER; say so in the comment.
- [ ] **Step 4: Run** the file, `pnpm test:server`, `oldBundleCompat.test.ts` → PASS.
- [ ] **Step 5: Mutation checks**:
  - the claim without `usedAt: null` → "second of two joins" red.
  - `ALREADY_MEMBER` checked after the claim → "invite stays unused" red.
  - T20's delete removed → "replaces leftover location roles" red.
  - the empty check without `items: { none: {} }` → the item test red. Repeat for `itemStocks`
    (a nested relation) and for `members: { every … }`: three separate mutations, each red.
  - `lockUser` moved after `lockHousehold` → the order test red.
  - `activeHouseholdId` not written → the join test red.
- [ ] **Step 6: Gate**, commit `feat(households): join a household with an invite`.

**The brief must pass down:** the transaction order above and why; T16 and "never write a
User row after a household lock without already holding the User lock"; one test per
"not empty" relation (a fixture with only an item cannot catch a dropped `itemStocks` check);
the claim pattern from `ensureHousehold`; the fake has no row lock; live guard.

---

## Task G.5 — server: members, roles, remove, leave, create

**Files:**
- Modify: `apps/server/src/schema/household.graphql`, `resolvers/household.resolver.ts`,
  `lib/household.ts` (`createHouseholdFor`, sharing `createFirstLocation` and
  `firstSignInNames`)
- Test: `resolvers/household-members.resolver.test.ts` (new), `household.resolver.test.ts`

**Interfaces:**

```graphql
type HouseholdPerson {
  userId: ID!
  displayName: String!
  role: HouseholdRole!
  joinedAt: String!
  isMe: Boolean!
}

extend type Query {
  householdMembers: [HouseholdPerson!]!   # every member (O13-A); owner first, then by joinedAt
}

extend type Mutation {
  setHouseholdRole(userId: ID!, role: HouseholdRole!): HouseholdPerson!  # owner; member <-> manager
  removeMember(userId: ID!): Boolean!       # owner: anyone but self; manager: members only
  leaveHousehold: Boolean!                  # manager or member; owner refused
  createHousehold(name: String): Household! # only with no household (O16-A)
}
```

No e-mail in `HouseholdPerson` (O13-A). Name it `HouseholdPerson`, not `HouseholdMember`,
so it is not confused with the Prisma model in generated code.

- [ ] **Step 1: Failing tests.** Fixture: H with owner O, managers M1 and M2, members B1 and
  B2; B1 is `participant` of K and `viewer` of G; household X with owner Y.
  - `householdMembers` lists all five for B1 (O13-A), owner first, `isMe` true only on B1;
    Y gets X's list, never H's.
  - `household owner can make a member a manager and back`; `manager cannot change a role`
    → `FORBIDDEN`; `the owner's own role cannot be changed` and `role owner is refused` →
    `BAD_USER_INPUT`; a target outside H → `FORBIDDEN`.
  - `household owner can remove a manager`; `manager can remove a member`; `manager cannot
    remove another manager or the owner` → `FORBIDDEN`; `owner cannot remove themself` →
    `BAD_USER_INPUT`; `member cannot remove anyone` → `FORBIDDEN`.
  - `removing deletes the person's location roles in that household` (T11) → B1's K and G
    rows gone; B1's location row in ANOTHER household (give B1 a second household HB1 with
    a role) stays.
  - `a removed member's next request uses their other household or NO_HOUSEHOLD` → with HB1:
    `ensureHousehold` gives HB1; without: `NO_HOUSEHOLD`.
  - `removal does not write the removed person's User row` (T16) → spy.
  - `household member can leave`; `manager can leave`; `owner cannot leave` →
    `BAD_USER_INPUT`; leaving deletes the leaver's location rows in H only (T11).
  - `user with no household can create one` → claim set, no membership → a household named
    as given (trimmed, `cleanHouseholdName`), owner row, "Home" (`firstLocationName`),
    organizer row, `activeHouseholdId` set. With `name: null` → `firstSignInNames`.
  - `user in a household cannot create another` → `ALREADY_IN_HOUSEHOLD` (O16-A).
  - `two creates at once make one household` → the second, run after the first has
    committed, gets `ALREADY_IN_HOUSEHOLD` (the user lock serialises them on real Postgres;
    the fake proves the check comes after the lock).
  - Live: each of the four mutations publishes `LOCATION` once for its household after
    commit; a refusal publishes nothing. `leaveHousehold` publishes to the household LEFT.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `setHouseholdRole`, `removeMember`, `leaveHousehold`: one
  transaction each, `lockHousehold` first, then the role checks (read the caller's and the
  target's member rows; use `requireHouseholdRole` for the caller), then the writes. Delete
  `LocationMember` with `where: { userId: target, location: { householdId } }`, then the
  `HouseholdMember` row. Do not touch `User` (T16). `createHousehold`: `requireAuth`,
  transaction with `lockUser` first, `householdMember.count({ where: { userId } }) > 0` →
  `ALREADY_IN_HOUSEHOLD`, then the same writes as first sign-in (reuse
  `createFirstLocation`; do NOT copy it), plus `activeHouseholdId`. Add all four to
  `publishes` with `['LOCATION']`. The guard should now count **69** fields.
- [ ] **Step 4: Run** the file, `pnpm test:server`, `oldBundleCompat.test.ts` → PASS.
- [ ] **Step 5: Mutation checks**:
  - the manager rule in `removeMember` dropped (any role may remove) → "manager cannot remove
    another manager" red.
  - T11's `locationMember.deleteMany` removed → "removing deletes the person's location
    roles" red.
  - the `householdId` filter dropped from that delete → the HB1 row test red.
  - `createHousehold` without the membership check → O16-A test red.
  - `householdMembers` without its household filter → Y's test red.
- [ ] **Step 6: Gate**, commit `feat(households): members, roles, leave and create`.

**The brief must pass down:** T11, T16, O13-A, O16-A; a fixture where the removed person
has a location row in a SECOND household (otherwise a delete with no household filter
passes); reuse `createFirstLocation`; live guard count is 69 after this task (measure it).

---

## Task G.6 — E2E support: cleanup and helpers

**Files:**
- Modify: `apps/server/src/lib/e2eCleanup.ts`, `e2eCleanup.test.ts`,
  `apps/server/src/resolvers/purge-coverage.test.ts`, `apps/server/src/lib/e2eHouseholds.ts`
  (comment only, T29)
- Modify: `e2e/tests/cleanup-endpoint.spec.ts`, `e2e/helpers/cloudUsers.ts`

- [ ] **Step 1:** add `householdInvites` to `CLEANUP_MODEL_KEYS` and one statement BEFORE
  `householdMember` and `household`:
  `prisma.householdInvite.deleteMany({ where: { OR: [{ householdId: owned }, { createdById: userId }] } })`.
  Before `household`, because `householdId` is `ON DELETE CASCADE` and the count would read 0.
  Before `user`, because `createdById` is Restrict (T26). Update the "18 statements" comment.
- [ ] **Step 2:** `e2eCleanup.test.ts` and `purge-coverage.test.ts`: the new model and its
  allowed filter text. `cleanup-endpoint.spec.ts`: seed one invite (through `createInvite`
  with `makeGql`) and assert its count is at least 1.
- [ ] **Step 3:** `cloudUsers.ts`: `createInvite(request, ownerId, householdRole,
  locationRoles)` returning the token, and `joinHousehold(request, userId, token)`, both
  through `makeGql`. They call the real resolvers, so they are real-SQL coverage, not a
  back door.
- [ ] **Step 4:** rewrite the *ONE HOUSEHOLD PER PERSON* comment in `e2eHouseholds.ts`
  (T29): two households per person exist since H5b, the rule is T14, and the route keeps
  its 409 because specs rely on "the member's first request reads this household".
- [ ] **Step 5: Mutation check**: put the invite statement AFTER `household` → the server
  unit test that checks counts goes red. (The spec needs the cloud project; G.10 runs it.)
- [ ] **Step 6: Gate**, commit `test(households): cleanup deletes invites`.

**The brief must pass down:** the order rule of `/e2e/cleanup` (children before parents, so
each count means something); T26's Restrict on `createdById`; no E2E run in this task (G.10
runs them, after the main session has migrated the test database in G.1 Step 7).

---

## Task G.7 — web: the join page, the return path, the household guard

**Files:**
- Create: `apps/web/src/lib/safeRedirect.ts` (+ test), `apps/web/src/routes/join/$token.tsx`
  (+ `.test.tsx`, `.stories.tsx`, `.stories.test.tsx`), `apps/web/src/apollo/householdGuard.ts`
  (+ test), a `HouseholdChangeGuard` component (+ test)
- Modify: `apps/web/src/routes/sign-in.tsx`, `routes/__root.tsx`,
  `routes/shouldRedirectToOnboarding.ts` (+ test), `lib/layoutRules.ts` (+ test),
  `apps/web/src/apollo/operations/household.graphql`, `i18n/locales/en.json`, `tw.json`

- [ ] **Step 1: `safeRedirectPath` tests, then code** (T24): `/join/abc` → itself;
  `/join/abc?x=1` → itself; `//evil.example` → `/`; `/\evil` → `/`;
  `https://evil.example` → `/`; `undefined`, `''`, a number → `/`.
- [ ] **Step 2: Sign-in.** `validateSearch` keeps `redirect` as a string. After sign-in
  navigate to `safeRedirectPath(redirect)`. `<SignIn forceRedirectUrl={path}
  signUpForceRedirectUrl={path} />` (check both prop names in the installed
  `@clerk/react` types first; if they differ, use the installed ones and record it in
  *What this plan got wrong*). `CloudAuthGuard` navigates with
  `search: { redirect: pathname + searchStr }`. Tests: the guard passes the path; sign-in
  goes to the redirect; a bad redirect goes to `/`.
- [ ] **Step 3: Exclusions** (T25). `shouldRedirectToOnboarding`: `false` for
  `/join/…`, with a test. `isFullscreenPage`: `true` for `/join/…`, with a test.
- [ ] **Step 4: Documents** (`household.graphql`): `InvitePreview($token)`,
  `JoinHousehold($token)` selecting `id name role`. Run `pnpm codegen`, check the output.
- [ ] **Step 5: The household guard** (T23). `householdGuard.ts` exports
  `LAST_HOUSEHOLD_ID_KEY = 'last-household-id'` and
  `switchToHousehold(id): Promise<void>` = `clearCache()`, remove
  `active-location-id:cloud`, set the key, `window.location.reload()`. `HouseholdChangeGuard`
  reads `useHousehold()`; mounted in `__root.tsx` when `mode === 'cloud'` (both trees: put
  it beside `PostLoginMigrationDialog`, which mounts in E2E too). Tests: no stored id →
  store, no reload; same id → nothing; different id → `clearCache` called, key removed,
  reload called (stub `window.location.reload` and `clearCache`); loading or error → nothing.
  Read the comment on `clearCache` about the account guard first: this guard must not
  remove `LAST_USER_ID_KEY`.
- [ ] **Step 6: The join page**, `/join/$token`:
  - Local mode: the `join.needsCloud` text and **Sign in to join**, which sets
    `data-mode` to `cloud` and reloads. It must NOT set `migration-strategy` (so
    `PostLoginMigrationDialog` stays closed) and must not touch local data. Test both
    (assert the key is absent after the click).
  - Cloud: `useInvitePreviewQuery`. Loading → spinner. `VALID` → title, inviter, roles (role
    names through the existing role keys; location names as stored, no `capitalize`),
    **Join**. `ALREADY_MEMBER` → the text and a link to `/`. `INVALID` → the text.
  - Join: the mutation, then `switchToHousehold(result.id)`. On `INVITE_INVALID` or
    `ALREADY_MEMBER` (read `extensions.reason`, extend `lib/graphqlErrorCode.ts` with a reason
    helper if none exists) show the matching text; on any other error a toast and the
    button stays.
  - Stories: `Valid`, `AlreadyMember`, `Invalid`, `LocalMode`, with `MockedProvider` (the
    F.5 pattern, `src/test/cloudRoleStory.tsx`). Smoke tests assert a heading or the button,
    and wait for loading to end.
- [ ] **Step 7: Mutation checks**:
  - `safeRedirectPath` accepts `//` → its test red.
  - the `/join` branch removed from `shouldRedirectToOnboarding` → its test red.
  - `HouseholdChangeGuard` skips `clearCache` → its test red.
  - the join page sets `migration-strategy` → its test red.
  - the page shows the household name for `INVALID` → its test red.
- [ ] **Step 8: Gate** (incl. `build-storybook`), commit
  `feat(households): join page, sign-in return path and household guard`.

**The brief must pass down:** Review Focus 1 and 5; T23, T24, T25; never set
`migration-strategy`; i18n in both locale files (O17); stories must mount the real page, not
markup of their own (root `CLAUDE.md`, *Component Development*); no `export` of a fixture
from a story.

---

## Task G.8 — web: the no-household screen

**Files:**
- Create: `apps/web/src/components/household/NoHouseholdGate/` and `NoHouseholdScreen/`
  (each `Name.tsx`, `index.ts`, stories, smoke test, test)
- Modify: `apps/web/src/hooks/useHousehold.ts` (+ test), `routes/__root.tsx`,
  `apollo/operations/household.graphql` (`CreateHousehold`), locale files

- [ ] **Step 1: `useHousehold` returns `errorCode`** (the `extensions.code` of the failed
  query, or `undefined`). Test with a `NO_HOUSEHOLD` error and with another error.
- [ ] **Step 2: Gate component.** In cloud mode, when `useHousehold().errorCode ===
  'NO_HOUSEHOLD'` and the path is not `/join/…` or `/sign-in`, render `NoHouseholdScreen`
  instead of the page. Mount it inside `Layout` around `<Outlet />` in `__root.tsx`. Tests:
  the screen shows for `NO_HOUSEHOLD`; not for another error (a network error must not tell
  someone they have no household); not while loading; not on `/join/x`; not in local mode.
- [ ] **Step 3: The screen.** `noHousehold.title`, **Create a household** opening a dialog
  with an optional name (`HOUSEHOLD_NAME_MAX_LENGTH`, 100). On success
  `switchToHousehold(id)` (G.7). On `ALREADY_IN_HOUSEHOLD` the same call with the id from a
  `GetHousehold` refetch (another tab created or joined first).
- [ ] **Step 4: Mutation checks**: the gate checks `isError` instead of the code → the
  "another error" test red; the `/join` exception removed → its test red.
- [ ] **Step 5: Gate**, commit `feat(households): screen for a person with no household`.

**The brief must pass down:** decide by the error CODE, never by "the query failed"
(offline and network errors are common); no `capitalize` on household names; a story that
mounts the real component.

---

## Task G.9 — web: the Members page

**Files:**
- Create: `apps/web/src/routes/settings/household/members.tsx` (follow the `locations.tsx`
  layout pattern), its `.test.tsx`, `.cloud.test.tsx`, stories and smoke test;
  `components/household/MemberList/`, `InviteDialog/`, `InviteList/` (each with stories and
  smoke tests)
- Modify: `HouseholdSidebar.tsx` and `routes/settings/index.tsx` (Members item, cloud only,
  second in the list, as the design numbers it); `lib/layoutRules.ts` only if the page must
  be full-screen on mobile (follow what `locations` does); `apollo/operations/household.graphql`;
  `apps/web/src/apollo/liveUpdates.ts` (comment table: `HouseholdMembers`,
  `HouseholdInvites` → `LOCATION`; no map entry needed, `LOCATION` refetches all); locale
  files

- [ ] **Step 1: Documents**: `HouseholdMembers`, `HouseholdInvites`, `CreateInvite`,
  `RevokeInvite`, `SetHouseholdRole`, `RemoveMember`, `LeaveHousehold`. Use
  `GetHouseholdLocations` (H5a) for the invite form's location list. `pnpm codegen`.
- [ ] **Step 2: Failing page tests**, roles set through `permissionsFor`
  (`src/test/rolePermissions.ts`, the F.5 pattern) plus `MockedProvider` results:
  - `household owner sees the role control and Remove on every other row`, not on their own.
  - `household manager sees Remove only on member rows`, no role control.
  - `household member sees the list and Leave, and no Invite` (O13-A).
  - `household owner sees no Leave, and the note` (`ownerCannotLeave`).
  - `owner's invite form offers member and manager; a manager's offers member only` (O3-A).
  - `the invite form lists every location with No access selected` (O14-A).
  - `user can create an invite and sees the link` → the dialog shows
    `${origin}/join/${token}` and **Copy link** (stub `navigator.clipboard.writeText`).
  - `user sees open invites with Copy link and Revoke` (O7-A); a manager sees no Revoke on a
    manager invite (O15-A).
  - `leaving calls leaveHousehold, then switchToHousehold for the next household` — after
    leaving, the next `GetHousehold` result decides: another household → the guard reloads;
    `NO_HOUSEHOLD` → G.8's screen. Assert the page calls a `GetHousehold` refetch, not a
    hard-coded route.
  - Local mode: the route is not listed in the sidebar or the accordion (design, *Local
    mode*), and opening the URL shows nothing cloud-only (redirect to `/settings/household`
    or a plain notice; pick one and test it).
  - Every confirm (remove, leave, revoke) uses the existing confirm dialog pattern.
- [ ] **Step 3: Implement**, reading `usePermissions()` for `canManageLocations`-like
  checks only where they match; add a `canManageMembers` (owner or manager) and `isOwner` to
  `Permissions` if needed, with tests in `usePermissions.test.tsx`. **H5a's review found that
  `permissionsFor` cannot tell `canEditCatalog` from `canManageLocations`** (same value).
  A new right with the same value has the same weakness; if you add one, say so in the
  report.
- [ ] **Step 4: Stories**: `Owner`, `Manager`, `Member`, `InviteDialogOpen`, `WithOpenInvites`,
  through `MockedProvider` (`cloudRoleStory.tsx`), each mounting the real page. Smoke tests
  wait for `!isLoading` before they assert (the F.5 present-first trap).
- [ ] **Step 5: Mutation checks**:
  - the manager filter on Remove dropped → "manager sees Remove only on member rows" red.
  - the invite form offers `manager` to a manager → its test red.
  - Leave shown to the owner → its test red.
- [ ] **Step 6: Gate** (incl. `build-storybook`; check the new story ids in
  `apps/web/storybook-static/index.json`), commit `feat(households): members page`.

**The brief must pass down:** design *Household roles* table; O3-A, O7-A, O13-A, O14-A,
O15-A; names as stored; the read-only patterns from `routes/CLAUDE.md` (*Read-only views by
role*); the store-only-in-the-page rule for fixtures; Biome's `noRedundantRoles` (H5a: do
not add `role="list"`); a11y scans for the page go into the G.10 cloud spec, light and dark,
because `a11y.spec.ts` does not run in cloud.

---

## Task G.10 — E2E: invite, join and members, two browsers

**Files:**
- Create: `e2e/tests/household-invites.spec.ts`, `e2e/pages/MembersPage.ts`,
  `e2e/pages/JoinPage.ts`
- Modify: `e2e/helpers/userContext.ts` (an option to NOT set `e2e-skip-onboarding`),
  `e2e/playwright.config.ts` (`cloud` `testMatch`, `local` `testIgnore`), `e2e/CLAUDE.md`

**Prerequisite:** the main session has migrated the test database (G.1 Step 7). Without
it, every cloud spec fails at the first request. Read `e2e/CLAUDE.md` first: ports, a stale
`generated/graphql.ts`, the shared test database.

- [ ] **Step 1:** `newUserContext(browser, userId, extraLocalStorage?, { skipOnboarding? })`,
  default `true`, so the 3 existing tests are untouched.
- [ ] **Step 2: The spec**, cloud only. Users: OWNER O (`${E2E_SECOND_USER_ID}-invite-owner`),
  NEWCOMER N, and REPEAT R. O sends one GraphQL request first (makes H and "Home"), seeds
  one item stocked at Home through `makeGql`. Clean up O, N, R and `E2E_USER_ID` in
  `beforeEach` and `afterEach` (the F.8 rule).
  1. `user can invite a person who joins in another browser` — O's browser: Members ›
     Invite, member, Home = participant, Create; read the link from the dialog TEXT (not the
     clipboard). N's context with `skipOnboarding: false` and NO `data-mode` key (local mode,
     a brand-new visitor): open the link → the local notice → Sign in to join → (E2E has no
     Clerk; the reload lands on the join page in cloud mode) → see "Join <household>", the
     inviter's name, "搬運工"/"Participant" → Join → the pantry shows O's item. N's own
     "Home" is NOT in N's switcher (it was empty and was deleted; read it back:
     `GET /e2e/users/:id` or a GraphQL `household` read as N gives H). Then O changes the
     item's quantity in O's browser → N sees it without a reload (a live `STOCK` event).
     O's Members page shows N without a reload (`LOCATION`).
  2. `user sees that a used, revoked or unknown invite is no longer valid` — create two
     invites with `createInvite`; join one with `joinHousehold` as another user; revoke the
     other; open both links and a made-up token in N's browser → `join.invalid` each time,
     no household name on the page.
  3. `removed member who is invited again gets only the new roles` — R joins as participant
     of Home (helpers); O removes R in O's browser; R's next page load shows the
     no-household screen (R's own household was empty and deleted at the first join); O
     invites R again as VIEWER; R joins in R's browser; R's switcher shows **View only** on
     Home and no quick-update button. This is D9 on real SQL.
  4. `person in two households uses the household they joined last` (#381 owed by H4) — R2
     makes an item in R2's own household first (so it is kept), then joins H. Through
     `makeGql` as R2: `household { id }` is H; an import batch into H that names R2's own
     household's location (`bulkCreateItemStocks`) is refused with `FORBIDDEN` and writes
     nothing; the same for an item id of R2's own household in `bulkCreateCartItems` (row
     skipped). Read both households back. No browser needed for this test.
  5. `household member can leave` — N leaves from N's browser → N gets the no-household
     screen → **Create a household** → N's pantry shows "Home" with no items.
  6. a11y: axe scans of `/join/<token>` (VALID) and the Members page, light and dark, in
     this spec (the F.4 pattern; `e2e/helpers/axe.ts`).
- [ ] **Step 3: Mutation checks**, each run in `cloud`, copied aside and restored from the
  copy, each must turn a named test red:
  - `shouldRedirectToOnboarding` without the `/join` branch → test 1 (N lands on
    `/onboarding`).
  - `joinHousehold` without T21's delete → test 1 (N's own "Home" is still in N's switcher).
  - `removeMember` without T11's delete AND join without T20's delete → test 3 (R is
    participant again). Run each of the two alone too; record which one test 3 needs.
  - `ensureHousehold` back to `findFirst` with no `orderBy` → test 4 MAY stay green (the
    database order is not random in practice). If it stays green, say so plainly; the unit
    test of G.2 is the guard for the order.
  - `invitePreview` returns the name for INVALID → test 2.
- [ ] **Step 4: Run** `pnpm test:e2e --project=cloud e2e/tests/household-invites.spec.ts`
  plus every spec of a page this branch touched (pick from `ls e2e/tests e2e/tests/settings`:
  at least `shared-household`, `cloud-roles`, `household-member-cleanup`,
  `cleanup-endpoint`, `settings-global-pages`, `settings/locations`, `live-pantry`,
  `onboarding` in `local`), and the `local` project with `a11y.spec.ts`. **Copy
  `test-results/` aside before any re-run.** Report the load average.
- [ ] **Step 5:** `e2e/CLAUDE.md`: the new spec, the `skipOnboarding` option, the 19-model
  cleanup, and that a person can now be in two households through the real flow (the 409
  route stays). **Gate**, commit `test(households): invite and join in two browsers`.

**The brief must pass down:** the 409 order for the E2E route still applies where it is
used; assert something PRESENT before an absence (root `CLAUDE.md`, *An absence … can be
satisfied by the loading state*); `expect.poll` for a backend read after a click; the three
proofs of a phantom failure and copying `test-results/` first; never `--grep`.

---

## Task G.11 — docs, deploy notes and the final gate

**Files:** root `CLAUDE.md` (*Authorization (cloud)*: an H5b table — the rule T14, the lock
order T16, the 7 mutations and 3 queries, the guard count, the household guard; the E2E
paragraph; the cleanup model count; test counts), `apps/server/prisma/CLAUDE.md`
(`MIGRATIONS` now 10, and the fourth deploy applies two), `apps/web/src/hooks/CLAUDE.md`
(`useHousehold().errorCode`, new rights if any), `apps/web/src/routes/CLAUDE.md` (join page,
no-household screen), `apps/web/src/routes/settings/CLAUDE.md` (Members),
`apps/web/src/components/CLAUDE.md` (new components), `e2e/CLAUDE.md` (from G.10), the
design (*Sequencing* H5 row; *Invite and join* answers; *Create and delete a household*: the
"no household" screen now exists), the phase plan (H5 row and outline), the H5 plan (H5b
outline points here; *Status*), `docs/INDEX.md`, the deploy section (below), and this
plan's *What this plan got wrong* and *Status*.

- [ ] **Step 1: Deploy section.** Add **section 9, "H5b"**, to
  `docs/global/backend/2026-11-17-deploy-runbook-households-h4.md` (the H5a notes are its
  section 8). Contents: the migration `20261118000000_add_household_invites` deploys with
  the server; rehearse it on a FRESH Neon branch of production (additive-only: `migrate
  deploy` plus read-only checks — the prisma `CLAUDE.md` *Production-data rehearsals* rule;
  never `verify:migration` there); server before web (already the release order); Clerk:
  check in the production instance that `forceRedirectUrl` to `/join/<token>` on the same
  origin is accepted, after sign-in AND after sign-up (Clerk Dashboard › Paths, and any
  allowed redirect list); a manual check on two real devices (invite, join, leave). The
  old `main` bundle never calls the new fields; a person removed while on the old bundle sees
  failing requests and no screen until the web deploys (same window as H5a's).
- [ ] **Step 2: Docs.** Re-measure every count (test totals with `pnpm test`; E2E with
  `--list`; the guard's field count; `grep -c "^  '2026" apps/server/scripts/verify-migration.ts`).
  Do not copy numbers from this plan.
- [ ] **Step 3: The full gate, then `pnpm test:e2e:all`.** Every failure is a hard stop. Copy
  `test-results/` aside before a re-run. Report load average and the three project results.
- [ ] **Step 4:** commit `docs(households): record H5b`. `git status` clean.

---

## Deploy notes

| Part | Migration | Order | Env / Clerk |
|---|---|---|---|
| H5b | `20261118000000_add_household_invites` (table `HouseholdInvite`, column `User.activeHouseholdId`; additive, no backfill) | migration with the server, then the web (the release order since 2026-11-17) | no new env var. Check that Clerk accepts `forceRedirectUrl` / `signUpForceRedirectUrl` to `/join/*` on the production origin |

- **The test database is migrated by hand**, by the main session, with the owner's
  consent (G.1 Step 7). Cloud E2E fails until then.
- **Rehearse on a fresh Neon branch of production** before the release, like H3a: the
  rehearsal writes to its target, so each rehearsal needs a fresh copy.
- **An old bundle and H5b.** `main`'s bundle selects none of the new fields, so it keeps
  working on the new server. It has no no-household screen, so a person removed from their
  only household while on the old bundle sees failing requests until the web deploys. No
  data is lost. Nobody can be removed before H5b deploys, and H5b deploys with the web in
  the same release, so the window is the time between the two deploys.
- **No `findDangerousChanges` change expected.** `oldBundleCompat.test.ts` must still list
  exactly the known changes. If it reports a new one, a task changed an existing type.

## Known gaps (expected after H5b)

- **Location roles of a member cannot be changed after they join** until H5c's people page.
  The workaround is remove and invite again. With O14-A a member may join with no location
  at all.
- **A person in two households cannot switch** between them until H7. Their own non-empty
  household is kept but unreachable from the screen (O2-A).
- **Nothing pushes a removed member's open tab.** Live events stop reaching them. Their
  NEXT request now leads to the right screen (G.7's guard, G.8's screen), but a tab that
  sends nothing stays stale.
- **The empty-household delete has a small race** (T21). A write into the joiner's OWN old
  household that commits between the join's conditional `deleteMany` reading a row and
  deleting it is not seen. In practice that is the same person, in another tab, at the same
  second as pressing Join. The item would be lost with the household. Stated, not fixed.
- **Two people who joined each other's empty households at the same moment** can make
  Postgres abort one of the two joins with a deadlock error (`40P01`): each join holds its
  target household and deletes the other's. The other join succeeds; the aborted person
  sees a toast, and on retry the link is invalid (the household it belonged to was
  deleted). Very unlikely; stated.
- **Expiry is proved with a clock in unit tests only** (T28). No E2E test opens a link that
  is really 7 days old.
- **The lock order is proved by the order of calls in unit tests only.** The Prisma fake has
  no row lock. No `verify-migration.ts` proof of `lockUser` is planned. If the owner wants
  one, it is a G.1 Step 7 extension like `assertHouseholdLock`.
- **`createHousehold` is only for a person with no household** (O16-A) until H7.
- **The invite link is a secret in a URL.** It can end up in browser history and in any
  analytics that records paths. It is single use and expires after 7 days, which limits the
  harm. No analytics run on the app today; recheck if one is added.
- **E-mail invites do not exist** (design, *Postponed*). The owner shares the link by hand.
- Carried over from H5a, still open: the old-bundle shim removal, the deleted-organizer
  `hasOrganizer` fix (H6), the keyboard gap on `role="button"` badges, and the other items
  in the H5 plan's *Known gaps*.

## Rules every task brief must pass down

- Plain English (short sentences, common words, main point first), in code comments, docs,
  commits and the report.
- The report shape from root `CLAUDE.md`, *Pull Requests and Agent Reports*, and an explicit
  section: **what this plan got wrong**.
- Node 22.17.1. The full gate after each task. Copy files aside before a mutation; never
  `git checkout --` to undo one; never bare `git stash`.
- **No database command in a subagent.** `migrate dev`, `migrate reset`, `verify:migration`
  and any migration run only against the test database (`TEST_*`), only by the main
  session, and only with the owner's consent.
- Every role test has a second person with a different role and a location the caller has
  no role on (design, *Testing notes*).
- Every new mutation is in the live guard, with its test of the published event.
- Do not change or remove an existing GraphQL field, argument or input field (the old-bundle
  shim). Run `oldBundleCompat.test.ts`.
- After each commit, `git show <sha> -- <file> | grep '<a line you added>'` (lint-staged can
  rewrite a staged file).
- The web suite has one known flaky story test under load
  (`routes/shopping/index.stories.test.tsx`, Offline). Check `uptime` and re-run it alone
  before you call it a regression.

## What this plan got wrong

Filled in from the task reports and reviews.

| Task | The plan said | What was true |
|---|---|---|

## Status

**Plan written 2026-11-18** on `feature/households-h5b`, based on `develop` at `4307d30a`
(HEAD `770a75e8`). Owner decisions O13–O17 are open. No task has started. G.1 Step 7 needs
the owner's consent for a database command.
