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
| E1 | Outline: "`requireHousehold` reads `User.activeHouseholdId` when the person is still a member there, else the oldest membership by `joinedAt`, then `householdId`" | There is no column. And `requireHousehold` itself reads nothing: it calls `ensureHousehold`, which does the reads | The rule goes into `ensureHousehold`'s two reads, with ONE `user.findUnique` on the common path (decision T14). One Prisma call; see T14 for why it may be two SQL statements |
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
| T14 | **`User.activeHouseholdId String?`**, a foreign key to `Household` with `onDelete: SetNull`. The rule: the active household when the person is still a member there; else the OLDEST membership by `joinedAt`, then `householdId`. ONE Prisma call on the common path: `prisma.user.findUnique({ where: { id }, select: { activeHouseholdId: true, householdMemberships: { orderBy: [{ joinedAt: 'asc' }, { householdId: 'asc' }], select: { householdId: true } } } })`. The same rule inside the transaction's `count === 0` branch. (Review of G.2: one Prisma call is not always one SQL statement. Prisma 6 without the `relationJoins` preview feature, which this schema does not turn on, may run the nested `householdMemberships` select as a second statement. Not measured.) | O2-A. A fixed order means the same answer on every request. "Oldest" is a stable fallback that needs no write | A `findFirst` with an `orderBy` and a second read for the column (two queries); "newest membership" (a manager added later would silently move a person) |
| T15 | **`forgetRolesAroundEach` also forgets `ctx.requestCache.householdId`** (add `delete cache.householdId` to `forgetLocationRoles`, renamed nowhere; update its comment) | `joinHousehold`, `leaveHousehold`, `removeMember` and `createHousehold` change the answer. A later root field of the same mutation must not read the old household. The forget BEFORE the first field clears an empty cache, so a one-field mutation pays nothing | Each of the four resolvers clearing it by hand: the H5a review replaced that pattern because a source-text guard could not check it |
| T16 | **One lock order: the `User` row, then a `Household` row.** A new `lockUser(tx, userId)` in `lib/household.ts` (an `UPDATE` of `User.updatedAt`, like `lockHousehold`). Only `joinHousehold` and `createHousehold` take it, always first. `removeMember`, `leaveHousehold` and `setHouseholdRole` take `lockHousehold` only and **never write a `User` row** | Two locks taken in different orders by two transactions can wait on each other. Postgres would detect it and abort one with `40P01`, so it would not hang, but a person would see an error | Not locking the user (two joins by one person at once could both pass "not yet a member" checks of different households and both delete the same old household) |
| T17 | **The invite is claimed with a conditional `updateMany`** after the household lock: `where: { id, usedAt: null, revokedAt: null, expiresAt: { gt: now } }`, `data: { usedAt: now, usedById: userId }`. `count === 0` → `INVITE_INVALID`. `ALREADY_MEMBER` is checked BEFORE the claim, so it leaves the link unused | The same claim idea as `householdSetupAt` (decision H1). Under READ COMMITTED the second of two joins re-checks the `WHERE` after the first commits and matches 0 rows | Read the invite, check it, then `update`: two joins can both read "unused" before either writes |
| T18 | **Error shape.** A refused join or invite write uses `BAD_USER_INPUT` with `extensions.reason`: `INVITE_INVALID` (not found, expired, used or revoked: ONE answer for all four, so a caller learns nothing about a token), `ALREADY_MEMBER`, `ALREADY_IN_HOUSEHOLD` (`createHousehold`, owner decision O16). Role refusals stay `FORBIDDEN`. `invitePreview` never throws for a token; it returns `status` | `extensions.reason` is the pattern H4 used (`IMPORT_NEEDS_LOCATION`). One answer for four invalid states stops probing | A different error per state |
| T19 | **All 7 new mutations publish household-level `LOCATION`** (`publishHouseholdChange(ctx, ['LOCATION'], householdId)`), after commit. No new `ChangeKind` | `LOCATION` already refetches every active query (`'all'`), which covers `GetHousehold` (role), `GetLocations` (`myRole`), the members and invites lists. These events are rare | A new `MEMBERS` kind: a schema enum change, a new runner entry and a new test, to save refetches on a rare event |
| T20 | **Join deletes the joiner's leftover `LocationMember` rows in the target household, then writes the invite's roles** | Rows from before T11 (E2E route, an H3a-era removal) must not survive a re-invite | `createMany({ skipDuplicates: true })`: a leftover row with an old, higher role would silently win |
| T21 | **The joiner's old household is deleted at join only when it is empty**, with ONE conditional statement inside the join transaction: `household.deleteMany({ where: { id: { in: otherIds }, members: { every: { userId } }, items: { none: {} }, tags: { none: {} }, tagTypes: { none: {} }, vendors: { none: {} }, recipes: { none: {} }, shelves: { none: {} }, locations: { every: { itemStocks: { none: {} }, inventoryLogs: { none: {} }, carts: { every: { items: { none: {} } } } } } } })`. Locations ("Home"), empty carts and open invites do not make it "not empty". The relation names are those of `schema.prisma` at `770a75e8` (`Location.itemStocks`, `.inventoryLogs`, `.carts`, `Cart.items`); check them again | O2-A. One statement means no gap between "is it empty" and "delete it" in our own code | A count, then a delete (two statements, a wider gap). The remaining risk is stated in *Known gaps* |
| T22 | **`invitePreview`, `joinHousehold` and `createHousehold` never call `requireHousehold`** | A person with no household must be able to preview, join and create. `requireHousehold` throws `NO_HOUSEHOLD` for them. This is the ONLY reason. It does not keep a brand-new person from getting a household: on the real `/join/…` page other root queries (`HouseholdChangeGuard`, `ActiveLocationProvider`, `PostLoginMigrationDialog`) call `requireHousehold` first, so first sign-in makes one, and the join deletes it as empty (T21). The code comments said otherwise until the whole-branch review | — |
| T23 | **Household-change guard on the web.** A component mounted in the root in cloud mode (in both the Clerk tree and the E2E tree) compares `GetHousehold`'s `household.id` with `localStorage['last-household-id']`. No stored id: store it. A different id: `clearCache()`, remove `active-location-id:cloud`, store the new id, `window.location.reload()`. The join page calls the same function directly after Join | Join, leave and removal change the household under a live cache. The account guard (`LAST_USER_ID_KEY`) does not see it. H7's switch needs the same step | Clearing only in the join handler: misses removal, leave, and the person's other tabs |
| T24 | **`/sign-in?redirect=<path>`.** `safeRedirectPath(raw)` in `apps/web/src/lib/safeRedirect.ts` returns the path only when it starts with `/` and not with `//` or `/\`, else `/`. `CloudAuthGuard` passes the current `pathname + search`. `<SignIn>` gets `forceRedirectUrl` and `signUpForceRedirectUrl` with the same path. Check the two prop names against the installed `@clerk/react` types before you use them | A new person must come back to the link after sign-up, not only after sign-in. A raw `redirect` is an open redirect | `sessionStorage` for the return path: lost when Clerk opens a new tab for e-mail verification |
| T25 | **`/join/$token` is full-screen and is excluded from the onboarding redirect and from `NoHouseholdGate`**: `shouldRedirectToOnboarding` returns `false` when `pathname.startsWith('/join/')`; `isFullscreenPage` returns `true` for it | Review Focus 1. A brand-new person's catalog is empty, so the redirect fires on the join page | Setting `onboarding-dismissed` on the join page: that would also hide onboarding later for a person whose join fails |
| T26 | **One migration, `20261118000000_add_household_invites`.** `HouseholdInvite`: `id String @id @default(cuid())`, `householdId` (FK, `onDelete: Cascade`), `token String @unique`, `householdRole HouseholdRole`, `locationRoles Json` (a list of `{ locationId, role }`, parsed by a checked parser on every read), `createdById` (FK to `User`, no `onDelete`, so Restrict like the member tables), `createdAt @default(now())`, `expiresAt`, `usedAt?`, `usedById?` (FK to `User`, `onDelete: SetNull`), `revokedAt?`, `@@index([householdId])`. `User.activeHouseholdId String?` (FK, `onDelete: SetNull`, `@@index`), with a named relation (`"ActiveHousehold"`), because `User`–`Household` already has `"HouseholdOwner"` | The design's table. `usedById` is history, so losing it when an E2E user is cleaned up is fine. `createdById` follows the member tables' "fail loudly" rule; `/e2e/cleanup` deletes those rows first | A child table for location roles: more joins for no gain, and an invite naming a deleted location must still be readable |
| T27 | **Who sees what.** `householdMembers`: every member (owner decision O13). `householdInvites`: owner and manager; a manager sees only `member` invites (owner decision O15). The `token` is in `householdInvites` only, never in `householdMembers` or `invitePreview` | O7-A keeps the token readable for those who may share it | — |
| T28 | **Expiry is tested with a clock in unit tests, not in E2E.** No E2E route moves time | A route that rewrites `expiresAt` would be one more E2E-only write path | An E2E-only "expire this invite" route |
| T29 | **`POST /e2e/household-members` stays, with its 409 rule.** Only its comment changes: a person CAN be in two households since H5b (through invites), and the rule picks one by T14; the route still refuses, because many specs depend on "the member's first request reads this household" | Changing the route would touch 6 spec files for no gain | Letting the route add a person who has a household |
| T30 | **Removing or leaving revokes the person's open invites of that household** (owner decision O20). In `removeFromHousehold`, in the same transaction as the member row delete, before it: `householdInvite.updateMany({ where: { householdId, createdById: userId, usedAt: null, revokedAt: null }, data: { revokedAt: now } })`. Expired, unused invites are revoked too | A manager sees the token of every open `member` invite, so a removed manager could rejoin through their own invite. The household and the creator are in the `where`; no code compares user ids. Expiry is left out of the `where` so it stays the same as `revokeInvite`'s, and an expired invite cannot be used anyway. No new event: the removal already publishes household-level `LOCATION`, and the Members page refetches `HouseholdInvites` on it. The acting tab gets no event, so `useRemoveMember` refetches `HouseholdInvites` itself | Revoking only unexpired invites (one more key, no gain); a demote also revoking (O20 leaves a demoted manager's invites open: they are still a member) |
| T31 | **A stored copy asks first** (owner decision O22-A). `usePostLoginMigration` takes the household (`{ name, role }`, from `useHousehold()`) as an argument. With a stored `migration-strategy` it waits until BOTH `GetLocations` and the household have loaded, then goes to a new state, `'confirming'`. `PostLoginMigrationDialog` asks "Copy your offline data into {household}?". **Copy here** (`confirmCopy`) runs the copy as before, with "Import into which location?" for `skip` and `replace`. **Don't copy** (`declineCopy`) removes `migration-strategy` and sets `migration-prompted`, like Skip, so the next load does not ask "Import local data to cloud?" either. A non-owner also reads that the household is shared. A role that cannot copy (`canCopyInto`: a member; a manager with `clear`, which needs owner) gets a sentence and only **Done**, which does the same as Don't copy. A cached household next to a `NO_HOUSEHOLD` error counts as no household. The question shows for **every** stored copy, the owner's too | Simplest rule that closes the hole: the copy cannot run into a household the person did not see named. "Every" rather than "only when it waited": a wait leaves no trace after the page load that `switchToHousehold` makes, so telling the two apart needs one more stored key, and the owner case costs one click in a flow the person started on purpose. H7's household choice will live in this same dialog. A member gets no Copy here because the server refuses it (`FORBIDDEN`), and an offer that is sure to fail is worse than a plain sentence | Asking only non-owners (an owner who chose the copy long ago, in another session, would still not see the target named); a "copy was waiting" key (more state, and it can go stale itself); a disabled Copy here for a member (a button that cannot be pressed explains less than a sentence). The manual prompt ("Import local data to cloud?") and `ImportCard` are not changed |

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
| O18 | **A**, **replaced by O20** (2026-11-18) | Asked after the review of G.3: do a manager's open invites stay open after that manager is removed or demoted? **A**: yes. The invite belongs to the household. The owner sees it in the list, with the creator's name, and can revoke it. Removing or demoting a manager does NOT revoke their invites (no extra code in G.5). B was: revoke them automatically |
| O19 | **Three actions** (2026-11-18) | Asked after the review of G.8: how does a person leave the no-household screen without creating a household? The gate covers `/settings` too, so on a phone the screen is all they have. The screen gets **Create a household** (the main action), **Switch to offline mode** and **Sign in to another account**. No plain Sign out. Switch to offline mode keeps the person signed in, so if they change their mind they switch back to cloud and land on Create with no new sign-in. Sign in to another account clears the cached cloud data first, then signs out, and stays in cloud mode. The owner first decided two actions; the third was added the same day. Built after G.11 (see *Status*) |
| O20 | **Revoke on removal and on leave** (2026-11-18, replaces O18-A) | Found in the whole-branch review: a manager can see every open `member` invite with its token. Under O18-A a removed manager's own invites stayed open, so they could rejoin through one (`joinHousehold`). The same after a leave. Now `removeMember` and `leaveHousehold` revoke every open invite of that household the person made, in the same transaction (decision T30). A DEMOTE does not: a demoted manager is still a member. The remove confirm for a manager gets one more sentence: "Open invites made by others stay open. If this person may have copied one, revoke it." / 「其他人建立的尚未使用的邀請仍然有效。如果對方可能複製過其中的連結，請撤銷該邀請。」 (for the owner's review in the PR). A member sees no tokens, so their confirm has no such sentence |
| O21 | **Record only, owed to H7** (2026-11-18) | A person in two households: tab 1 leaves A or is removed from A. Tab 2 still shows A (no event reaches it), and a write from tab 2 goes into B through `requireHousehold` (T14), with nothing shown. Fix in H7: the web sends the household id it shows, and the server refuses a mismatch. See *Known gaps* |
| O22 | **A** (2026-11-18) | Found in the whole-branch review: "Copy local data", chosen while switching to cloud, waited silently for a person in no household and then ran into whatever household came next, a shared one joined as manager included (a member got a `FORBIDDEN` error). **A**: before a stored copy runs, ask "Copy your offline data into {household}?" with **Copy here** and **Don't copy**. A person who is not the owner also reads that the household is shared and others will see the data. Built as decision T31. Choosing ANY household, or a new one, is owed to H7 |

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

**Note for G.3 (from the review of G.1):** `clearAllData` keeps open invites (an invite is
about who may join, not about data), but it deletes every location and makes a new "Home".
So after a clear, every open invite names only locations that no longer exist, and a person
who joins with it gets NO location role. G.4's "an invite location deleted since is skipped"
handles that without an error. G.3 decides whether `householdInvites` shows such an invite
with an empty role list (its "leaves out a location deleted since" test), and whether the
Members page should say so. Do not add an invite delete to `clearAllData` without asking:
`purge-coverage.test.ts` lists `householdInvite` as kept on purpose for that path.

**Notes from the review of G.3, for later tasks.**

- **G.9:** `revokeInvite` answers `false` when nothing was revoked: another tab or person
  revoked it, it was used, or (for a manager) it is a `manager` invite. Treat `false` as
  "this invite is no longer open": refetch the invite list, and show no success message.
- **G.4, the join and revoke together:** the claim must keep `expiresAt: { gt: now }`, and
  `revokeInvite` keeps `usedAt: null, revokedAt: null` in its `where`. Together they make a
  join and a revoke at the same moment safe: only one of the two conditional writes can
  match the row.
- **G.4, `ALREADY_MEMBER`:** reuse the preview's check, one `householdMember.findUnique`
  on the INVITE's household (`householdId_userId`), not the caller's household.
- **G.4, a wrong-length token:** `invitePreview` answers INVALID for a token whose length is
  not `INVITE_TOKEN_LENGTH` (43), with no read (`hasInviteTokenLength` in `lib/invite.ts`).
  The join should do the same, with `INVITE_INVALID`.
- **G.4, a bad `locationRoles` row:** do not catch a `parseLocationRoles` error inside the
  join transaction. It means a corrupt row; the transaction must roll back and the error
  must reach the logs.
- **Open question for the owner (not decided):** an invite a manager made stays open after
  that manager is removed or made a `member`. Should it be revoked then?

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
the claim pattern from `ensureHousehold`; the fake has no row lock; live guard. **Test doubles (from the G.2 review):** the hand-written `user.findUnique` stubs in the `import`, `item`, `shelf` and `tag` resolver tests return a membership of `hh_test` for ANY user id and any select, so they cannot show a join or a leave; use `householdWorld` for those. The inline `createUserFake` in `catalog-ownership`, `import-ownership` and `import-ownership-item` resolver tests is NOT registered with `runInTransaction` and is NOT reset between tests, so a rollback or a second test there would see stale `User` rows. To act in a household that is not the person's oldest, use `world.setActiveHousehold`.

**Notes from task G.4, for later tasks.**

- **G.5, `createHousehold`:** take `lockUser` FIRST, as `joinHousehold` does (decision
  T16), and set BOTH `activeHouseholdId` and `householdSetupAt` (the claim, when still
  null). `removeMember`, `leaveHousehold` and `setHouseholdRole` take only `lockHousehold`
  and never write a `User` row themselves. But a household DELETE writes the `User` rows
  that name it (`onDelete: SetNull`); see the G.4 rows of *What this plan got wrong*.
- **G.5, `removeMember` and `leaveHousehold` leave `activeHouseholdId` stale.** That is by
  T16, and `ensureHousehold` falls back to the oldest membership. Do not change it without
  the owner: writing the `User` row there would break the lock order.
- **G.5, the test "a removed member gets `NO_HOUSEHOLD`"** needs a person whose
  `householdSetupAt` was NULL before they joined (a brand-new person whose first request
  was the join). Every older fixture sets it to a date, so it cannot see a join that
  forgot the claim. `invite-join.resolver.test.ts` has one, `NEWT`.
- **G.9, the Members page:** an owner left alone in a household with no data (everyone
  else left, nothing stored) will lose that household the next time they join another
  one through an invite (T21). The page should not surprise them; say so where it fits.
- **G.5, tests:** the household fake now has `household.deleteMany`, and
  `householdWorld` cascades it (members, invites, location roles, locations, stock rows,
  the `contents` store, and `User.activeHouseholdId` SET NULL). A test that needs
  "is it empty" rows puts them in `world.contents.rows`.
- **G.6, `/e2e/cleanup`:** a joined person may own a household that `joinHousehold`
  kept (it had data). The route already deletes every household a user owns (E10), so
  nothing changes there for G.4.
- **G.7, the web:** the join answers `{ id name role }` of the JOINED household. A
  refusal is `BAD_USER_INPUT` with `extensions.reason` `INVITE_INVALID` or
  `ALREADY_MEMBER`. A corrupt invite row gives an internal error with no reason; show the
  generic error.
- **Any task that adds a model owned by a household or a location:** add it to
  `emptyHouseholdWhere` (`lib/invite.ts`), and to `HouseholdContents` in the fake.

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
passes); reuse `createFirstLocation`; live guard count is 69 after this task (measure it). **Test doubles (from the G.2 review):** the same two warnings as G.4 (the four hand-written `user.findUnique` stubs answer any user; the inline `createUserFake` in the three ownership files is not rolled back and not reset). A removed or leaving person keeps their implied `User` row in `householdWorld`, so `ensureHousehold` gives `NO_HOUSEHOLD` for them, as in Postgres.

**Notes from task G.5, for later tasks.**

- **G.8, `createHousehold`:** a refusal for a person who is in a household is
  `BAD_USER_INPUT` with `extensions.reason` `ALREADY_IN_HOUSEHOLD`. A blank or too long name
  is `BAD_USER_INPUT` with no reason (the same check as `renameHousehold`). For the default
  name send `name: null` (or leave it out), NEVER `""`: an empty string is a blank name and
  is refused. `null` gives the first sign-in name in the app language (`x-app-language`).
- **G.8, after a create:** the creating tab gets no live event back (the server never sends
  a tab its own change), so it calls `switchToHousehold(id, { to: '/' })` itself. That is
  what Step 3 and Step 3b of G.8 already say. The creator's OTHER tabs do get the
  `LOCATION` event (`shouldDeliver` passes: they are a member of the new household; tested).
  In those tabs `GetHousehold` last answered `NO_HOUSEHOLD`. By Apollo's rule an
  ObservableQuery with observers stays "active" after an error, so `refetchQueries({ include:
  'active' })` should refetch it, and the guard then sees the new id. This is read from
  Apollo's rule, NOT tested: G.8 should test that a failed `GetHousehold` is refetched on
  `LOCATION`.
- **G.9, the list:** `householdMembers` answers every role, so the page needs no role check
  to show it. `isMe` marks the caller's row. There is NO e-mail field.
- **G.9, set role:** asking for the role the person already has returns their row and
  publishes nothing. Treat it as success.
- **G.9, the cache:** `HouseholdPerson` has no `id`, so Apollo does not normalise it. A
  `setHouseholdRole` answer does not update the list by itself: refetch `HouseholdMembers`
  after set-role and after remove (the live event does not come back to the acting tab). If
  you add `keyFields: ['userId']` for it instead, note that the same person has one
  `HouseholdPerson` per household; after H7's switch two households' lists would share
  entries with different roles, so the key would then need the household too.
- **G.9, which buttons:** Leave only on the row with `isMe` and a role that is not
  `owner`. Remove: the owner on every row but their own; a manager only on `member` rows; a
  member on none. The role control only for the owner, on rows that are not the owner's.
  The server refuses everything else anyway.
- **G.9, no organizer:** removing or leaving can leave a location with no organizer
  (`Location.hasOrganizer` turns `false`). The page may say so after the action.
- **G.10:** these are the first real-SQL runs of the four mutations and of the `tx` read
  inside `requireHouseholdRole`. A removed person's open browser gets no live event, so
  reload it before asserting what it shows. For the `NO_HOUSEHOLD` path use a person whose
  `householdSetupAt` is set (a person never set up gets a new household instead).
- **G.9, an owner left alone:** the server gives no "is this household empty" field. The
  page can see "I am the owner and the only member" from `householdMembers` (one row,
  `isMe`, `owner`). It cannot see whether the household holds data. So the page can only
  say, in that case, that joining another household through an invite deletes this one
  when nothing is stored in it. No server change was made for this.
- **G.9, leave and remove:** both answer `true` or throw. The leaving person's other tabs
  and a removed person's tabs get NO live event (tested in
  `household-members.resolver.test.ts`, *who hears the event*). The page that leaves must
  refetch `GetHousehold` itself.

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

- [x] **Step 1: `useHousehold` returns `errorCode`** (the `extensions.code` of the failed
  query, or `undefined`). Test with a `NO_HOUSEHOLD` error and with another error.
- [x] **Step 2: Gate component.** In cloud mode, when `useHousehold().errorCode ===
  'NO_HOUSEHOLD'` and the path is not `/join/…` or `/sign-in`, render `NoHouseholdScreen`
  instead of the page. Mount it inside `Layout` around `<Outlet />` in `__root.tsx`. Tests:
  the screen shows for `NO_HOUSEHOLD`; not for another error (a network error must not tell
  someone they have no household); not while loading; not on `/join/x`; not in local mode.
- [x] **Step 3: The screen.** `noHousehold.title`, **Create a household** opening a dialog
  with an optional name (`HOUSEHOLD_NAME_MAX_LENGTH`, 100). On success
  `switchToHousehold(id, { to: '/' })` (G.7). On `ALREADY_IN_HOUSEHOLD` the same call with
  the id from a `GetHousehold` refetch (another tab created or joined first).
- [x] **Step 3b: Clear the old household's data when the screen shows** (added by the
  review of G.7). A leave or a removal that leaves the person in NO household does NOT reach
  `HouseholdChangeGuard`: `GetHousehold` fails with `NO_HOUSEHOLD`, so there is no id to
  compare, and the old household's rows stay in memory and in
  `Player1InventoryCloudCache`. So when the gate shows the screen, it calls `clearCache()`
  and removes `last-household-id` (`LAST_HOUSEHOLD_ID_KEY`) and `active-location-id:cloud`,
  once. Do NOT reload: the screen is what the person should see. The gate must skip
  `/sign-in` and `/join/` (a person with no household must still be able to open an invite
  link). **Create a household** must end on `/`: call `switchToHousehold(id, { to: '/' })`,
  not a reload in place. Tests: the three are cleared when the screen shows; nothing is
  cleared for another error; not on `/join/x` or `/sign-in`; Create ends at `/`.
- [x] **Step 4: Mutation checks**: the gate checks `isError` instead of the code → the
  "another error" test red; the `/join` exception removed → its test red; the clear in
  Step 3b removed → its test red.
- [x] **Step 5: Gate**, commit `feat(households): screen for a person with no household`.

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

- [x] **Step 1: Documents**: `HouseholdMembers`, `HouseholdInvites`, `CreateInvite`,
  `RevokeInvite`, `SetHouseholdRole`, `RemoveMember`, `LeaveHousehold`. Use
  `GetHouseholdLocations` (H5a) for the invite form's location list. `pnpm codegen`.
- [x] **Step 2: Failing page tests**, roles set through `permissionsFor`
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
- [x] **Step 3: Implement**, reading `usePermissions()` for `canManageLocations`-like
  checks only where they match; add a `canManageMembers` (owner or manager) and `isOwner` to
  `Permissions` if needed, with tests in `usePermissions.test.tsx`. **H5a's review found that
  `permissionsFor` cannot tell `canEditCatalog` from `canManageLocations`** (same value).
  A new right with the same value has the same weakness; if you add one, say so in the
  report.
- [x] **Step 4: Stories**: `Owner`, `Manager`, `Member`, `InviteDialogOpen`, `WithOpenInvites`,
  through `MockedProvider` (`cloudRoleStory.tsx`), each mounting the real page. Smoke tests
  wait for `!isLoading` before they assert (the F.5 present-first trap).
- [x] **Step 5: Mutation checks**:
  - the manager filter on Remove dropped → "manager sees Remove only on member rows" red.
  - the invite form offers `manager` to a manager → its test red.
  - Leave shown to the owner → its test red.
- [x] **Step 6: Gate** (incl. `build-storybook`; check the new story ids in
  `apps/web/storybook-static/index.json`), commit `feat(households): members page`.

**Notes from the review of G.7:**
- **After `leaveHousehold` the page calls the switch itself**, with target `/`. The leaver's
  own other tabs get no live event (`shouldDeliver` checks membership, and they are no
  longer a member; G.5 confirmed this). So: refetch `GetHousehold`; a household id →
  `switchToHousehold(id, { to: '/' })`; `NO_HOUSEHOLD` → clear as in G.8 Step 3b and go to
  `/`. This replaces the "Assert the page calls a `GetHousehold` refetch" wording above:
  assert the switch and its target too.
- **`setHouseholdRole` does not change the household id**, so the guard does nothing for
  it. The person whose role changed must refetch `GetHousehold` to see the new role (the
  household-level `LOCATION` event does this for their open tabs).

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

- [x] **Step 1:** `newUserContext(browser, userId, extraLocalStorage?, { skipOnboarding? })`,
  default `true`, so the 3 existing tests are untouched.
- [x] **Step 2: The spec**, cloud only. Users: OWNER O (`${E2E_SECOND_USER_ID}-invite-owner`),
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
- [x] **Step 3: Mutation checks**, each run in `cloud`, copied aside and restored from the
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
- [x] **Step 4: Run** `pnpm test:e2e --project=cloud e2e/tests/household-invites.spec.ts`
  plus every spec of a page this branch touched (pick from `ls e2e/tests e2e/tests/settings`:
  at least `shared-household`, `cloud-roles`, `household-member-cleanup`,
  `cleanup-endpoint`, `settings-global-pages`, `settings/locations`, `live-pantry`,
  `onboarding` in `local`), and the `local` project with `a11y.spec.ts`. **Copy
  `test-results/` aside before any re-run.** Report the load average.
- [x] **Step 5:** `e2e/CLAUDE.md`: the new spec, the `skipOnboarding` option, the 19-model
  cleanup, and that a person can now be in two households through the real flow (the 409
  route stays). **Gate**, commit `test(households): invite and join in two browsers`.

**Notes from the review of G.7:**
- After a join, assert the FINAL URL (`/`) and the joined household's name (the sidebar 🏠
  label). Before the review fix the page reloaded `/join/<token>` and showed "This invite
  is no longer valid", and a check of "the Join button went away" would have passed.
- `HouseholdChangeGuard` reloads the page when the server answers a new household. A spec
  that changes the user's household (join, leave, removal through the E2E route) while a
  page of that user is open will see a reload in the middle of the test. That breaks
  `stillSameDocument` and any locator held across it. Open the page after the change, or
  expect the reload.
- The sign-in return path (T24) cannot be tested in E2E: there is no Clerk in the E2E
  build, and `CloudAuthGuard` does not mount there. It is covered by unit tests only
  (`routes/sign-in.test.tsx`, `routes/__root.offline.test.tsx`).

**Notes from the review of G.8:**
- **Cleanup order.** If `/e2e/cleanup` deletes the OWNER's household before the member's
  rows, the member is left with no household, so `NO_HOUSEHOLD`, and that browser shows the
  no-household screen on every page. Clean up the member first, or create the member's own
  household again before reuse.
- **A removed member's open tab gets no event.** Reload that tab before asserting the
  no-household screen.
- **Add an axe scan of the no-household screen and of its Create dialog, light and dark**,
  in a cloud spec (`a11y.spec.ts` does not run in cloud), reached by a leave or a removal.

**Notes from the review of G.9 (the Members page):**
- **Duplicate button names.** Each row's **Leave household** button and the confirm's
  button have the same name, and so do **Revoke** and **Remove**'s. Click the confirm
  inside `getByRole('alertdialog')`. **Copy link** is on every invite row: scope it to the
  row (`listitem`).
- **Radix Select.** The role pickers are Radix `Select`, not `<select>`: click the
  combobox (named "Household role", "Household role of <name>", or the location's name),
  then the option in the open `listbox`. `selectOption` does not work.
- **The invite link.** Read the token from the dialog's read-only **Invite link** field,
  not from the clipboard. If a spec does use the clipboard, it needs
  `clipboard-read`/`clipboard-write` permissions on the context.
- **Leave is a full page load** (`switchToHousehold(id, { to: '/' })`, or
  `location.replace('/')`). Wait for the URL `/` and a fresh document; a locator held
  across it is gone. While it runs the row shows "Leaving…".
- **A removed or leaving person's other tabs get no event.** Reload them before asserting.
- **Absence checks need present-first:** for example, see a member row before asserting a
  manager row has no Remove.
- **Axe scans** of the Members page, the invite dialog (form and link) and the remove /
  leave confirm, light and dark, in a cloud spec.

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

- [x] **Step 1: Deploy section.** Add **section 9, "H5b"**, to
  `docs/global/backend/2026-11-17-deploy-runbook-households-h4.md` (the H5a notes are its
  section 8). Contents: the migration `20261118000000_add_household_invites` deploys with
  the server; rehearse it on a FRESH Neon branch of production (additive-only: `migrate
  deploy` plus read-only checks — the prisma `CLAUDE.md` *Production-data rehearsals* rule;
  never `verify:migration` there); server before web (already the release order); Clerk:
  check in the production instance that `forceRedirectUrl` to `/join/<token>` on the same
  origin is accepted, after sign-in AND after sign-up (Clerk Dashboard › Paths, and any
  allowed redirect list); a manual check on two real devices (invite, join, leave); a
  manual check that **Copy link works where the Clipboard API does not** (the review of G.9:
  open the app over plain `http://` on a phone in the local network, or block the
  clipboard permission, then use Copy link in the invite dialog AND on an open-invite row,
  and paste: jsdom cannot show what a browser really copies). The
  old `main` bundle never calls the new fields; a person removed while on the old bundle sees
  failing requests and no screen until the web deploys (same window as H5a's).
- [x] **Step 2: Docs.** Re-measure every count (test totals with `pnpm test`; E2E with
  `--list`; the guard's field count; `grep -c "^  '2026" apps/server/scripts/verify-migration.ts`).
  Do not copy numbers from this plan.
- [ ] **Step 3: The full gate, then `pnpm test:e2e:all`.** Every failure is a hard stop. Copy
  `test-results/` aside before a re-run. Report load average and the three project results.
- [x] **Step 4:** commit `docs(households): record H5b`. `git status` clean.

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
- ~~**A tab that still shows a household the person left can WRITE into their other
  household**~~ **Fixed in H7a** (owner decision O21; tasks L.1 and L.3 of
  [the H7 plan](2026-11-21-households-plan-h7.md); not merged, not deployed). The web sends
  the household this page shows in the header `x-household-id`, and `requireHousehold`
  refuses a mismatch with `HOUSEHOLD_CHANGED`. The tab then reloads into the household the
  person is in now and shows a message once (O51-A, wording O56-A). Proved on real SQL by
  `household-switch.spec.ts` test 3. Still open, see the H7 plan's *Known gaps*: an old web
  bundle sends no header, and fields that check only a location role
  (`requireLocationRole`) never answer `HOUSEHOLD_CHANGED`.
  The original gap: a person in A and B: tab 1 leaves A, or
  someone removes them from A. Tab 2 still shows A, because no event reaches it. A write
  from tab 2 goes to B through `requireHousehold` (T14), and tab 2 shows nothing about it.
- **A removed manager may have copied an invite made by someone else** (O20). Their own
  open invites are revoked with the removal, but any other open `member` invite they saw
  stays open. The remove confirm tells the owner to revoke one if needed. Nothing does it
  automatically.
- **The empty-household delete has a small race** (T21). A write into the joiner's OWN old
  household that commits between the join's conditional `deleteMany` reading a row and
  deleting it is not seen. In practice that is the same person, in another tab, at the same
  second as pressing Join. The item would be lost with the household. Stated, not fixed.
  (A JOIN into that household is no longer part of this race: since the review of G.4 the
  join locks every household it may delete, so the other join waits, then finds it gone.
  A catalog or stock write takes no household lock, so it still is.)
- **Two joins can still deadlock** (`40P01`, Prisma `P2034`): two people who join each
  other's empty households at the same moment, or a household delete that sets another
  person's `User.activeHouseholdId` to null while that person's own join holds their `User`
  lock. Since the review of G.4 the join is retried ONCE on `P2034`, so the usual answer is
  a normal join, or `INVITE_INVALID` when the household was deleted by the other join. A
  second `P2034` reaches the person as an error. Proved in unit tests with a fake `P2034`
  only; no test makes Postgres deadlock.
- **`deleteLocation` and `clearAllData` can throw a raw `P2025`** when their household was
  deleted after `requireHousehold` found it, because `lockHousehold` is an `update`. The same
  shape G.5's review fixed for set-role, remove and leave. Rare (the owner's own join in
  another tab at the same moment). Left as it is.
- **`lockUser` throws a raw `P2025` when the caller has no `User` row.** That happens only
  if `ensureUserOrLog` failed quietly earlier in the request. The person sees an internal
  error. Left as it is.
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
- **The invite token travels inside Clerk's `redirect` value** when a signed-out person opens
  the link (`/sign-in?redirect=/join/<token>`), so Clerk's own pages and logs may see it.
  Low risk: it is single use and expires after 7 days.
- **"Sign in to join" sets `migration-prompted='1'`** (G.7). On that device the automatic
  "Copy local data?" prompt then never shows again. A person can still copy on purpose
  through the data mode card (`DataModeCard`, which clears the key when a strategy is
  chosen). **Fixed 2026-11-19**: the button no longer sets the key; the question waits on
  the join and sign-in pages, and Join skips only the joined household
  (`docs/global/bugs/2026-11-19-bug-join-turns-off-copy-prompt.md`).
- **A leave or a removal into NO household leaves the old rows on the device** until G.8's
  screen clears them (G.8 Step 3b). `HouseholdChangeGuard` cannot see it: there is no new
  id.
- **A removed person's OTHER tabs get no event** (`shouldDeliver` checks membership). Each
  such tab keeps saving its old Apollo cache every 5 seconds into the ONE saved snapshot
  (`Player1InventoryCloudCache`). So the old household's pantry can come back on the next
  load of any tab, and stays until the network answers `NO_HOUSEHOLD`. Offline that can be
  for as long as the device stays offline.
- **On a first load with a saved snapshot, pages show the old household for a moment**
  before the server's `NO_HOUSEHOLD` arrives and the screen replaces them.
- **A person removed from a household and invited back to the SAME one**, who joins in
  another tab, keeps the no-household screen in this tab until a reload. The gate ignores
  the lost household's id on purpose (G.8 review, loop guard).
- **Leaving the no-household screen (owner decision O19) has three limits.**
  - **"Sign in to another account" is not in the E2E build** and no E2E test presses it.
    It calls `useClerk()`, and the E2E build has no `ClerkProvider`. The unit tests in
    `NoHouseholdScreen.test.tsx` carry it (order of clear and sign-out, no change of
    `data-mode`, the double-press guard, a failed clear). The axe scans of the screen do
    not see the button either. It uses `neutral-ghost`, the same text colour as the
    scanned `neutral-outline` button, but nothing measured it.
  - **Local mode has no sign-out anywhere.** In local mode Settings shows only the data
    mode card with **Switch...** (to cloud), and `UserSettingsPanel` shows no account
    card. So a person who used **Switch to offline mode** stays signed in to Clerk on
    that device until they switch back to cloud, land on the no-household screen again,
    and press **Sign in to another account**. A person in a household signs out from the
    data mode card in cloud mode.
  - **Switching back to cloud with "Copy local data" while in no household.** This
    bullet first predicted an import error next to the screen. That was wrong (*What this
    plan got wrong*): the copy does not start at all, because it waits for `GetLocations`,
    which fails with `NO_HOUSEHOLD`. It waited silently, with the key stored, and then ran
    into the next household. Since O22-A (decision T31) it still waits, and then asks
    "Copy your offline data into {household}?" before anything is sent. Pinned by
    `a stored copy waits, unsent, while the person is in no household` in
    `usePostLoginMigration.test.ts`. No E2E test drives the no-household case.
- **Old, not new in H5b: the "copy local data?" check can fail with an unhandled
  rejection.** `usePostLoginMigration` (`apps/web/src/hooks/usePostLoginMigration.ts:183`)
  calls `getAllItems().then(...)` with no `.catch`. In cloud mode, when the local IndexedDB
  read fails (a closed or blocked database, private browsing that refuses IndexedDB), the
  promise rejects with nothing to catch it. The browser reports an unhandled rejection, and
  the check never finishes for that page load: no prompt shows, and `migration-prompted` is
  not set, so the next load tries again. The code is from `4bd17a75` (2026-03-12). Found
  this session while finding the `DatabaseClosedError` of `8d48b999` (*Status*, G.10). Not
  fixed here; it needs a `.catch` and a test.
- ~~**A stored copy can only go into the household the person acts in now**~~ **Fixed in
  H7a** (O22-A; task L.5 of [the H7 plan](2026-11-21-households-plan-h7.md), decision T73;
  not merged, not deployed). The question lists every household where the person may copy
  (`canCopyInto`), a household joined on this device included (O57-B), and **A new
  household**. Another household moves the page there first; the copy runs after the
  reload. No household input on the import mutations was needed (H7 decision T71).
- ~~**The manual prompt "Import local data to cloud?" does not name the household**~~
  **Fixed 2026-11-19** (`docs/global/bugs/2026-11-19-bug-manual-import-names-no-household.md`).
  The question with no stored strategy now asks "Copy your offline data into {household}?"
  like the stored copy, waits for the household, and offers no copy to a member (who gets
  the sentence and Done, before any location question). The text that was here: it named no
  household, and a member pressing Import got the role error only after "Import into which
  location?".
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
| G.1 | Step 3: make the SQL with `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel …`, or by hand | `--from-migrations` needs a shadow database. `--from-schema-datamodel <the schema at the commit before> --to-schema-datamodel prisma/schema.prisma --script` needs none and gives Prisma's own SQL. `migration.sql` was made that way, then commented by hand |
| G.1 | Step 4: add the migration to `MIGRATIONS` and add `assertHouseholdInvites` | Not enough. The Prisma client is generated from the FINAL schema, so a `prisma.user` read with no `select` asks for `activeHouseholdId`. Four such reads run BEFORE the fourth deploy (in `assertHouseholdsBackfill` and `assertDropUserScope`) and would fail with `P2022` at Step 7. Each now has an explicit `select`. The header comment of the script says so for the next migration |
| G.1 | File list: schema, migration, `verify-migration.ts`, the two fakes | The new model and column also broke 2 server test files: `purge-coverage.test.ts` (every model must be deleted or kept on purpose by each purge path) and `e2eUsers.test.ts` (the route answers the whole stored row). And `tsc` found 11 test fixtures that build a full `UserRow` and needed `activeHouseholdId: null`. `clearAllData` now keeps `householdInvite` on purpose (an invite is about who may join, not about data). `/e2e/cleanup` keeps it ONLY until G.6: **G.6 must add its `deleteMany` and take `householdInvite` off that path's `kept` list** |
| G.1 | Step 5: the invite fake models `expiresAt: { gt }` | The shared `where` checker (`whereKeys.ts`) had no kind for `{ gt: Date }`. A new kind, `dateGt`, was added with a test |
| G.1 | Step 4: add the entry to `MIGRATIONS` after `shared_carts`, applied by the fourth deploy | Not enough, and the first version was wrong. The FIRST restore loop in `main()` put back "every migration except three named ones", so the new migration went into the first deploy, right after `add_user`, and its `CREATE TABLE` would fail: the `HouseholdRole` type does not exist until `add_households`. Step 7 would have failed before any assertion. A reviewer found it. Fixed by `scripts/migrationDeploys.ts`: each deploy now names its own migrations, and `migrationDeploys.test.ts` fails, with no database, while a migration folder is in no group or the groups are out of name order |
| G.1 | Step 5: `userFake` needs `activeHouseholdId` and the T14 `findUnique`; the invite fake needs `create`, `findUnique`, `findMany`, `updateMany` | G.4 writes `activeHouseholdId` with `user.update` (one row, P2025 when none), and G.3 filters invites by `householdRole` (a manager sees and revokes only `member` invites, O15). The plan left out both. Added in the G.1 review fix, with contract tests and mutation checks |
| G.2 | Files: `household.ts`, `authz.ts`, `mutationRoleCache.ts` and their three tests | Not enough. With T14 the household is read through the `User` row, and **31 server test files** seeded member rows with no `User` row (in Postgres the foreign key makes that impossible). 638 tests failed. Fixed in the fakes, not file by file: `createUserFake` got a `rowForEveryMember` option, and `householdWorld` turns it on. A read sees a `User` row for every person a member row names or has EVER named (so a removed person still has a row and gets `NO_HOUSEHOLD`, as in Postgres); it does not store it. A write stores only the one implied row it changes, after its argument checks pass. The ids seen are kept outside `state`, so a rolled-back transaction does not remove them; `reset` forgets them. (The first version implied a row only while a member row named the person, and stored every implied row at the start of any write, even a refused one. The G.2 review found both.) Four files with hand-written `householdMember.findFirst` stubs (`import`, `item`, `shelf`, `tag` resolver tests) now stub `user.findUnique`, and three ownership files that build `householdFake` alone got a `user` fake |
| G.2 | T15: add `delete cache.householdId` to `forgetLocationRoles`; the brief said nothing about tests that pin a household | Since H4, **12 test files** pinned `requestCache.householdId` to choose one of two households (the H4 pattern), **9** of them on MUTATIONS. After T15 the pin is forgotten before the field, so it silently did nothing: 18 tests failed at once, and others went on passing only because the oldest membership happened to be the pinned one. A new helper, `world.setActiveHousehold(userId, householdId)`, sets `User.activeHouseholdId` instead. Every pin used by a mutation now goes through it (`import-role-gate`, `import-ownership-cart`, the four `*-live-publish` files, `catalog-household`, `vendor`, `location-roles`). A pin used only by queries still works and stays (`export-scope`, `import-check`, `two-households-reads`, one `location-roles` test) |
| G.2 | Step 6: the E2E-level mutation ("`ensureHousehold` back to `findFirst`") | Not run: it needs a database, and a subagent runs no database command. The unit tests are the guard (mutation M5 in the G.2 report turned 7 of them red) |
| G.2 | Step 6: the mutation checks named only `household.test.ts` | In the first G.2 commit, 6 converted test files (`cart-live-publish`, `catalog-household`, `catalog-live-publish`, `location-live-publish`, `location-roles`, `stock-live-publish`) set an active household that was ALSO the oldest membership, so `setActiveHousehold` there did nothing (the reviewer's mutation "ignore `activeHouseholdId`": 14 red, none in those 6). The review fix makes the active household join LATER than another membership in each fixture. The same mutation now turns 120 tests red, in all 6 of those files |
| G.3 | Step 2: "revoking another household's invite is FORBIDDEN"; Step 4: `revokeInvite` is one conditional `updateMany` that returns `count === 1` | The two do not fit: one `updateMany` with `householdId` in its `where` cannot tell another household's invite from an unknown id, so it answers `false`. G.3 keeps the single statement and answers `false` for every invite this caller may not revoke: an unknown id, another household's, one already used or revoked, and a `manager` invite for a manager (O15-A). The same answer for all of them, so the answer says nothing about another household's ids (the idea of T18). A household `member` still gets `FORBIDDEN`, from the role check |
| G.3 | File list: `invite.ts`, `invite.resolver.ts`, the schema, `index.ts`, the live guard | Two fakes needed more. `householdWorld`'s client had no `householdInvite` (G.1 added the store to `householdFake` but not to the joined client, so no resolver test could reach it). And `userFake.findMany` refused `select`, so reading the creators' names would also have read their e-mail addresses. Both added, with contract tests |
| G.3 | "If G.3 needs `orderBy` for a stable list, extend the fake" | Not needed. `householdInvites` sorts in code, by `createdAt` and then `id`, so the order is fixed without `orderBy` and the invite fake did not change |
| G.3 | Step 2 listed `invitePreview` names only for VALID | `ALREADY_MEMBER` carries the names and roles too, so the join page can say WHICH household the person is already in. Only `INVALID` carries none |
| G.3 | Note on `clearAllData`: G.3 decides how `householdInvites` shows an invite whose locations were all deleted | It is listed, with an empty `locationRoles` list (test "an invite whose every location was deleted is listed with an empty role list"). G.9 decides whether the Members page says why the list is empty |
| G.4 | Step 5: "`ALREADY_MEMBER` checked after the claim → 'invite stays unused' red" | Not true inside one transaction. The `ALREADY_MEMBER` throw rolls back the claim, so the invite stays unused either way, and the stored state is the same. Two things DO change, and the tests pin those: the claim is attempted (a spy on `updateMany`), and a member whose link was used by someone else in the meantime gets `INVITE_INVALID` instead of `ALREADY_MEMBER`. Moving the check after the claim turns both red |
| G.4 | Step 3.2: "Read the invite by token. None → `INVITE_INVALID`" | Not enough. Without an open check on the read, a member who opens a USED link gets `ALREADY_MEMBER`, where `invitePreview` says INVALID. The join checks used, revoked and expired on the read too (the same `isOpen` as the preview), before any other check. The claim still checks all three again, for the race |
| G.4 | Step 1: one race test, "the invite is claimed between the read and the claim" | It pins only `usedAt: null`. The claim has three keys (T17), and a claim that forgot `revokedAt` or `expiresAt` passed every listed test. Two more race tests: the invite revoked, and the invite expired, between the read and the claim. Each key is now red on its own |
| G.4 | Step 3.3: `lockHousehold(tx, invite.householdId)` | The household can be deleted after the invite is read. `lockHousehold` then throws Prisma's P2025, which would reach the person as an internal error. It is mapped to `INVITE_INVALID` (the invite went with the household); any other error is not |
| G.4 | Step 3.9: "the shared fakes must model this `where` ... by reading the other stores" | The world owns no catalog, log or cart store. `householdWorld` got a `contents` store of plain rows (catalog rows by household, logs and carts by location, cart rows by cart), rolled back with the rest. The brief also said "the fakes model no cascade"; that could not stay true: without the member row cascade, a deleted household kept the joiner as a member, and `ensureHousehold` could still pick it. `household.deleteMany` now cascades (members, invites, location roles, locations, stock rows, `contents`, and `User.activeHouseholdId` SET NULL) |
| G.4 | Files: no change to the existing fake tests | `householdFake.test.ts` used `members: { every }` as its example of a filter the fake does NOT model. G.4 models it, so the example is now `members: { none }` |
| G.4 (review) | T21: "One statement means no gap between 'is it empty' and 'delete it' in our own code" | False against a concurrent JOIN. Person A owns empty HA with an open invite to B. A joins HC while B joins HA. B locks HA, adds their member row, commits. A's `DELETE` waited on HA's row lock; under READ COMMITTED Postgres re-checks only the HA row, and the `members: { every }` subquery keeps its old snapshot, so HA is deleted with B's new membership. Fixed: the join locks the target AND every household it may delete, in one call sorted by id (`lockHouseholds`). B's join then waits, and finds HA gone (`INVITE_INVALID`). A household that was not locked is never deleted |
| G.4 (review) | T16 and root `CLAUDE.md`: "only `joinHousehold` and `createHousehold` write a `User` row; never write one after a household lock" | A household delete also writes `User` rows: `User.activeHouseholdId` is `onDelete: SetNull`, and a person who left or was removed still names the household. So a join that deletes an empty household can write another person's `User` row while it holds household locks, and two joins can deadlock. Fixed by a retry: the whole join transaction runs once more on Prisma `P2034` (`retryOnceOnConflict`). Remove and leave are unchanged (T16; G.5 and the owner decide) |
| G.4 (review) | T22 and the G.4 brief: the join never calls `requireHousehold` | Correct, but then nothing set the first sign-in claim. A person whose FIRST request is the join kept `householdSetupAt: null`, so after a later leave or removal `ensureHousehold` made them a new household instead of `NO_HOUSEHOLD`, and a first request racing the join could make a stray empty household. The join now sets the claim right after `lockUser`. No old fixture could see this: all set `householdSetupAt` |
| G.4 | Live: "none for the deleted HP" | Also none for a KEPT own household: nothing in it changed. The joiner's other tabs still hear the one event for the joined household, because `shouldDeliver` checks membership per event, and the joiner is a member there by then. Tested both ways |
| G.5 | Step 3: "read the caller's and the target's member rows; use `requireHouseholdRole` for the caller", inside the transaction after `lockHousehold` | `requireHouseholdRole` read through the GLOBAL `prisma`. Inside an interactive transaction that needs a second pool connection while the transaction holds the first; a small pool would make them wait until a timeout. No resolver did that before. It now takes an optional fourth argument, the client to read with, and the three resolvers pass `tx`. `authz.test.ts` pins the argument itself. (This row first said the fake gives `tx` and `prisma` as "the same object", so no resolver test could tell them apart. That was wrong: they are different objects that SHARE the model objects. The review of G.5 gave the test file's `prisma` mock its own copy of each model object over the same stores; a spy on `prisma.householdMember.findUnique` then sees only reads outside a transaction. Dropping `tx` from the three calls turns 4 tests red) |
| G.5 | Step 3, `createHousehold`: `lockUser`, the membership count, the writes, `activeHouseholdId` | Also the first sign-in claim (`householdSetupAt`) when still null, as the G.4 notes say. Without it a person never set up who creates a household and later leaves would get a new household instead of `NO_HOUSEHOLD`. Test "a person never set up can create one, and the first sign-in claim is set" |
| G.5 | Step 1: "two creates at once make one household ... the fake proves the check comes after the lock" | It does not. The queue (`serialTransactions(true)`) runs the two transactions one after the other with or without `lockUser`, so that test stays green when `lockUser` is deleted. The ORDER test ("the user lock is taken before the membership is read") is the one that goes red. Both are kept |
| G.5 | Step 3 named no lock-order test for `setHouseholdRole`, `removeMember` and `leaveHousehold` | Added: for each, the household lock is the first call, before any role read. Moving `lockHousehold` after `requireHouseholdRole` turns each one red |
| G.5 | Files: `household.resolver.test.ts` modified | Not needed. `lib/authz.ts` and `lib/authz.test.ts` were (the row above) |
| G.5 | The plan did not say what `setHouseholdRole` does for the role the person already has | It changes no member row, publishes nothing, and returns the person's row (the live rule: a change that changes nothing sends nothing). The household lock's `UPDATE` still runs, so `Household.updatedAt` moves; the lock must come before the role read. (The first wording said "writes nothing", which was not true.) Also not said: a manager who removes themself. It is `BAD_USER_INPUT`, the same as the owner; a manager or member uses `leaveHousehold` |
| G.5 (review) | Step 3: "`lockHousehold` first" for set-role, remove and leave | `lockHousehold` is an `update`. When the household is deleted after `requireHousehold` found it (the owner's join in another tab deletes it as empty), it throws Prisma's `P2025`, an internal error. The three now lock with `lockHouseholds` and answer `FORBIDDEN` when the row is gone (`lockOrForbid`). `deleteLocation` and `clearAllData` have the same shape and were left alone (*Known gaps*) |
| G.5 (review) | The docs commit `6e0da9ac` | Its subject says "record task g.7"; it records task G.5. History was not rewritten |
| G.6 | Files: `e2eCleanup.ts`, its test, `purge-coverage.test.ts`, `e2eHouseholds.ts`, `cleanup-endpoint.spec.ts`, `cloudUsers.ts` | Not all. `e2e/helpers/cloudTeardown.ts` keeps its own copy of `CLEANUP_MODEL_KEYS`, and `e2eCleanup.test.ts` fails when the two lists differ, so it needed `householdInvites` too. Three more comments still said "one household per person" or "at random" and were rewritten: the `addHouseholdMember` comment in `cloudUsers.ts`, the test at `e2eHouseholds.test.ts:332`, and step 2 of the 409 order in `e2e/CLAUDE.md`. The cleanup counts in root `CLAUDE.md` and `e2e/CLAUDE.md` (18) are now 19 |
| G.6 | Step 2: "seed one invite and assert its count is at least 1" | Done, and the spec also reads the invite back BEFORE the cleanup with `householdInvites`. It cannot read it back after: like `locations`, that query runs first sign-in and would answer for a brand-new household. The `createdById` half of the filter (an invite the user made in a household they do not own) has no real-SQL check; only the unit test pins it |
| G.7 | *Facts*: "`PostLoginMigrationDialog` opens only when `migration-strategy` is set"; Step 6: the local "Sign in to join" "must NOT set `migration-strategy`" | Not enough. `usePostLoginMigration` also PROMPTS ("Copy local data?") whenever local items exist and `migration-prompted` is unset, with or without a strategy. A local visitor with data would be asked to copy it right after sign-in, on the join page, while `join.needsCloud` says it is not copied. "Sign in to join" now sets `migration-prompted` too, as "Switch without copying" in `DataModeCard` does. The test asserts both keys |
| G.7 | T23: the guard compares `household.id` with `localStorage['last-household-id']` | Misses the person's other tabs, which T23 names as the reason for the guard. The tab that joins stores the new id, and `localStorage` is shared, so the other tab reads "new = stored" and keeps the old rows. The guard compares with the id THIS tab saw first, and with the stored id only before it has seen one. Test "user's other tab also clears…"; mutation M3b |
| G.7 | Step 2: `CloudAuthGuard` navigates with `search: { redirect: pathname + searchStr }` | On `/sign-in` itself the guard (mounted in the root) would navigate again and replace the return path with the sign-in page's own URL. It now does nothing on `/sign-in`. Test "does not send the sign-in page to itself"; mutation M9 |
| G.7 | Step 6: "role names through the existing role keys" | Only `roles.location.*` existed. `roles.household.{owner,manager,member}` was added with the O11 names (擁有者, 管理者, 成員). Two texts that are not in the O17 table were also added, for the owner to review in the PR: `join.error` ("Could not join. Try again." / 「無法加入，請再試一次。」) and `join.loadError` ("Could not load this invite. Try again." / 「無法讀取這個邀請，請再試一次。」). `join.ownDataKept` is NOT used: `joinHousehold` does not say whether the own household was kept, so the page cannot know when to show it |
| G.7 | Step 5: tests stub `clearCache` and `reload`; nothing about stories | Every cloud role story answers `GetHousehold` with `household-role-story`. Once the guard is mounted, a different stored id would make it clear the cache and reload the Storybook page. `cloudRoleStorySetup` now stores that id as the last household too |
| G.7 | T24: `safeRedirectPath` refuses `//` and `/\` | Also refuses a control character. A browser drops a tab or a new line inside a URL, so `/<tab>/evil.example` would become `//evil.example` |
| G.7 | T24: "check the two prop names against the installed `@clerk/react` types" | Checked: both are right for `@clerk/react` 6.1.0. `SignInProps` has `forceRedirectUrl` and, through `SignUpForceRedirectUrl`, `signUpForceRedirectUrl` (`@clerk/shared` `dist/runtime/index-BVnpqOxQ.d.ts`) |
| G.7 (review) | T23 and Step 6: "Join: the mutation, then `switchToHousehold(result.id)`", which reloads | Neither said WHERE the person lands. A reload keeps the URL `/join/<token>`, and `invitePreview` answers INVALID for a used invite before it checks membership, so the person who just joined read "This invite is no longer valid". `switchToHousehold(id, { to })` now takes a target (`location.replace`); the join page passes `/`, also in its catch path. `HouseholdChangeGuard` still reloads in place |
| G.7 (review) | T23, the guard's comment and `routes/CLAUDE.md`: a join, a leave and a removal "reach" the guard | A leave or a removal that leaves the person in NO household does not: `GetHousehold` fails with `NO_HOUSEHOLD`, there is no id, and the old rows stay in memory and in `Player1InventoryCloudCache`. Text corrected; G.8 got Step 3b (clear on the no-household screen) |
| G.7 (review) | T23: compare `GetHousehold`'s id | `GetHousehold` is `cache-and-network`, so its first id can come from the cache restored from IndexedDB, before the server answers. With another tab still saving its old snapshot, the guard reloaded for nothing and stored a wrong id for a moment. It now acts only on a server answer (`networkStatus === NetworkStatus.ready`), and never stores or switches on a cache-only id |
| G.7 (review) | T24: refuse a path starting with `//` or `/\` | `/..//evil.example`, `/.//evil.example` and `/%2e%2e//evil.example` pass that check, and the browser resolves them to `//evil.example`. `safeRedirectPath` now resolves the path with `new URL(raw, origin)`, requires the same origin and a pathname not starting with `//`, and returns the RESOLVED path |
| G.8 | Step 1: `errorCode` is "the `extensions.code` of the failed query"; *Facts*: `useHousehold` reports `isError: !!error && !data` | Not wrong, but the easy way is a trap. Apollo 4.1.6 keeps the CACHED household in `data` next to the error (measured: `{ data: A, error, networkStatus: 8 }`), and a person who was just removed almost always has their old household cached. An `errorCode` tied to `!data`, like `isError`, would never be set for them, so the screen would never show. `errorCode` reads the error alone. Test "gives the code also when an old household is still cached"; mutation M7 |
| G.8 | Step 2: show the screen "when `errorCode === 'NO_HOUSEHOLD'`" | Not enough on its own. A refetch (a live event, a reconnect) first reports `loading` with NO error (measured: `networkStatus: 4`, `error: undefined`), so the page would flash and mount pages that fail. The gate keeps the screen once shown, until a household arrives |
| G.8 | Step 3 and the G.5 note: the creator's other tabs get `LOCATION`, refetch `GetHousehold`, "and the guard then sees the new id" | The refetch is real (tested). But `HouseholdChangeGuard` does NOT clear for that new id: Step 3b removed `last-household-id`, and a tab that opened on the no-household screen has never seen an id, so the guard only stores it. Components could keep state from before. The gate now calls `switchToHousehold(id, { to: '/' })` itself when a household arrives after the screen showed. A tab that did see the old id while it was still a member gets BOTH this switch and the guard's reload; both clear the cache, and whichever navigation runs last wins |
| G.8 | *Files*: `NoHouseholdGate/` with "stories, smoke test" | The gate has no story, like `NoLocationsGate`. It needs a router, and in Storybook its Step 3b clear (`forgetHousehold`) would empty the real cloud cache. It is tested through the real root in `routes/noHousehold.cloud.test.tsx`. The screen has the stories |
| G.8 (review) | Step 3b: clear the cache and the two keys when the screen shows | It assumed that clearing the cache removes the old rows from the SCREEN. It does not: Apollo sends a mounted query no new result after `cache.reset()`, so the sidebar kept the old household's name and the switcher its locations. The gate now refetches every active query after the clear, so they go to "loading" with no data |
| G.8 (review) | Step 3b: the screen shows "until Create" | It did not say how a person leaves the screen other than Create. Sign-out and sign-in as ANOTHER account in the same tab left the old account's `NO_HOUSEHOLD` in Apollo, and the gate (mounted on `/sign-in` too) kept showing the screen to the new account. The gate now starts again when the Clerk user id changes to another account, and refetches `GetHousehold`. How a person with no household signs out or switches to local mode on a phone (the gate also covers `/settings`) waits for an owner decision |
| G.8 (review) | Step 3: switch when a household id arrives | Loop safety rested on an Apollo internal that no test pinned (every gate test stubs `clearCache`). The gate now ignores the id cached when the screen first showed. Cost: a person removed and then invited back to the SAME household, who joins in another tab, keeps the screen in this tab until a reload |
| G.9 | Step 2: set roles "through `permissionsFor` (`src/test/rolePermissions.ts`) plus `MockedProvider` results" | The page tests set the role through `GetHousehold` in `MockedProvider` (the `cloudRoleBaseMocks` path), so the REAL `usePermissions` reads it. `permissionsFor` cannot tell `canManageMembers` from `canEditCatalog` (same value), so a page test through it would not see the page reading the wrong right. `usePermissions.test.tsx` checks the three roles give three different answers |
| G.9 | Notes from the review of G.7, and the main session: refetch `GetHousehold` through the WATCHED query after `leaveHousehold` | Not done that way, on purpose. Through the watched query a new household id also reaches `HouseholdChangeGuard`, which reloads the members page while the leave handler calls `switchToHousehold(id, { to: '/' })`: two navigations race. A `NO_HOUSEHOLD` there makes `NoHouseholdGate` unmount the page in the middle of the handler. `useLeaveHousehold` asks with `client.query` and `fetchPolicy: 'no-cache'`, then ALWAYS loads a page: `switchToHousehold(id, { to: '/' })`, or `forgetHousehold()` and `location.replace('/')`. The gate then learns `NO_HOUSEHOLD` on that fresh load, so the trap "a failed `client.query` puts no error into the watched query" does not apply. Tested: the switch and its target, the forget, and that nothing moves on a refused leave |
| G.9 | Step 2: "Every confirm (remove, leave, revoke) uses the existing confirm dialog pattern" | Used (`DeleteButton`), with two facts the plan did not say. Its `AlertDialogAction` closes the dialog at once, so its "Deleting..." text is never seen (a `pendingLabel` prop was tried and dropped for this reason). And it has no `catch`, so every `onDelete` the page passes catches its own error and shows the toast |
| G.9 | Files | Also needed: `hooks/useHouseholdMembers.ts` (the seven hooks), `lib/copyText.ts` (Clipboard API and fallback), `components/household/inviteLink.ts`, and `apollo/cloudCache.ts`: `householdMembers: { merge: false }`. `HouseholdPerson` has no `id`, and without a policy Apollo warns "Cache data may be lost" when a refetch brings a shorter list (after a removal). Proved by mutation in `apollo/client.test.ts` |
| G.9 | O17: a key `…members.noAccess` | Not added: `settings.locations.noAccess` already holds the O11 text ("No access" / 「無權限」), so the invite form reuses it |
| G.9 | Step 2: "the invite form lists every location with No access selected" | A test that only checks the starting value passes against a form that SENDS the No access rows, because a row the person never touched is not in the form state. The create test now sets the Garage to Viewer and back to No access, and expects the exact variables. The mutation "send the No access rows" stayed green before this and is red after |
| G.9 (review) | Nothing about pressing a confirm twice | `DeleteButton`'s confirm closes at once, and a leave takes several steps (the mutation, a `GetHousehold` read, clearing the cache, a page load). A person in households A and B could confirm Leave again in that time; the second `leaveHousehold` is answered for the household they are in NOW, so they would leave B too. Fixed twice over: `useLeaveHousehold` keeps one leave per module (a second call shares the running promise), and the page replaces the Leave button with "Leaving…" in an `<output>`. Remove got the same per-row guard ("Removing…"), because a second `removeMember` got `FORBIDDEN` and a false error toast |
| G.9 (review) | The page reads `invites.isLoading` only | A failed `HouseholdInvites` read showed "No open invites.". It now shows `invitesLoadError` |
| G.9 (review) | Copy link on an invite ROW | When copying failed, the toast said to select the link, but the row never showed it. The row now shows the link in a read-only field, focused and selected |
| G.9 (review) | `copyText`'s fallback adds a text area to `document.body` | Inside a Radix dialog `FocusScope` keeps focus inside the dialog. In jsdom the copy command then ran with focus on the dialog's button, not on the text area (mutation R13). The dialog now copies from its own visible link field (`copyText(text, { from })`). What a real browser copies is a manual check for G.11 |
| G.9 (review) | `useRemoveMember` refetched `GetHouseholdLocations`; `useSetHouseholdRole` refetched `GetHousehold` | Neither did anything useful: the location list is mounted on this page only while the invite dialog is open, and the caller's own role (the owner's) cannot change. Both dropped. (This row also said a FAILED refetch does not reject the mutation with `awaitRefetchQueries: true`. That was wrong; see the row "Review (refetch)" below) |
| G.9 (review) | Nothing about focus | After Remove or Revoke the button that had focus goes away with the refetch, and focus fell to the page body. It now moves to the page heading (Remove) or the **Open invites** heading (Revoke) |
| G.10 | Step 1: one option, `{ skipOnboarding? }` | Not enough for Review Focus 1. A brand-new visitor has no `data-mode` key, so the app starts in LOCAL mode; `newUserContext` always set `data-mode: cloud`. A second option, `cloudMode` (default `true`), leaves the key out. Test 1 uses both |
| G.10 | Test 1: "N's own Home is NOT in N's switcher" | The switcher lists the ACTIVE household's locations only, so it cannot show the old household either way, and that check would pass against a join that deletes nothing. GraphQL cannot read a household the person no longer acts in. The test reads the cleanup's counts instead: N's cleanup deletes N's member row in H (`householdMembers: 1`) and owns no household (`households: 0`). Mutation: `Expected 1, Received 2` |
| G.10 | Test 3: "R's own household was empty and deleted at the first join" | R's first request IS the join (through `joinHousehold`), so R never had a household of their own: the join sets the first sign-in claim. The no-household screen after the removal comes from that claim |
| G.10 | Test 4: "read both households back" | R2's own household cannot be read through GraphQL once R2 acts in H. The test reads H as the owner (`itemStocks`, `cartItems`) and R2's own household through R2's cleanup counts (1 household, 1 item, 1 stock row, 0 cart rows) |
| G.10 | Step 3: `invitePreview` returns the name for INVALID → test 2 (the page) | The page never shows a name for INVALID (`join/$token.tsx` uses `join.heading` there), so no page check can see it. Test 2 also reads `invitePreview` through the API for each link; that check is the one that goes red |
| G.10 | Step 3: `removeMember` without T11 and join without T20 → "R is participant again" | Not what happens. With both deletes gone, the join's `locationMember.create` hits the unique key and the JOIN fails (red only as a 90 s timeout waiting for `/`). With either one alone, test 3 stays GREEN: each removes the old role on this path. "Participant again" needs the rejected design too (`createMany({ skipDuplicates: true })`); then test 3 is red on the value. So test 3 guards "T11 or T20", not each of them. After the review of G.10, test 5 guards T11 alone on real SQL; T20 alone has only its unit test |
| G.10 | Step 3: the `findFirst` mutation "MAY stay green" | It went red. The old rule also ignores `activeHouseholdId`, and R2's own household is the older membership, so R2 acted in their own household. The G.2 unit test is still the guard for the ORDER on its own (a mutation that keeps the active household and drops only the `orderBy` is not caught here) |
| G.10 | Step 2.6 and the G.8/G.9 notes: "the same axe options as `a11y.spec.ts`" | A plain `checkA11y` on a dialog fails on the known `opacity-90` defect of `buttonVariants`, and on one instance nobody had recorded: a PRIMARY filled button inside a dialog is 4.19:1 in light ("Create invite link", "Copy link", "Create a household"). The destructive confirm is 3.56:1 in dark, not the "~4.09:1 (modelled)" `a11y.spec.ts` gives. Dialog scans use `checkDialogA11y` (`e2e/helpers/axe.ts`), which excludes only those filled buttons and only from `color-contrast`. The fix of `opacity-90` stays the follow-up the owner ruled |
| G.10 | The tests listed | Brief added: set-role and the manager limits (test 6), and a larger a11y set (both confirms, the no-household screen and its dialog). The plan's test 6 is two tests (light, dark) covering all of them |
| G.10 | The test list | It named no check of T11 on its own. Test 3 (re-invite) cannot see T11 alone, because T20 removes the same old row at the join. The review of G.10 added one: at the end of test 5 (leave), the person's cleanup must count exactly 1 `locationMember` row (their new household's organizer row); a row left on the owner's Home makes it 2 |
| G.10 | Step 3: the mutation list | It had nothing for issue #381 gap 1, a stock import at a location of another household. The first version of test 4 imported the OTHER household's item at that location, so the item check would refuse it too, and the test could not show the location check works. The review of G.10 changed it to the TARGET household's item, and added the mutation (`requireLocationInHousehold` removed from `requireOwnItemStockRefs`) |
| G.9 (review) | The invite form with no location list | A failed read left Create disabled with no reason; a household with no location showed only the "Location roles" heading. Now `locationsLoadError` and `noLocations` |
| G.11 | Step 2: re-measure with `grep -c "^  '2026" apps/server/scripts/verify-migration.ts`; *Files*: "`MIGRATIONS` now 10" in `apps/server/prisma/CLAUDE.md` | That command prints **0** since G.1: the names moved to deploy groups in `scripts/migrationDeploys.ts` (`MIGRATIONS` there is built from the groups). The count is `grep -o "'2026[0-9]*_[a-z_]*'" apps/server/scripts/migrationDeploys.ts \| wc -l`, which gives **10**. G.1 had already written this into the prisma `CLAUDE.md` |
| G.11 | *Files* did not name the H3b runbook | `2026-11-15-deploy-runbook-households-h3b.md` says the rehearsal must list **exactly three** pending migrations ("if it lists more, stop"), the release log three lines, and H3a 5 query 1 `LIMIT 4`. With H5b in the release each is one more. Section 9.2 of the H4 runbook gives the new numbers, and the H3b runbook now points there at all three places. Without it the rehearsal would have stopped on a correct pending list |
| G.11 | *Deploy notes*: "a person removed from their only household while on the old bundle sees failing requests until the web deploys" | Between the two deploys nobody can remove anybody: only the NEW bundle has the Members page. The real window is AFTER the web deploy, for a device that has not taken the update yet, whose person is removed by someone on the new bundle. Runbook 9.8 says it that way |
| G.11 | *Files*: the docs to update | Most were already updated, task by task, by G.1–G.10. What was still missing: root `CLAUDE.md` had no H5b overview (the G.3 queries and mutations, the household guard), no E2E paragraph for `household-invites.spec.ts`, and test counts from H5a; the design's *Sequencing* row, the phase plan's H5 outline and the H4 runbook's section 8 still said H5a was "awaiting PR" (it merged as #384) |
| O19 | The brief: "Suggested English: Use local mode" | The app calls local mode **Offline Mode** (`settings.dataMode.local.title`, 「離線模式」), and its own switch says "Switch to offline" (`signOutOfflineDialog.switchToOffline`). "Local mode" would be a third name for the same thing. The button says **Switch to offline mode** / 「切換至離線模式」, for the owner's review in the PR |
| O19 | The brief: check that the gate is off after the reload | Already true and already tested ("does nothing in local mode" in `NoHouseholdGate.test.tsx` checks that nothing is cleared). No test checked that the PAGE shows in local mode while Apollo still holds a `NO_HOUSEHOLD` answer. Added; mutation M7 (the gate ignores the mode) turns both red |
| O19 | The brief: a Known gap "cannot switch to another account from the screen" | Overtaken the same day: the owner added **Sign in to another account**. The gaps that are really left are in *Known gaps* |
| O19 | *Known gaps*: switching back to cloud with "Copy local data" in no household "should be refused with `NO_HOUSEHOLD` and show an import error next to the screen" | Wrong, and read from the code without running it. The copy never reaches an import mutation: it waits for `GetLocations`, which fails with `NO_HOUSEHOLD`, so `locationsLoaded` stays false. Nothing shows, the key stays, and the copy runs into the NEXT household, a shared one included. Found by the whole-branch review; fixed by O22-A (decision T31) |
| Review | The `joinHousehold` transaction used Prisma's 5 s default `timeout` | An E2E run against the remote test database took 5064 ms: "The timeout for this transaction was 5000 ms, however 5064 ms passed" (`invite.resolver.ts:389`). A re-run passed. `joinHousehold` and `createHousehold` now pass `HOUSEHOLD_MOVE_TIMEOUT_MS` (15 s, `lib/household.ts`), following `checkout` and `consumeRecipes` (30 s each, whose query count grows with the data; these do not) |
| O18 | O18-A: a removed or demoted manager's open invites stay open, "the owner sees them and can revoke them" | It did not consider the removed person using the invites THEMSELVES. A manager sees every open `member` invite with its token, so a removed manager could rejoin through their own invite, and the same after a leave. Replaced by O20 (decision T30) |
| G.7/G.8 | *Known gaps*: "a tab that sends nothing stays stale" | Incomplete. A tab that WRITES does not fail: for a person in two households, the write goes into the other household through `requireHousehold` (T14), and the tab shows nothing. Recorded as O21, owed to H7 |
| T22 | The code comments of `invitePreview` and `joinHousehold`: T22 also keeps "a brand-new person" from getting "a household made just by looking at a link" | Not true. On the real `/join/…` page `HouseholdChangeGuard`, `ActiveLocationProvider` and `PostLoginMigrationDialog` already send queries that call `requireHousehold`, so first sign-in makes a household anyway, and the join deletes it as empty (T21). The comments and the T22 row now give the one real reason |
| G.8 | `useCreateHousehold`: after `ALREADY_IN_HOUSEHOLD`, read `GetHousehold` "from the network" | It used `fetchPolicy: 'network-only'`, which writes `ROOT_QUERY.household`. The watched `GetHousehold` then gave `NoHouseholdGate` the new id, so it called `switchToHousehold` too: two cache clears and two page loads. Measured: `switchToHousehold` called **2** times in `routes/noHousehold.cloud.test.tsx`. Now `no-cache`, the same rule `useLeaveHousehold` already had |
| Review (refetch) | The G.9 review: "with `awaitRefetchQueries: true`, a FAILED refetch does not reject the mutation" (measured on Apollo 4.1.6), and the same sentence in `hooks/CLAUDE.md` | False. Apollo waits for the refetches with `Promise.all` (`@apollo/client@4.1.6`, `core/QueryInfo.js`, `markMutationResult`), so a failed refetch REJECTS the mutation, and a remove or role change that worked showed "Could not save the change". The "measurement" was the test "a remove that worked shows no error…", which waited a fixed 50 ms and passed only when the toast came later than that. `useSetHouseholdRole` and `useRemoveMember` now send the mutation with no `refetchQueries`, then `await client.refetchQueries(…).catch(() => {})` (`refetchAfterWrite`). The page test now waits for "Removing…" to go away, and 4 hook tests in `useHouseholdMembers.test.tsx` await the call itself. With the old hook code they are red every run (5 of 5 at load 3), not only under load |
| G.7 | Step 5: the household guard, with unit tests only; G.7's brief named no E2E spec, and no task after it ran `settings/import-export-cloud.spec.ts` or `settings/import-strategies.spec.ts` in `cloud` | `HouseholdChangeGuard` reloads the page when the server answers a household id the browser did not store. `/e2e/cleanup` deletes the household and the next request makes a new one, so four re-import tests that load a page, call `cleanupCloudData` in the MIDDLE of the test and load a page again were reloaded about 1.4 s after the second load, while `fetchExistingData` or the location menu was in flight. The import never ran and "Import complete." never showed. Found by the full gate at `b0cde30f`. The app is right; the specs now call `forgetDeletedHousehold(page)` (`e2e/helpers/cloudTeardown.ts`) after such a cleanup. Any NEW spec that cleans up mid-test after a page load needs it too |

## Status

**Plan written 2026-11-18** on `feature/households-h5b`, based on `develop` at `4307d30a`
(HEAD `770a75e8`). Owner decisions O13–O16 answered 2026-11-18 (all A), O19 answered the same day; O17 texts are
reviewed by the owner in the PR.

**Task G.1 is done** (`aa596f4d`, `4c01a450`), with review fixes (`75a16ca6`, `2c91f68c`).
The review found that the first restore loop of `verify-migration.ts` would have applied
`add_household_invites` in the FIRST deploy, before `add_households`; the deploy groups now
live in `scripts/migrationDeploys.ts` and are unit-tested. **Step 7 ran on 2026-11-18
against the TEST database, with the owner's consent:**

| Run | Result |
|---|---|
| 1 | exit 1. All four deploys in the right order; 163 `ok —`, then `FAIL:` on the token index check. The check looked for `("token")`, but Postgres writes an all-lower-case column with no quotes: `USING btree (token)`. The index was right; the check was wrong. Fixed in `5c5ad7d5` |
| 2 | **exit 0, 213 `ok —` lines, 0 `FAIL:`**, `Migration verified.` That is 186 before H5b plus **27** new invite lines (14 shape, 13 deletes and FKs). The test database is now fully migrated |

The plan's optional Step 7 mutation (CASCADE in place of SET NULL) was not run.

**Task G.2 is done.** `ensureHousehold` picks one fixed household by decision T14, through
one private `pickHousehold` used by both reads, with one `user.findUnique` on the common
path. `forgetLocationRoles` also forgets `householdId` (decision T15). The claim
`updateMany` did not change, so `verify-migration.ts` needs no change. See the G.2 rows of
*What this plan got wrong* for the test fixtures it had to change.

**Task G.3 is done.** `lib/invite.ts` (token, lifetime, `parseLocationRoles`, the two
error builders) and `resolvers/invite.resolver.ts`: `createInvite`, `householdInvites`,
`invitePreview` and `revokeInvite`. Both mutations publish household-level `LOCATION`; the
live guard now holds 64 fields. `invitePreview` uses `requireAuth` only (T22). See the G.3
rows of *What this plan got wrong*.

The review of G.3 (no security or authorization bug; `revokeInvite` → `false` accepted)
led to these fixes: the "oldest first" test now has the older invite carry the id that
sorts later, plus a tie test; `householdFake` APPLIES `select` on invites (before, it was
ignored, so a test could get the token back where Prisma would not); `invitePreview` skips
the read for a token of the wrong length and no longer reads the token column;
`createInvite` publishes right after the write, before the two name reads; and a test
pins that an expired, unused invite can be revoked. See *Notes from the review of G.3*
under Task G.3 for what later tasks must keep.

**Task G.4 is done** (`f8292f3a`, `d368c1e5`, `f202059a`). `joinHousehold(token)` in
`resolvers/invite.resolver.ts`, one transaction in the order of Step 3, with `lockUser`
(`lib/household.ts`) first and `emptyHouseholdWhere` (`lib/invite.ts`) last. It never calls
`requireHousehold`. The live guard holds 65 fields. Server tests: 1961 / 74 files before,
2025 / 75 after. See the G.4 rows of *What this plan got wrong* and *Notes from task G.4*
under Task G.4.

The review of G.4 found three issues, all fixed: the join now locks every household it
may delete (sorted by id, with the target, `lockHouseholds`); the join transaction is
retried once on `P2034`, because a household delete writes `User` rows through SET NULL;
and the join sets `householdSetupAt`. See the three "G.4 (review)" rows of *What this
plan got wrong*.

**Task G.5 is done.** `householdMembers`, `setHouseholdRole`, `removeMember`,
`leaveHousehold` and `createHousehold` in `resolvers/household.resolver.ts`, tested in
`household-members.resolver.test.ts` (50 tests; 60 after the review fixes). `createHouseholdFor` (`lib/household.ts`)
is shared by first sign-in and `createHousehold`. `requireHouseholdRole` takes an optional
client, so the three member writes read the caller's role through `tx`. The live guard
holds 69 fields. Server tests: 2043 / 75 files before, 2094 / 76 after, 2104 / 76 after the review fixes. See the G.5 rows
of *What this plan got wrong* and *Notes from task G.5* under Task G.5.

**Task G.7 is done** (`c431025b`). The join page `/join/$token`, the sign-in return path
(`/sign-in?redirect=`, `safeRedirectPath`), the `/join/` exclusions (onboarding redirect,
full-screen), and the household guard (`HouseholdChangeGuard`, `switchToHousehold` in
`apps/web/src/apollo/householdGuard.ts`). Web tests: 2973 passed / 310 files after
G.7. The plan's web baseline at `770a75e8` was 2928 / 305 (2927 passed, 1 flaky), and
nothing under `apps/web` changed between `770a75e8` and the start of G.7, so G.7 adds 45
tests in 5 new files and 6 changed ones. See the G.7 rows of
*What this plan got wrong*. G.10 still needs `newUserContext(..., { skipOnboarding: false })`
for Review Focus 1: only unit tests see the onboarding exclusion today.

The review of G.7 found that a join ended on "This invite is no longer valid" (the page
reloaded `/join/<token>`), that the guard could act on a cached household id, and that
`safeRedirectPath` let `/..//evil.example` through. All fixed in `78163263`; see the G.7
(review) rows of *What this plan got wrong*. G.8 got Step 3b, G.9
and G.10 got notes. Web tests after the fixes: 2983 passed / 311 files.

**Task G.8 is done.** `NoHouseholdGate` and `NoHouseholdScreen`
(`apps/web/src/components/household/`), `useHousehold().errorCode`,
`useCreateHousehold`, `forgetHousehold` (Step 3b, `apollo/householdGuard.ts`) and the
`CreateHousehold` document. A test in `apollo/liveUpdates.test.ts` checks that a FAILED
`GetHousehold` is refetched on `LOCATION` (the open point of the G.5 notes). Web tests:
3017 passed / 315 files (2983 / 311 before). Two new texts not in the O17 table, for the
owner's review: `noHousehold.nameHint` ("Leave it empty to use the default name." /
「留空就會使用預設名稱。」) and `noHousehold.error` ("Could not create the household. Try
again." / 「無法建立家庭，請再試一次。」). A refused name reuses
`settings.household.name.invalidError`. **For G.10:** the plan gives G.8 no axe scan. The
screen and its dialog need one, light and dark, in a cloud spec (`a11y.spec.ts` does not run
in cloud), reached by a leave or a removal.

**Task G.9 is done.** The Members page `/settings/household/members` (cloud only; local mode
goes to `/settings/household`), second in the household sidebar and the mobile accordion in
cloud mode. `MemberList`, `InviteDialog` and `InviteList` (`components/household/`), seven
hooks in `hooks/useHouseholdMembers.ts`, `copyText` (`lib/`), and `canManageMembers` /
`isHouseholdOwner` in `usePermissions`. Web tests: 3079 passed / 323 files (3017 / 315 before).
Fourteen texts are not in the O17 table, for the owner's review in the PR:

| Key (`settings.household.members.*`) | English | `tw` |
|---|---|---|
| `description` | People in this household, and invites | 家庭成員與邀請 |
| `roleLabel` | Household role of {{name}} | {{name}} 的家庭角色 |
| `linkLabel` | Invite link | 邀請連結 |
| `copyFailed` | Could not copy. Select the link and copy it yourself. | 無法複製，請自行選取連結並複製。 |
| `noInvites` | No open invites. | 目前沒有尚未使用的邀請。 |
| `createdBy` | Created by {{name}} | 由 {{name}} 建立 |
| `expires` | Valid until {{date}} | 有效期限：{{date}} |
| `noLocationRoles` | No location roles | 沒有據點角色 |
| `revokeConfirm` | Revoke this invite? The link will stop working. | 要撤銷這個邀請嗎？連結將無法再使用。 |
| `revoked` | Invite revoked | 已撤銷邀請 |
| `removeLabel` | Remove {{name}} | 移除 {{name}} |
| `alone` | You are the only person in this household. If you join another household with an invite while this one holds no data, this one is deleted. | 這個家庭只有你一個人。如果這個家庭沒有任何資料，而你用邀請加入另一個家庭，這個家庭會被刪除。 |
| `loadError` | Could not load the members. Try again. | 無法讀取成員，請再試一次。 |
| `error` | Could not save the change. Try again. | 無法儲存變更，請再試一次。 |

Not built, on purpose: a "this location now has no organizer" note after a removal or a leave
(the plan says "may"; the Locations page already shows **No organizer**), and a reason on an
invite with no location roles (the server sends the same empty list for "made with none" and
"its locations were deleted since"). **For G.10:** the axe scans of this page and its dialogs,
light and dark, in a cloud spec.

**The review of G.9** found that Leave (and Remove) could be confirmed twice while the first
one ran, and four smaller points (a failed invites read looked empty, a failed row copy
gave no link, the copy fallback inside a dialog, focus after Remove or Revoke). All fixed;
see the "G.9 (review)" rows. Web tests: 3102 passed / 325 files (15 more tests, 2 new files). Five more texts not in
the O17 table, for the owner's review:

| Key (`settings.household.members.*`) | English | `tw` |
|---|---|---|
| `leaving` | Leaving… | 離開中… |
| `removing` | Removing… | 移除中… |
| `invitesLoadError` | Could not load the open invites. Try again. | 無法讀取尚未使用的邀請，請再試一次。 |
| `locationsLoadError` | Could not load the locations. Try again. | 無法讀取據點，請再試一次。 |
| `noLocations` | This household has no locations yet. | 這個家庭還沒有任何據點。 |

**Task G.10 is done.** `e2e/tests/household-invites.spec.ts`, 8 cloud tests, all passing
(5.8 min); page objects `JoinPage` and `MembersPage`; `newUserContext` options
`skipOnboarding` and `cloudMode`; `checkDialogA11y` in `e2e/helpers/axe.ts`. It is the
first real-SQL run of the invite, join and member mutations, and **nothing failed on real
SQL that the fakes had accepted**: all 6 functional tests passed on their first run. Twelve
mutation checks (two added by the review of G.10), all red except two that are expected to stay green (see the G.10 rows of
*What this plan got wrong*, and `e2e/CLAUDE.md`). Two findings:

- **`settings-global-pages.spec.ts` failed in `cloud` since G.9**: it still expected six
  household sidebar links, and G.9 added **Members** second in cloud. G.9 never ran that
  spec. The expected list now has Members in cloud only.
- **A filled button inside a dialog fails WCAG AA contrast at rest**: primary 4.19:1 in
  light, destructive 3.92:1 light and 3.56:1 dark. Same cause as the known `opacity-90`
  defect `a11y.spec.ts` records; the primary case had never been scanned. Not fixed here
  (the owner ruled the fix a follow-up with its own visual review); excluded from the
  `color-contrast` rule only, in dialog scans only.

Cloud collects 177 tests in 35 files, local 189 in 23.

**Fixed in `8d48b999`: `pnpm test` exited 1 after G.10, and not because of G.10.** Web
3102 passed / 325 files and server 2104 / 76 all passed, but Vitest reported 2 unhandled
`DatabaseClosedError` rejections "originated in"
`src/routes/settings/household/members.cloud.test.tsx` (G.9). Seen in 2 of 2 full runs and
in 0 of 3 runs of that file alone; the full suite drives the load average to about 18.
The G.10 report blamed the local `bootstrapCarts` effect in `useActiveLocation`. **That was
wrong.** The cause was `usePostLoginMigration` in the cloud root: it calls `getAllItems()`,
two Dexie reads, to see whether there is local data to copy. Under load the second read was
still running when the test's `afterEach` ran `db.delete()`. The test writes nothing to the
local database, so `8d48b999` stopped deleting it.

**Task G.11, Steps 1, 2 and 4 are done** (the docs and the deploy notes). Step 3, the full
gate and `pnpm test:e2e:all`, is still to run. Counts measured 2026-11-18 at `ff2f0df0`,
with no code change since:

| Count | Value | Command |
|---|---|---|
| web tests | 3102 passed / 325 files | `pnpm test` (load average 8 at the start, about 20 at the end; exit 0, no unhandled errors) |
| server tests | 2104 passed / 76 files | `pnpm test` |
| `scripts/spec` tests | 70 passed | `pnpm test` (`pnpm test:spec`) |
| E2E `local` | 189 tests in 23 files | `pnpm test:e2e --project=local --list` |
| E2E `cloud` | 177 tests in 35 files, 8 of them in `household-invites.spec.ts` | `pnpm test:e2e --project=cloud --list` |
| E2E `pwa` | 73 tests in 2 files | `pnpm test:e2e --project=pwa --list` |
| live guard | 69 fields in `publishes`, 0 in `publishesNothing` | the entries of `publishes` in `live-publish.guard.test.ts`; the guard test passes, so the schema has the same 69 |
| `/e2e/cleanup` models | 19 | `CLEANUP_MODEL_KEYS` in `e2e/helpers/cloudTeardown.ts` |
| migrations in `migrationDeploys.ts` | 10 | `grep -o "'2026[0-9]*_[a-z_]*'" apps/server/scripts/migrationDeploys.ts \| wc -l` (the plan's `grep -c "^  '2026" …verify-migration.ts` gives 0) |

**Owner decision O19 is built (2026-11-18).** The no-household screen has three actions:
Create a household, Switch to offline mode, and Sign in to another account (real build
only). See *Owner answers*, the *No household* section of `apps/web/src/routes/CLAUDE.md`,
and *Known gaps*. Code, tests, stories and the E2E steps in `4ab9aea9`. Measured
2026-11-18 at `4ab9aea9`, with the full gate green (`pnpm lint`, `pnpm build` with no
`TS6385`, `build-storybook`, `pnpm check`, `pnpm test`):

| Count | Before | After |
|---|---|---|
| web tests | 3102 / 325 files | **3112 / 325 files** (9 in `NoHouseholdScreen.test.tsx`, 1 in `NoHouseholdGate.test.tsx`) |
| server tests | 2104 / 76 | 2104 / 76 |
| `scripts/spec` tests | 70 | 70 |
| `household-invites.spec.ts` in `cloud` | 8 passed | **8 passed** in 5.0m (test 5 now switches to offline mode and back) |

Mutation checks, each red, each restored from a copy:

| Mutation | Red test |
|---|---|
| M1 no `setItem` of `data-mode` | 2 unit tests; E2E test 5 (`Switch location (current: My Home)` not found) |
| M2 no reload | 2 unit tests |
| M3 reload before `setItem` | "stores local mode BEFORE the reload" |
| M4 offline switch in the default (filled) style | "user sees a second action…" |
| M5 no `aria-describedby` on the hint | "user sees a second action…" |
| M6 the offline switch also signs out | "does not sign the person out" |
| M7 the gate ignores the data mode | 2 gate tests |
| M8 `signOut` before `clearCache` | 3 unit tests |
| M9 no `clearCache` | 3 unit tests |
| M10 account action shown in the E2E build | "is not shown in the E2E build" (`useClerk` throws) |
| M11 no double-press guard | "ignores a second press…" |
| M12 the account action sets `data-mode` to local | "user can sign out…; the cache is cleared first" |
| M13 account action in the outline style | "user sees a third action…" |
| M14 sign out even when the clear fails | "does not sign out when the cache could not be cleared" |

**The whole-branch review is fixed (2026-11-18).** Owner decision O20 (decision T30) is
built: `removeMember` and `leaveHousehold` revoke the person's open invites of that
household in the same transaction, `useRemoveMember` reads the invites again, and the
remove confirm for a manager has one more sentence. O21 is recorded for H7 (*Known
gaps*). Small fixes: `useCreateHousehold` reads with `no-cache` (one switch, not two), the
T22 comments, and runbook 9.8 and 9.9. See the four new rows of *What this plan got
wrong*. Tests: server 2109 / 76, web 3115 / 325, `household-invites.spec.ts` 8 of 8 in
`cloud` (test 6 now also checks O20; with the revoke removed it fails on
`not.toContain`).

**Owner decision O22-A is built (2026-11-18), decision T31.** A copy chosen in
`DataModeCard` ("Copy local data") no longer runs by itself. `usePostLoginMigration` waits
for `GetLocations` and the household, then asks "Copy your offline data into
{household}?" (`'confirming'`) with **Copy here** and **Don't copy**. A non-owner also reads
that the household is shared. A member, or a manager with `clear`, gets a sentence and only
**Done**. The full household choice is owed to H7 (the H7 outline in
`2026-10-31-households-plan.md`). Also from the review: `joinHousehold` and
`createHousehold` pass a 15 s transaction `timeout` (`HOUSEHOLD_MOVE_TIMEOUT_MS`). Tests:
server 2111 / 76, web 3133 / 325, `pnpm test:spec` 70. E2E in `cloud`:
`settings/data-mode-migration.spec.ts` (now presses Copy here) and
`household-invites.spec.ts`, 10 of 10. One pre-existing timing failure in
`members.cloud.test.tsx` was recorded in *Known gaps*; it is fixed (next paragraph).

**A write that worked no longer reports failure when its refetch fails (2026-11-18).**
`useSetHouseholdRole` and `useRemoveMember` used `awaitRefetchQueries: true`, which REJECTS
the mutation when a refetch fails. Each now refetches after the mutation through
`refetchAfterWrite`, which still waits for the read but drops its error. The query keeps
the error, so a failed read shows on the page as before. See the row "Review (refetch)"
of *What this plan got wrong*. Tests: web 3137 / 325 (4 new in `useHouseholdMembers.test.tsx`), server 2111 / 76, `pnpm test:spec` 70.

**The cloud re-import specs pass again (2026-11-18).** The full gate at `b0cde30f` failed 6
cloud tests: 5 in `settings/import-export-cloud.spec.ts` and 1 in
`settings/import-strategies.spec.ts`. Two causes, both in the specs, not in the app:

| Cause | Tests | Fix |
|---|---|---|
| `HouseholdChangeGuard` (G.7) reloads the page after a mid-test `cleanupCloudData`, because the server now answers a new household id. The reload threw away the import (trace: 7 queries of `fetchExistingData` `net::ERR_ABORTED`, then `[vite] connecting...`, then nothing) | cloud → cloud, and the three re-import tests (new household, carts, logs) | `forgetDeletedHousehold(page)` removes `last-household-id` after the cleanup, as a fresh browser would have |
| over the 30 s budget, with no bug: the import alone takes 13 to 15 s on the shared Neon database | local → cloud (28.2 s, 32.4 s with trace), `clear` (30.4 s) and `replace` (31.3 s) | `test.setTimeout(60000)` with the measurements in a comment |

Evidence that the guard is the cause: with `HouseholdChangeGuard` made to return early, the
unchanged cloud → cloud test PASSED. Mutation: `forgetDeletedHousehold` made a no-op → the
cloud → cloud test red with `locator.waitFor: Timeout 30000ms exceeded` on
"Import complete.". No unit test: the app did what it should, and the bug was in the spec.
See the row "G.7" of *What this plan got wrong*.

**H5b is merged into `develop`** (PR #385, merge `938fa2aa`, 2026-11-18). It is not
deployed. It deploys with H3a–H5a at the next checkpoint release (section 9 of the H4
runbook). Follow-ups merged after it: #386 (a failed refresh no longer fails a saved write), #387 (screens show save errors), #388 (the join keeps the copy question), #389 (the copy question names the household), #390 (`isPending` tests). H5c is next.
