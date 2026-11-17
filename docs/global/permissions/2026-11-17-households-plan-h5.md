# Households H5 (invites, join, members, read-only views) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make sharing a household real and safe. This file proposes to split H5 into three
PRs (H5a, H5b, H5c, decision O1) and gives detailed tasks for **H5a only**: the web learns
each person's roles, shows read-only views, and lets a household lose its last location.
H5b (invites, join, members) and H5c (the location people page) are outlined.

**Architecture:** the server already checks every role (H3a–H4). H5a adds two read-only
fields on `Location` (`myRole`, `hasOrganizer`) and one query (`householdLocations`). The web
reads them through one hook, `usePermissions`, and hides the controls a role cannot use. No
migration in H5a. H5b adds the `HouseholdInvite` table and a rule for "which household is
mine" when a person is in two. H5c adds the location people page.

**Tech Stack:** React 19, TanStack Router and Query, Apollo 4, Dexie (web); Express 5, Apollo
Server 4, Prisma 6, Postgres on Neon (server); Vitest, Playwright, Biome.

**Spec:** [2026-10-04-households-design.md](2026-10-04-households-design.md), sections
*Roles*, *Authorization*, *Invite and join*, *Location roles*, *Household roles, removal and
leaving*, *Screens* (*Location pages*, *Location switcher*, *Read-only views*, *Invite and
empty screens*), *Testing notes*, *Known gaps*. Phase plan:
[2026-10-31-households-plan.md](2026-10-31-households-plan.md), *H5* outline, decisions P4
and P6. Earlier phase plans, read their *What this plan got wrong* tables first:
[H4](2026-11-16-households-plan-h4.md), [H3c-2](2026-11-16-households-plan-h3c-2.md),
[H3b](2026-11-14-households-plan-h3b.md), [H3a](2026-11-04-households-plan-h3a.md).

Branch `feature/households-h5`, worktree `.worktrees/feature-households`, from `develop` at
`bf87e839` (after #382, H4), plus the docs commit `7f514fc9`. The PR goes into `develop`.
Nothing deploys until the checkpoint release that ships H3a–H5 together.

**Names in this file.** Tasks are `F.n` (H3a used `3.n`, H3b `B.n`, H3c `C.n` / `D.n`, H4
`E.n`). Decisions are `T1…` (technical) and `O1…` (owner). Outside this file, write them
"H5 decision T1" or "H5 decision O1", because the H4 plan also has a T1 and an O1.

## Global Constraints

- Local mode has no role checks. Every new check is `mode === 'cloud'` only; nothing in
  `apps/web/src/db/` changes.
- Never write `row.userId === ctx.userId` or `row.householdId === …` as an authorization
  check. Every server check goes through `apps/server/src/lib/authz.ts`.
- A household role gives NO location data (design, *Rules that cross the two levels*). An
  owner or manager sees a location's NAME on the settings list, never its stock, carts or logs,
  unless they hold a location role there.
- Household role ladder `member < manager < owner`; location ladder
  `viewer < participant < organizer`. A higher role passes a lower check.
- Every new `Mutation` field goes into `publishes` in
  `apps/server/src/resolvers/live-publish.guard.test.ts`. H5a adds no mutation.
- A server schema change and the web documents that use it go in ONE commit (root
  `CLAUDE.md`, *`pnpm codegen` is all-or-nothing*).
- Node 22.17.1 (`.node-version`). Node 25 breaks the web suite.
- Feature test titles start with `user can …` / `user sees …`; role tests that really set up a
  role use the role name (`location viewer cannot …`).
- Location and household names render as stored, never `capitalize`.
- Plain English in every comment, doc, commit and report.

## Review Focus

The five cases the design implies, that no test in today's suite covers, most likely to hurt
a real user first. Each one has its test in the task named.

1. **A location viewer opens the Shopping page of a location that has no cart for that vendor
   yet.** Today `vendorCart` needs `participant` because it creates the cart, so the viewer
   gets `FORBIDDEN` and an error page. Expected: an empty cart, no error, and no row written.
   (Task F.2.)
2. **A location viewer switches to that location.** `ActiveLocationProvider` calls the
   `bootstrapCarts` mutation on every switch, and it needs `participant`. Expected: no call is
   made for a viewer, and no unhandled error. (Task F.2 server side, F.6 web side. This
   said "F.5 web side" until F.5; T7 and F.6 Step 6 always put it in F.6.)
3. **A person whose location list is empty.** A member added with no location roles, or a
   household whose last location was deleted (after F.7). Expected: Pantry, Shopping and
   Cooking show "You have no locations in this household yet" and **Create a location**, not
   an endless spinner and not a stale location's data. (Task F.7.)
4. **A household manager who is also only a viewer of the active location.** The catalog is
   editable, the stock is not. The two checks must not be one flag. (Task F.4 and F.6 tests.)
5. **An owner with no role on a location.** It shows on the settings list as **No access**,
   can be deleted and reordered, but never shows in the switcher and its data is never read.
   (Task F.3 and F.6.)

---

## Summary

### Where this sits

| Phase | State |
|---|---|
| H1, H2 | ✅ merged into `main`, deployed |
| H3a, H3b, H3c-1, H3c-2 | ✅ merged into `develop`, not deployed |
| H4 | ✅ merged into `develop` (#382, merge `bf87e839`), not deployed |
| **H5** | this plan. **The first phase where two people really share a household.** |
| H6 | transfer, hand-over, purges, activity log |
| H7 | personal location order, household switch and create |

H3a–H4 built every server rule for roles, but no person can reach a second person: there are
no invites. The only way two people share a household today is the E2E-only route
`POST /e2e/household-members`. H5 adds invites, and with them every case the earlier phases
marked "cannot happen before H5".

### Relations

- **Blocked by:** nothing. H3b had to merge before H5 starts; it did (#377).
- **Ships with:** H3a, H3b, H3c-1, H3c-2 and H4 at the next checkpoint release. H5a, H5b and
  H5c must all be in `develop` before that release (decision T13).
- **Blocks:** H6 (transfer needs a second member) and H7 (the household switch needs a person
  in two households, which H5b creates).
- **Deploy order:** H5a adds GraphQL fields the new web bundle selects, so the **server
  deploys before the web**, the same rule as H4 (H4 decision T9). **Correction (task
  F.9):** this line said "H5a adds no new conflict with the H3a rule (web before server)".
  It does. `GetLocations` selects `myRole`, so the new bundle on `main`'s old server fails
  every location query, and in a release that also carries H3a neither order is safe. See
  the H4 runbook, section 8.3, for the options; the owner decides.

### What the user gets (once merged AND deployed)

After H5a alone: **almost nothing, because nobody can join a household yet.** One thing is
visible to everyone: **the last location of a household can be deleted**, and then Pantry,
Shopping and Cooking show an empty screen with **Create a location**. A household `member`
would also stop seeing Delete on locations they cannot delete, but no member exists yet.

After H5a + H5b + H5c (the checkpoint release):

- An owner or manager invites family with a link and chooses their roles.
- A family member opens the link, signs in, sees the household and their roles, and presses
  **Join**.
- Members see the shared pantry, carts and cooking of the locations they were given. A viewer
  sees them read-only. A household `member` sees the catalog read-only.
- An owner or manager sees every location on the settings list, with **No access** and **No
  organizer** marks, and manages who has which role on each location.
- A member can leave; an owner or manager can remove members. A person with no household sees
  a screen that says so.

### What the developer gets

| DX gain | Specifics |
|---|---|
| Fewer ways to get it wrong | One hook, `usePermissions`, answers "may I edit the catalog" and "may I edit this location". About 30 components read it, instead of each guessing from `mode` |
| A failure that now has a name | A viewer's Shopping page and location switch no longer end in an unhandled `FORBIDDEN` |
| Real two-person E2E | A browser context can be any test user (task F.8), so a spec can show browser A's change in browser B. Today every browser is `E2E_USER_ID` |
| Less to remember | Decision H13 (`LAST_LOCATION`) and its special cases go away: one server branch, one web error mapping, one E2E test, one `verify-migration.ts` assertion |
| Honest documentation | The H3a, H3c-2 and H4 "owed to H5" gaps are each closed or moved to a named H5 PR (see *Gaps folded in*) |

**Costs, stated plainly:**

- About 30 web files get a role check, and each needs a test in both states. That is the
  largest part of H5a.
- One more GraphQL query and two fields, with a deploy-order rule (server first).
- A test-only override in `apps/web/src/main.tsx` (task F.8). It is read only when the
  build-time flag `VITE_E2E_TEST_USER_ID` is set, so a production build ignores it. It is
  still a change to shipped code made for tests, like issue #334's.
- `pnpm test:e2e:all` grows by one cloud spec file.

---

## Facts this plan is built on (checked 2026-11-17 at `7f514fc9`)

Line numbers drift. Each task re-reads the code before it trusts a line here.

| Fact | Where |
|---|---|
| The web knows the caller's HOUSEHOLD role: `GetHousehold` selects `household { id name role }`; `useHousehold()` returns it; `HouseholdNameCard` and `ImportCard` already branch on it | `apps/web/src/apollo/operations/household.graphql`; `hooks/useHousehold.ts:31`; `ImportCard.tsx:131–133` |
| The web does NOT know any LOCATION role. `type Location { id name order createdAt updatedAt }` | `apps/server/src/schema/location.graphql:1–7` |
| `locations` lists only locations where the caller holds a counted role, in the caller's household. No query lists the others | `visibleLocations`, `apps/server/src/resolvers/location.resolver.ts` |
| `createLocation` gives a role only to its creator | same file, `createLocation` |
| `deleteLocation` refuses the last location with `LAST_LOCATION` (decision H13), after `lockHousehold` | `location.resolver.ts:135–170`; web: `routes/settings/household/locations/index.tsx:55–68`, `lib/graphqlErrorCode.ts`; E2E: `e2e/tests/settings/locations.spec.ts:26`, `:195`; `apps/server/scripts/verify-migration.ts:1834–1888` (`assertHouseholdLock` asserts the refusal) |
| `reorderLocations` writes only the ids it is sent (a subset is allowed) | `location.resolver.ts:179` |
| `vendorCart` (a QUERY) creates a missing cart and needs `participant` | `apps/server/src/resolvers/cart.resolver.ts:181–185` |
| `bootstrapCarts` needs `participant`; the web calls it on every active-location change | `cart.resolver.ts:527–530`; `apps/web/src/hooks/useActiveLocation.tsx:115`, `:198` |
| `Cart` has only `id` and `lastPurchasedAt` | `apps/server/src/schema/cart.graphql:9–12` |
| Four reads use `locationIdsWithRole(ctx)` with NO household filter: `cartItemCountByItem` without `locationId`, `itemStocksForItem`, `addItemToLocation`'s copy sources, `checkout`'s copy sources | `cart.resolver.ts:251`, `:364`; `itemStock.resolver.ts:82`, `:175` |
| `ensureHousehold` finds a person's household with `householdMember.findFirst({ where: { userId } })` and no `orderBy` | `apps/server/src/lib/household.ts:134`, `:151` |
| Every cloud E2E browser is `E2E_USER_ID`. `VITE_E2E_TEST_USER_ID` is baked into the web build; no override exists. No spec calls `browser.newContext` | `e2e/playwright.config.ts:94`; `apps/web/src/main.tsx:63–79`; `apps/web/src/apollo/client.ts:141–148`; `e2e/constants.ts:31–34` |
| The server takes ANY `x-e2e-user-id` (HTTP) or `e2eUserId` (socket) in E2E mode | `apps/server/src/lib/graphqlContext.ts:35–48`; `lib/wsServer.ts:156–160` |
| `addHouseholdMember` answers 409 unless the owner has sent one GraphQL request and the member has sent none | `apps/server/src/lib/e2eHouseholds.ts:35–60`; `e2e/helpers/cloudUsers.ts:136` |
| `PostLoginMigrationDialog` fires only when `migration-strategy` is in `localStorage` | `apps/web/src/components/global/PostLoginMigrationDialog/PostLoginMigrationDialog.tsx` header |
| `/sign-in` always navigates to `/` after sign-in; no return URL | `apps/web/src/routes/sign-in.tsx` |
| No `members`, `join` or `locations/$id` route exists | `apps/web/src/routes/` |
| Controls to hide, counted by research: about 20 files for a `member` (catalog) and 8–10 for a `viewer` (location) | listed in tasks F.5 and F.6 |

## Where the design and the outline disagree with the code

| # | The design or outline says | The code today | What this plan does |
|---|---|---|---|
| D1 | *First sign-in*: "A person who signs up through an invite link gets their own household too, then joins the inviting one." | `requireHousehold` → `ensureHousehold` picks a household with `findFirst` and no `orderBy`. A person in two households gets one of them at random, and the answer can change between requests. Nothing chooses an active household until H7 | H5b must add a rule before any join can work. Owner decision **O2** |
| D2 | *Read-only views*: a viewer reads stock, cart and logs | `vendorCart` and `bootstrapCarts` need `participant`. A viewer's Shopping page and location switch fail with `FORBIDDEN` | Task F.2: `vendorCart` answers a viewer without writing; the web skips `bootstrapCarts` below `participant` |
| D3 | *Location pages*: owner and manager see locations they have no role on, marked **No access**, and a **No organizer** warning | No query lists them; `Location` has no role field | Task F.1 and F.3: `Location.myRole`, `Location.hasOrganizer`, `householdLocations` |
| D4 | *Invite and empty screens*: "No household" shows **Create a household**. *Sequencing* puts household create in H7 | No `createHousehold` mutation exists | Owner decision **O9** (build it in H5b, or show only "ask for an invite") |
| D5 | H5 row: "switcher filtering" | The switcher already lists only locations with a role (H3a task 3.6). Only the **View only** badge is missing | Task F.4 adds the badge; nothing to filter |
| D6 | Decision H13: the last location stays "until H5 builds the no locations screen" | The empty screen is needed anyway: a member added with no location role already has zero locations (possible today through the E2E route, and in production after H5b) | Task F.7 builds the screen and lifts H13 together |
| D7 | Decision H13 is the reason `deleteLocation` takes `lockHousehold` | After H13 is lifted, two deletes at once harm nothing. `verify-migration.ts`'s `assertHouseholdLock` asserts the `LAST_LOCATION` refusal | Task F.7 keeps the lock (cheap, and `clearAllData` still needs the shared order) and rewrites the assertion to prove "the second delete waits", not "it refuses" (decision T8) |
| D8 | Outline: "Two-user cloud E2E with one browser context per user" | The harness cannot: one build-time user per run (*Facts*) | Task F.8 adds a test-only per-context user |
| D9 | *Household roles, removal and leaving*: removal ends "all their location roles in that household … at once" | Decision H18 makes a leftover `LocationMember` row not COUNT while the person is outside the household. The row stays. **If the person is invited again, every old location role comes back with them** | H5b's removal and leaving delete the `LocationMember` rows in the same transaction (decision T11). Trap recorded |
| D10 | *Data model*: `HouseholdInvite.token (unique)` | — | Owner decision **O7** (can the inviter copy the link again later) decides plain or hashed |
| D11 | H3a Known gaps: "a manager's reorder may leave some locations with old orders" | True while a manager sees only some locations | Closed by F.3: the settings list shows every location to a manager, and `reorderLocations` then requires the full set (decision T6) |
| D12 | Brief: "`cartItemCountByItem` without `locationId` is not scoped to one household" | True (`cart.resolver.ts:251`), and so are three more reads (*Facts*). Today they still give the right answer, because an item and the stock or cart rows that name it are always in one household. Nothing in the schema enforces that | Task F.2 adds the household filter to all four, with a one-user-in-two-households test (decision T5) |
| D13 | H3c-2 *location-visibility limit*: "Whether a new location should give roles to others is a question for H5" | `createLocation` gives a role to its creator only | Owner decision **O4** |

## Gaps folded in from earlier plans

Every Known gap in the H3a–H4 plans that names H5, and where it goes.

| Gap | From | Goes to |
|---|---|---|
| Lift the last-location refusal (decision H13) | H3a | **F.7** |
| `cartItemCountByItem` without `locationId` spans households | H4 (brief) | **F.2**, with three more reads |
| Only the creator gets a role on a new location | H3c-2 | owner decision **O4**; F.3 shows the result on the list |
| Owner and manager do not see locations they have no role on | H3a | **F.1**, **F.3** |
| Manager reorder can leave duplicate orders | H3a | **F.3** (decision T6) |
| The Stock tab shows *Remove from location* to every role, and a refusal shows no message | H3a | **F.6** (organizer only) |
| A household `member` sees Delete on every cloud location | H3a | **F.6** |
| A rule for which household a person is in | H3a | **H5b**, owner decision **O2** |
| What happens to a person's own household when they accept an invite | H3a | **H5b**, owner decision **O2** |
| A removed member gets `NO_HOUSEHOLD`; the web shows nothing | H3a | **H5b** (the no-household screen) |
| After *Clear household*, should other members get a role on the new "Home"? (Q1, "decide in H5 or H6") | H3a | owner decision **O5** |
| Marking a recipe cooked needs no location role | H3a | owner decision **O10** |
| `bulkUpsertLocations` must keep `householdId` out of its `update`; a two-household test is owed | H3a | **F.2**: check whether H4 task E.3 already closed it (it refuses an existing location of another household with `FORBIDDEN`). Add the owed test if no test pins it |
| One cart without a role refuses the whole cart-item batch | H3a | Closed by H3b task B.7 and H4 task E.3 (the row is skipped). F.2 confirms with `git grep` and names the test |
| Two cross-household import gaps (#381) | H3c-2 | Closed by H4 tasks E.1 and E.3. Their only real-SQL test needs one user in two households, which H5b makes possible: **H5b** adds it |
| Two people on two devices (live updates) | H3c-1, H3c-2 | **F.8** (two browser contexts, one live event) |
| `fallbackImportLocation`'s household filter has no failing test | H3a | Closed: the function was deleted in H4 task E.3 |
| `locations` does not filter by household | H3a | Closed by H4 task E.5 |

---

## Decisions

### Technical decisions (made in this plan)

| # | Decision | Why | Rejected |
|---|---|---|---|
| T1 | **Split H5 into three PRs** (pending owner decision O1): **H5a** roles on the web, read-only views, empty locations, two-browser E2E; **H5b** invites, join, members, the "which household" rule, no-household screen; **H5c** the location people page | H5 touches every screen and adds the first new table since H3b. H3 and H3c were split for the same reason. H5a needs no migration and can be tested with the E2E route, so it can merge first. H5b needs H5a: a member who joins must already see read-only views | One PR: too large to review. Two PRs (H5c inside H5b): H5b would then hold a migration, the join flow, two new pages and the people page |
| T2 | **`Location.myRole: LocationRole`** (nullable) and **`Location.hasOrganizer: Boolean!`** are field resolvers. `myRole` is the caller's COUNTED role (decision H18); null means "no access" | The web needs the role per location, and the location list is the one place every page already reads. A field on `Location` is non-breaking for an old bundle | A separate `myLocationRoles` query: one more request on every page, and a second list to keep in step with `GetLocations` |
| T3 | Both fields are read with ONE query per request, not one per location: a new helper `locationRolesByLocation(ctx, householdId): Promise<Map<string, LocationRole>>` in `lib/authz.ts`, cached on `ctx.requestCache` like `householdId`. `hasOrganizer` uses one `groupBy`/`findMany` on `LocationMember` for the listed ids, filtered by H18 | A field resolver per row would make N queries | A DataLoader dependency: not in the repo, and one request-scoped map is enough |
| T4 | **`householdLocations: [Location!]!`**, a new query: for an owner or manager, every location of the caller's household by `order`, then `id`; for a `member`, exactly what `locations` returns. `locations` (the switcher) does not change | The design keeps the switcher to locations with a role and the settings list to all of them. Two lists, two queries, each with one meaning | An argument on `locations`: the switcher and the settings list would share one cache entry by mistake |
| T5 | **The four unfiltered multi-location reads get `{ householdId: await requireHousehold(ctx) }`** (*Facts*). Tested with one user in two households (pinned through `ctx.requestCache.householdId`, the H4 pattern) | Same rule H4 task E.5 applied to the five export reads. The answer is right today only because of an invariant nothing enforces | Leaving them: H5b makes two households real |
| T6 | **`reorderLocations` requires the full set** of the household's location ids. A subset → `BAD_USER_INPUT`. The settings list sends every location (F.3) | Closes the H3a duplicate-order gap at the server, not only in the web | Fixing it only in the web: an old or hand-made client could still send a subset |
| T7 | **`vendorCart` asks `viewer`.** It creates the missing cart only when the caller is `participant` or higher; for a viewer it returns `{ id: cartIdFor(locationId, vendorId), lastPurchasedAt: null }` and writes nothing. `bootstrapCarts` keeps `participant`; the web calls it only when `myRole` is `participant` or higher | The design gives a viewer read access to carts. A read must not write for a role that may not write | Making `bootstrapCarts` accept viewers: a viewer would create rows |
| T8 | **Decision H13 is lifted in F.7.** `deleteLocation` no longer counts; the `LAST_LOCATION` code is removed from the server, the web error mapping and the E2E spec. `lockHousehold` STAYS in `deleteLocation`. `assertHouseholdLock` in `verify-migration.ts` is rewritten to prove "the second delete waits for the first", not "it refuses" | Keeping the lock keeps `clearAllData` and `deleteLocation` in one lock order. The rewritten assertion keeps the script honest | Removing the lock: no harm today, but H6's purges will need it again |
| T9 | **One web hook, `usePermissions()`**, in `apps/web/src/hooks/usePermissions.ts`: `{ canEditCatalog: boolean, roleAt(locationId): LocationRole \| null, canEditLocation(locationId): boolean, isOrganizerAt(locationId): boolean, canManageLocations: boolean, isLoading: boolean }`. Local mode: every `can…` is `true`, `roleAt` returns `'organizer'`. Cloud while loading: every `can…` is `false` | One place to change when the member rules change (the design says they "may change after user feedback"). `false` while loading means a control appears late, never disappears after a click | Checks spread across components; or `true` while loading, which shows a button that then fails |
| T10 | **A test-only per-context E2E user** (F.8): `apps/web/src/lib/e2eUser.ts` exports `getE2ETestUserId(): string \| undefined`, which returns `localStorage['e2e-user-id']` when `VITE_E2E_TEST_USER_ID` is set and the key exists, else the build-time value. `main.tsx`, `createApolloClientForE2E`, `LiveUpdatesRunner` and `UserSettingsPanel` use it | The server already accepts any id. One function keeps every reader on the same id | `page.route` header rewriting: the socket and the UI would still show the old id |
| T11 | (H5b) **Removing or leaving deletes the person's `LocationMember` rows of that household in the same transaction** | Decision H18 only hides them. A re-invite would bring them back (D9) | Relying on H18 |
| T12 | (H5b) **Invite tokens are 32 random bytes, base64url** (`crypto.randomBytes`). Expiry, single use and revoke are checked in the join transaction, which takes `lockHousehold` first | Not guessable; one lock order with the other household writes | A cuid: designed to be unique, not secret |
| T13 | **H5a, H5b and H5c all merge into `develop` before the checkpoint release.** If the release must happen with H5a only, that is safe: H5a works for one person per household | H5a alone changes nothing a single user can break, except the last-location delete (O8) | — |

### Owner decisions (needed before the task that uses them)

Each has a recommendation. **A** is the recommendation unless it says otherwise.

| # | Question | Options | Recommendation | Needed by |
|---|---|---|---|---|
| O1 | Split H5 into three PRs? | **A.** Three: H5a (roles on screen, read-only, empty locations, two-browser tests), H5b (invites, join, members), H5c (location people page). **B.** Two: H5a, then everything else. **C.** One PR | **A.** Each part can be reviewed and tested on its own, and H5a has no migration | now |
| O2 | A person who joins a household already has their own (every person gets one at first sign-in). What happens to it? | **A.** Keep it, but the person works in the JOINED household from then on. The server remembers this in a new column, `User.activeHouseholdId`. The old household comes back with H7's "Switch to…". If the old household is still empty (only the person, no catalog rows, no stock), it is deleted at join. **B.** Move H7's "Switch to…" dropdown into H5b, so the person can go back and forth now. **C.** Allow a join only when the person's own household is empty, and delete it then | **A.** Most family members join right after sign-up, so their household is empty and is deleted. A person with real data keeps it safely. B makes H5b larger by a whole H7 feature | H5b |
| O3 | Who may create invites? | **A.** As the design says: owner and manager. A manager can invite only as `member`; only the owner can invite a `manager`. **B.** Owner only | **A** | H5b |
| O4 | When someone creates a location, who gets a role on it? | **A.** Only the creator (organizer), as today. Others are added on the location's people page (H5c). **B.** The creator, plus every owner and manager as organizer. **C.** Everyone in the household as participant | **A.** It matches the design rule "a household role gives no location data". B and C give data access nobody chose | H5a (F.3 shows the result) |
| O5 | After **Clear household**, only the person who cleared gets a role on the new "Home". Should others get one? | **A.** No change: the same answer as O4. **B.** Every owner and manager gets organizer | **A**, the same reason as O4 | H5b (not urgent; H6 rebuilds purges) |
| O6 | Invite link lifetime | **A.** 7 days, single use, can be revoked until used (the design). **B.** Another number of days | **A** | H5b |
| O7 | Can an owner or manager copy an invite link again later, from the list of open invites? | **A.** Yes. The server keeps the token and shows it to owner and manager only. **B.** No. The link shows once; if it is lost, revoke it and make a new one. The server keeps only a hash | **A.** Simpler for a family. Anyone who can read the database can already read every household's data, so a hash protects little | H5b |
| O8 | Allow deleting a household's last location (H13 lifted in H5a)? After it, Pantry, Shopping and Cooking show "You have no locations in this household yet" with **Create a location** | **A.** Yes, in H5a. **B.** Keep the refusal until H5b | **A.** The empty screen is needed in H5a anyway (D6) | H5a (F.7) |
| O9 | A person with no household (they left, or were removed) sees "You are not in any household." What button? | **A.** **Create a household**, as the design says. H5b builds a `createHousehold` mutation (H7 still adds "Switch to… › Create new"). **B.** No button; the text says "Ask someone for an invite link" | **A.** Without it the person is stuck until someone invites them | H5b |
| O10 | A household `member` with only a viewer role (or none) can mark a recipe as cooked (`updateRecipeLastCookedAt` needs no location role). Is that fine? | **A.** Yes. It writes only "last cooked", not stock. **B.** Require `participant` on the active location, and hide the button for a viewer | **A**. Hide the cook button for a viewer anyway (F.6), so a viewer does not see it | H5a (F.6) |
| O11 | The texts. English first, then the `tw` first version (the owner corrects `tw` in the PR) | "View only" / 「僅檢視」 · "No access" / 「無權限」 · "No organizer" / 「沒有組織者」 · "You have no locations in this household yet." / 「你在這個家還沒有據點。」 · "Create a location" / 「建立據點」 · role names "Organizer" / 「組織者」, "Participant" / 「參與者」, "Viewer" / 「檢視者」, "Owner" / 「擁有者」, "Manager" / 「管理者」, "Member" / 「成員」 | Approve, or give the words you prefer | H5a (F.3, F.4, F.7) |
| O12 | A person opens an invite link while the app is in local mode. What happens? | **A.** The join page says "Joining a household uses cloud sync" and offers **Sign in to join**. It switches to cloud and returns to the link after sign-in. Their local data stays in local mode; it is NOT copied into the household. **B.** Also offer to copy local data after joining | **A.** A new `member` cannot import (H4 decision O7), so a copy would be refused | H5b |

### Owner answers (2026-11-17)

The owner answered **A** to O1–O10 and O12.

O11: the owner gave new `tw` names for the three location roles. The other texts were not
changed, so they stand as proposed, with two follow-on edits made by the main session:

| English | `tw` | Source |
|---|---|---|
| Organizer | 「據點王」 | owner |
| Participant | 「搬運工」 | owner |
| Viewer | 「圍觀的」 | owner |
| No organizer | 「沒有據點王」 | follows the owner's "Organizer" |
| You have no locations in this household yet. | 「你在這個家庭還沒有據點。」 | uses 「家庭」, as the existing household texts in `tw.json` do |
| View only | 「僅檢視」 | as proposed |
| No access | 「無權限」 | as proposed |
| Create a location | 「建立據點」 | as proposed |
| Owner / Manager / Member | 「擁有者」 / 「管理者」 / 「成員」 | as proposed |

The owner can still correct any `tw` text in the PR.

---

## Task F.1 — server: `myRole`, `hasOrganizer`, `householdLocations`

**Files:**
- Modify: `apps/server/src/schema/location.graphql`, `apps/server/src/lib/authz.ts`,
  `apps/server/src/resolvers/location.resolver.ts`, `apps/server/src/resolvers/index.ts` (if
  a `Location` type resolver must be registered), `apps/server/src/context.ts`
  (`requestCache` type)
- Modify: `apps/web/src/apollo/operations/locations.graphql` (same commit, codegen rule)
- Modify: `apps/server/src/resolvers/live-publish.guard.test.ts` only if it lists queries (it
  does not today)
- Test: `apps/server/src/resolvers/location-roles.resolver.test.ts` (new),
  `apps/server/src/lib/authz.test.ts`

**Interfaces:**
- Produces (schema):
  ```graphql
  type Location { …; myRole: LocationRole; hasOrganizer: Boolean! }
  enum LocationRole { organizer participant viewer }
  extend type Query { householdLocations: [Location!]! }
  ```
- Produces (server): `locationRolesByLocation(ctx: Context, householdId: string): Promise<Map<string, LocationRole>>` in `lib/authz.ts`, built on `countedLocationRole`, cached on `ctx.requestCache.locationRoles`.
- Produces (web): `GetLocations` selects `myRole`; new document `GetHouseholdLocations` selects `id name order myRole hasOrganizer`.

- [x] **Step 1: Write the failing tests** in `location-roles.resolver.test.ts`, with the
  shared fakes (`householdFake`, `stockFake`) and THREE people: owner O (organizer of K,
  no role on G), manager M (viewer of K), member B (participant of G). Locations K and G in
  household H; location X in another household where O is organizer.
  - `household owner sees every location of the household on householdLocations, with myRole null where they have no role` → O gets `[K (organizer), G (null)]`, never X.
  - `household member sees only their own locations on householdLocations` → B gets `[G (participant)]`.
  - `locations still lists only locations with a role` → O gets `[K]`.
  - `hasOrganizer is false for a location whose only organizer left the household` → remove O's `HouseholdMember` row (H18): K's `hasOrganizer` is `false`, and O's `myRole` on K is not counted.
  - `myRole and hasOrganizer cost one membership read per request` → spy on `locationMember.findMany`: 2 calls at most for a list of 2 locations (one for roles, one for organizers), not 4.
- [x] **Step 2: Run** `pnpm --filter server exec vitest run src/resolvers/location-roles.resolver.test.ts` — expected FAIL (`householdLocations` not in schema).
- [x] **Step 3: Implement.** Schema and web document in one commit. `householdLocations`:
  `requireHousehold`, then `requireHouseholdRole(ctx, h, 'member')`; for `member` return
  `visibleLocations(ctx)`; for `manager`/`owner` read `location.findMany({ where:
  { householdId }, orderBy: [{ order: 'asc' }, { id: 'asc' }] })`. The comparison is in SQL;
  no call site compares a `householdId`. `Location.myRole` reads the map; `hasOrganizer`
  reads one `locationMember.findMany({ where: { locationId: { in: ids }, role: 'organizer',
  user: { householdMemberships: { some: { householdId } } } } })`. That is the H18 rule for
  the ORGANIZER's own membership, not the caller's: an organizer who left the household does
  not count. Put that `where` in a named builder in `authz.ts` beside
  `countedLocationRole`, with a comment saying why it differs.
- [x] **Step 4: Run** the file and `pnpm test:server` — PASS. Add a row for
  `HouseholdLocations` to the comment table above `QUERIES_BY_KIND` in
  `apps/web/src/apollo/liveUpdates.ts` (kind `LOCATION`, which already refetches every active
  query; no map entry is needed). A role change (H5b, H5c) publishes `LOCATION`, so `myRole`
  refreshes the same way.
- [x] **Step 5: Mutation checks** (copy the file aside first; never `git checkout --`):
  - `householdLocations` returns `visibleLocations` for everyone → the owner test goes red.
  - drop the H18 part of the organizer builder → the `hasOrganizer` test goes red.
  - drop `householdId` from the manager read → add a location of another household where O
    is organizer to the fixture (already there: X) → red.
- [x] **Step 6: Gate** (root `CLAUDE.md`, *Verification Gate*), then commit
  `feat(households): location role fields and householdLocations`.

**As built (2026-11-17, commit `a59cfcb8`).**

- **Schema.** `Location.myRole: LocationRole` (nullable), `Location.hasOrganizer: Boolean!`,
  a new GraphQL `enum LocationRole`, and `householdLocations: [Location!]!`. No mutation, so
  `live-publish.guard.test.ts` is unchanged (it lists only `Mutation` fields; checked).
- **Helpers in `lib/authz.ts`.**
  `locationRolesByLocation(ctx, householdId): Promise<Map<string, LocationRole>>` is built on
  `countedLocationRole`. `locationIdsWithOrganizer(ctx, householdId): Promise<Set<string>>`
  uses a new named builder, `countedOrganizerIn(householdId)`, beside it:
  `{ role: 'organizer', location: { householdId }, user: { householdMemberships: { some: { householdId } } } }`.
  Both cache one promise PER HOUSEHOLD on `ctx.requestCache` (`locationRoles`,
  `organizedLocations`, two `Map`s added to `RequestCache` in `context.ts`).
- **The household is the LOCATION's own**, read from the parent row (`householdIdOf` in
  `location.resolver.ts`; every path that returns a `Location` goes through `toGraphQL`,
  which spreads the Prisma row). Not the caller's: `updateLocation` can return a location of
  a second household the caller belongs to. A test pins this; without it the "caller's
  household" mutation stayed green.
- **The organizer read is per household, not per id list.** The plan's
  `locationId: { in: ids }` needs the list of ids first, which a field resolver does not have.
  One read of every counted organizer row of the household is cached instead.
- `Location` is registered in `resolvers/index.ts`.
- **Web.** `GetLocations` selects `myRole`; `GetHouseholdLocations` selects
  `id name order myRole hasOrganizer`. The comment table above `QUERIES_BY_KIND` has the new
  row. Seven fixture files gained `myRole: 'organizer'` (see *What this plan got wrong*). The
  export test now asserts a backup never carries `myRole` (`toLocationInput` is an
  allow-list).
- **The fake.** `householdFake` now models `user: { householdMemberships: { some: { householdId, role } } }`
  on `LocationMember`, pinned by three contract tests in `householdFake.test.ts`.
- **Tests.** `location-roles.resolver.test.ts`: 9 tests. `authz.test.ts`: 6 new tests.
  Server suite **1765 / 67 → 1783 / 68**. Web suite unchanged at **2678 / 283**.
- **Mutations, each copied aside and restored from the copy:**

  | Mutation | Red |
  |---|---|
  | `householdLocations` returns `visibleLocations` for everyone | 4 resolver tests, incl. the owner test |
  | the `user` (H18) part of `countedOrganizerIn` removed | the authz H18 test and `hasOrganizer is false …` |
  | `countedOrganizerIn` checks "anyone is in the household" instead | the same 2 |
  | `householdId` removed from the manager read | 4 resolver tests (loc-x appears) |
  | `orderBy` removed from the manager read | 3 resolver tests |
  | household filter removed from `locationRolesByLocation` | 3 authz tests |
  | H18 removed from `locationRolesByLocation` | `leaves out a role that does not count` |
  | the request cache removed from `locationRolesByLocation` | 2 (`reads once …`, `cost one membership read …`) |
  | `myRole` / `hasOrganizer` read the caller's household | `… read the LOCATION's household …` (green before that test was added) |
  | `toLocationInput` forwards `myRole` | `user can export every location, not only the first one` |

## Task F.2 — server: viewer reads carts; household filter on four reads; reorder needs the full set

**Files:**
- Modify: `apps/server/src/resolvers/cart.resolver.ts` (`vendorCart`, `cartItemCountByItem`,
  `checkout`'s sources), `apps/server/src/resolvers/itemStock.resolver.ts`
  (`itemStocksForItem`, `addItemToLocation`'s sources), `apps/server/src/resolvers/location.resolver.ts`
  (`reorderLocations`), `apps/server/src/schema/cart.graphql` and `location.graphql` comments
- Test: `apps/server/src/resolvers/cart.resolver.test.ts`,
  `itemStock.resolver.test.ts`, `location.resolver.test.ts`, and a new
  `two-households-reads.resolver.test.ts`

**Interfaces:** none new. `vendorCart` keeps its signature (`Cart!`).

- [x] **Step 1: Write the failing tests.**
  - `location viewer can open a vendor cart that does not exist yet, and no cart is written` → viewer V at K; `vendorCart(vendorId: v1, locationId: K)` returns `{ id: 'K:v1', lastPurchasedAt: null }`; `cartFake.state.carts` is unchanged.
  - `location participant still gets the missing cart created` → the row exists after the call.
  - `a person with no role on the location cannot open its vendor cart` → `FORBIDDEN`.
  - In `two-households-reads.resolver.test.ts`: user U is in households A and B, with a role in both; the target pinned through `ctx.requestCache.householdId = A`. Stock of item `iA` at a location of B is put straight into the fake state (it cannot be made through the API — that is the invariant this guards). `cartItemCountByItem(itemId: iA)` with no `locationId` counts only A's carts; `itemStocksForItem(iA)` returns only A's rows; `addItemToLocation` with no `sourceLocationId` copies settings only from A; `checkout`'s copy-on-add reads only A.
  - `reorderLocations refuses a list that leaves out a location of the household` → `BAD_USER_INPUT`, no `order` changed.
  - The H3a owed test: `bulkUpsertLocations does not move a location of another household` — first `git grep -n "another household" apps/server/src/resolvers/import-role-gate.resolver.test.ts`; if a test already asserts that an existing location of household B, named in an import into A, is refused and keeps `householdId: B`, name it in the commit message and write nothing new.
- [x] **Step 2: Run** the four files — the new tests FAIL.
- [x] **Step 3: Implement** T5, T6 and T7. In `vendorCart`, call
  `requireLocationRole(ctx, locationId, 'viewer')`, keep its returned `role`, and create only
  when `LOCATION_RANK[role] >= LOCATION_RANK.participant` (export the rank check as
  `roleAtLeast(role, min)` from `authz.ts` rather than reading the rank map at the call site).
  Update the comment in `cart.graphql` above `vendorCart`.
- [x] **Step 4: Run** the files and `pnpm test:server` — PASS.
- [x] **Step 5: Mutation checks:** remove `householdId` from each of the four reads, one at a
  time → each two-household test goes red; make `vendorCart` create for every role → the
  viewer test goes red on "no cart is written"; allow a subset in `reorderLocations` → red.
- [x] **Step 6: Gate**, commit `fix(households): viewer cart reads and one-household reads`.

**As built (2026-11-17).**

- **`vendorCart` asks `viewer`** (T7). It keeps the role `requireLocationRole` returns.
  A missing cart is created only when `roleAtLeast(role, 'participant')`; a viewer gets
  `{ id: cartIdFor(locationId, vendorId), lastPurchasedAt: null }` and nothing is written.
  `roleAtLeast(role, min)` is new in `lib/authz.ts`. `bootstrapCarts` is unchanged
  (`participant`). The `cart.graphql` comment and the "queries that write" note in
  `live-publish.guard.test.ts` say so.
- **The four reads (T5).** Two use the CALLER's household, two the LOCATION's:

  | Read | Household |
  |---|---|
  | `cartItemCountByItem` with no `locationId` | `requireHousehold(ctx)` |
  | `itemStocksForItem` | `requireHousehold(ctx)` |
  | `addItemToLocation`'s copy-on-add sources | `householdOfLocation(locationId)` |
  | `checkout`'s copy-on-add sources | `householdOfLocation(cartLocationId)` |

  The plan said `requireHousehold` for all four. For the two writes that is wrong (see
  *What this plan got wrong*). It costs one more location read in each.
- **`reorderLocations` needs the full set (T6).** After the repeat check (`BAD_USER_INPUT`)
  and the foreign-id check (`FORBIDDEN`), it counts the household's locations; a different
  count is `BAD_USER_INPUT`, before any write. An empty list is now refused while the
  household has a location. Comment in `location.graphql`.
- **Until F.3, an owner or manager with no role on a location cannot reorder in the web.**
  The settings list still sends `useLocations()` (the switcher's list), which leaves that
  location out, so the server refuses it. F.3 moves the list to `householdLocations`.
- **The H3a owed test** already existed: `import-role-gate.resolver.test.ts`,
  `bulkUpsertLocations: an existing location of the caller's other household is refused`.
  It checked the refusal and the name, not `householdId`, so one assertion was added
  (`householdId` stays `hh_b`).
- **Tests.** `two-households-reads.resolver.test.ts` (new, 7 tests: one person in two
  households, a second person with a viewer role, a location the caller has no role on,
  broken rows written straight into the fakes). `cart.resolver.test.ts`: 4 new
  `vendorCart` tests; the old block "a location viewer cannot use vendorCart" (2 tests) is
  deleted, because T7 reverses it. `location.resolver.test.ts`: 3 new reorder tests.
  `location-live-publish.resolver.test.ts`: the empty-list test now expects
  `BAD_USER_INPUT`, plus 1 new test. Server suite **1794 / 69 → 1807 / 70**.
- **Mutations, each copied aside and restored from the copy:**

  | Mutation | Red |
  |---|---|
  | `cartItemCountByItem` without the household filter | `user in two households counts only the carts of the pinned household` |
  | `itemStocksForItem` without the filter | `… sees only the pinned household's stock rows of an item` |
  | `addItemToLocation` without the filter | `… adding an item copies settings from the location's household only` |
  | `addItemToLocation` with the caller's household (the plan's form) | `user pinned to one household, adding the other household's item …` |
  | `checkout` without the filter | `… checking out copies settings from the cart's household only` |
  | `checkout` with the caller's household | `user pinned to one household, checking out the other household's cart …` |
  | `vendorCart` creates for every role | `location viewer can open a vendor cart that does not exist yet, and no cart is written` |
  | `vendorCart` asks `participant` again | both viewer tests |
  | `reorderLocations` accepts a subset | 5 tests (3 in `location.resolver.test.ts`, 2 in `location-live-publish.resolver.test.ts`) |

  Negative control, green either way: VERA's count test (she is in one household).

**Review fixes for F.1 (2026-11-17, after the review).**

- `forgetLocationRoles(ctx)` in `lib/authz.ts` clears both role caches. It was first
  called by `createLocation`, `deleteLocation`, `clearAllData` and `createImportedLocation`,
  with a source-text guard, `role-cache.guard.test.ts`. **Replaced in the review of F.2**
  (below): the guard missed too much. Three tests run two mutations in one document.
- `CreateLocation`, `UpdateLocation` and `ReorderLocations` select `myRole hasOrganizer`.
  `apps/web/src/apollo/locationSelections.test.ts` compares the selections. Only one cache
  write targets either query (`useReorderLocations`' `writeQuery`).
- The `householdIdOf` fallback is kept and tested by calling the field resolvers directly.
- Three comments that said "until H5" are corrected.
- `withoutRefusedRows` › "leaves a clean file as it is" builds its payload once.


**Review fixes for F.1's fixes and F.2 (2026-11-17, `e094bfcc`, `736ffb0d`, `30a9cc28`).**

- **The role caches are forgotten around EVERY root `Mutation` field**, in one place.
  `forgetRolesAroundEach` (`apps/server/src/lib/mutationRoleCache.ts`) wraps the whole
  `Mutation` map in `resolvers/index.ts`. It calls `forgetLocationRoles` before the field and,
  in `finally`, after it, so the field's own `myRole` sub-fields read fresh rows and a field
  that throws leaves nothing behind. The five calls by hand are gone, and so is
  `role-cache.guard.test.ts`. The reviewer showed the guard stayed green for a write through
  a helper in the same file, for a call replaced by a comment that named it (the whole suite,
  1807 tests, stayed green), and could not see nested writes, `$executeRaw`, method-syntax
  fields, sub-folders, `household.delete` or a `householdId` move.
- **What checks it now:** `lib/mutationRoleCache.test.ts` (6 tests), in two parts.
  - The **every-field test** calls every `Mutation` field of the executable schema with no
    user and a filled cache, and fails if one leaves a cache filled. With no user every
    field throws before it reads anything, so a forget BEFORE the field alone, or AFTER it
    alone, empties the cache. So this test proves only that **at least one forget runs for
    each field**: every field is wrapped. It cannot tell a field that forgets before from
    one that forgets after. (Corrected in the review of F.3; this said the test was the
    guard for the whole rule.)
  - The **before** and **after** halves, and the throw case, are pinned by their own unit
    tests of `forgetRolesAroundEach`: `forgets both role caches before the field runs`,
    `… after the field, so its sub-fields read fresh rows`, `… when the field throws …`.
  `graphql-tools` binds each resolver, so an identity check (`field.resolve === wrapped`)
  does not work; the every-field check is by behaviour. Two new document tests in
  `location-roles.resolver.test.ts`.
- **Why a wrapper and not a better text guard:** it removes the thing to remember. H5b's join,
  remove and leave are covered with no change. The cost is one role read per root field that
  selects `myRole`, instead of one per request.
- **`householdId` is still not forgotten.** Tests pin it on `requestCache`, and no mutation
  moves the caller yet. H5b's join must decide this.
- Stale comments fixed (`useVendorCart`, `itemStocksForItem`, `itemStockWrite.ts`, the scope
  table in `cart.resolver.ts`). A test title that claimed more than it checked is renamed.
- The `vendorCart` viewer test checks all seven cart write methods. A new reorder test sends
  a full-length list with one id of another household; only the household filter refuses it.
- Server suite **1807 / 70 → 1813 / 70**.
- **Mutations, each copied aside and restored from the copy:**

  | Mutation | Red |
  |---|---|
  | `Mutation` map not wrapped | 5: the 4 document tests of "the role cache inside one request" that run a later field, and the every-field test |
  | location mutations spread outside the wrapper | 4 |
  | no forget after the field | `forgets both role caches after the field …`, `… when the field throws …` |
  | no forget before the field | `forgets both role caches before the field runs` |
  | `householdId` dropped from `reorderLocations`' id read | the new full-length test, and `a batch with another household's location changes nothing` (it now gets `BAD_USER_INPUT` instead of `FORBIDDEN`) |
  | `vendorCart` viewer branch calls `cart.upsert` | `location viewer can open a vendor cart that does not exist yet, and no cart is written` (green before this change: it watched only `create`) |

## Task F.3 — web: settings locations list for every role

**Files:**
- Modify: `apps/web/src/hooks/useLocations.ts` (new `useHouseholdLocations`),
  `apps/web/src/routes/settings/household/locations/index.tsx`,
  `apps/web/src/components/location/LocationList/LocationList.tsx` and its stories and smoke
  test, `apps/web/src/i18n/locales/en.json` and `tw.json`
- Test: `apps/web/src/routes/settings/household/locations/index.cloud.test.tsx`,
  `LocationList.test.tsx`

**Interfaces:**
- Consumes: `GetHouseholdLocations` (F.1); `usePermissions` (F.4 — do F.4 first if the
  executor prefers; F.3 needs only `canManageLocations` and `isOrganizerAt`).
- Produces: `useHouseholdLocations(): { data: CloudLocation[] | undefined, isLoading }`; in
  local mode it returns `useLocations()`'s data with `myRole: 'organizer'`, `hasOrganizer: true`.

- [x] **Step 1: Write the failing tests** (cloud, mocked hooks):
  - `household manager sees a location they have no role on, marked No access` → row "Garage" shows "No access", has no link into its data, has Delete.
  - `household manager sees No organizer on a location without one`.
  - `household member does not see Delete or drag handles` and `sees their role on each row` ("Participant").
  - `location organizer who is a household member can rename that location and not the others`.
  - `user sees the role on each row` for an owner: "Organizer".
  - The reorder sends every id of the list, including the No access one.
- [x] **Step 2: Run** — FAIL.
- [x] **Step 3: Implement.** Rows show name, the role label, and the two marks (texts from
  O11). Delete and drag only when `canManageLocations`; rename only when `isOrganizerAt(id)`.
  A No access row is not a link. Remove the H3a `LAST_LOCATION` handling only in F.7, not here.
  Stories: add `ManagerWithNoAccessRow`, `MemberReadOnly`, `NoOrganizer`, each rendering the
  real `LocationList`.
- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Mutation checks:** show Delete for every role → the member test goes red;
  build the list from `useLocations` instead of `useHouseholdLocations` → the No access test
  goes red.
- [x] **Step 6: Gate**, commit `feat(households): locations list shows every location to managers`.

**As built (2026-11-17, `5b88bee7`).**

- **The list.** `useHouseholdLocations()` (new, in `hooks/useLocations.ts`) reads
  `householdLocations` in cloud, with `cache-and-network` and the usual `isLoading` /
  `isError` rules. It returns `SettingsLocation[]` (`Location` plus `myRole`, `hasOrganizer`).
  Local: `useLocations()`'s rows, each `organizer` with an organizer, as the plan said. The
  page passes `showRoles={mode === 'cloud'}`, so local mode shows no role text.
- **`usePermissions` is built here, not in F.4.** The plan let the executor choose. It has
  T9's exact shape and the hook tests F.4 Step 1 lists (6 tests). F.4 still owes the View only
  badge on the switcher and its tests.
- **`LocationList`** takes three new optional props: `canManage` (drag and Delete; default
  `true`), `canRename(location)` (default every row) and `showRoles`. A row shows the role text
  (`roles.location.*`), "No access" for `myRole: null`, and "No organizer" for
  `hasOrganizer: false` (in `text-importance-destructive-foreground`). Rows are now `<ul>` /
  `<li>` (Biome's `useSemanticElements` refused `role="list"` on a `div`). Location names
  still render as stored.
- **Who sees what.** Drag and Delete: `canManageLocations` (household owner or manager).
  Rename: `isOrganizerAt(id)`. Add: everyone, unchanged (the server asks household `member`).
- **The reorder cache.** `useReorderLocations` writes the server's answer into
  `GetLocations` as before. The answer holds only the caller's own locations, so it cannot
  replace `GetHouseholdLocations`; the hook puts the cached settings rows in the order that
  was SENT, with `order` 0..n-1, and only when every cached row is in the list. Create, rename
  and delete refetch `GetHouseholdLocations` by name, so only a mounted list asks.
- **i18n** (en and tw, owner's texts): `roles.location.organizer` 「據點王」,
  `participant` 「搬運工」, `viewer` 「圍觀的」, `settings.locations.noAccess` 「無權限」,
  `settings.locations.noOrganizer` 「沒有據點王」. The household role names are not added yet:
  nothing shows them.
- **Stories:** `ManagerWithNoAccessRow`, `MemberReadOnly`, `NoOrganizer`, each rendering the
  real `LocationList`, with 4 smoke tests. Checked in `storybook-static/index.json`.
- **Tests.** `index.cloud.test.tsx`: 8 new role tests on the real page (three locations; a
  "No access" row; a manager who is a viewer; a member who organizes one location and helps
  in another). `useLocations.test.tsx`: 3 for `useHouseholdLocations` and the reorder cache.
  `usePermissions.test.tsx`: 6. Web suite **2685 / 284 → 2706 / 285** (baseline measured on
  the unmodified tree). Server unchanged at **1813 / 70**.
- **The keyboard drag test needed a layout.** jsdom measures every row as 0 x 0, so dnd-kit's
  keyboard sensor had nowhere to move and the reorder was never sent. The test stubs
  `getBoundingClientRect` to give each `<li>` a 40px slot, and restores it after.
- **E2E:** `settings/locations.spec.ts` cloud 5 passed / 1 skipped (load average 29 at the
  start, from other sessions), local 5 passed / 1 skipped, `a11y.spec.ts` local 68 passed /
  2 skipped. None of these sets up a second role; F.8 does.
- **Mutations, each copied aside and restored from the copy (`diff -q` clean):**

  | Mutation | Red |
  |---|---|
  | `canManage={true}` (Delete for every role) | `household member does not see Delete or drag handles`, `user sees no Delete while the household role is not known` |
  | the page reads `useLocations()` | 4: `… marked No access`, `… No organizer …`, `user sees the role on each row`, `household owner reorders every location …, the No access one included` |
  | `canRename={() => true}` | `… marked No access` (Rename on the Shed), `location organizer who is a household member can rename that location and not the others` |
  | the settings-list reorder cache write skipped | `household owner sees the settings list in the new order after a reorder, the No access row included` |
  | `usePermissions` gives `owner` while loading | both loading tests, and the page's "not known" test |
  | `canEditLocation` reads the household role | 3 `usePermissions` tests, incl. Review Focus 4 |

**Review fixes for F.3 (2026-11-17, review of `71b15ae2..145ab166`).**

- **A refused reorder now says so.** Since F.2 the server refuses a list that is not the
  household's full set. When another member created or deleted a location while this tab's
  list was out of date, the row jumped back with no message. Now `useReorderLocations`
  refetches `GetHouseholdLocations` and `GetLocations` by name on any refusal (not when
  offline), and the page shows a toast:

  | Key | English | `tw` (first version; the owner can correct it in the PR) |
  |---|---|---|
  | `settings.locations.reorderError` | The location list changed. It has been reloaded. Try again. (changed in the F.4 review, see there) | 據點清單有變動，已重新載入，請再試一次。 |

  The message shows for every refusal except offline, not only `BAD_USER_INPUT`: the reload
  is right whatever the reason.
- **The first cloud visit shows a spinner, not "No locations yet".** The page reads
  `isLoading` from `useHouseholdLocations()` and shows `LoadingSpinner`, the same as
  `settings/household/shelves/$shelfId`.
- **The role text has context for screen readers.** A visually hidden prefix before the role
  and before "No access":

  | Key | English | `tw` |
  |---|---|---|
  | `settings.locations.yourRole` | Your role: | 你的角色： |

- **No `role="list"` on the `<ul>`.** The reviewer asked for it if Biome allows it. Biome
  does not: `lint/a11y/noRedundantRoles` (an error in `apps/web/biome.json`) and
  `useSemanticElements` both refuse it, and lint-staged's `--unsafe` fix would delete it at
  commit time. A comment in `LocationList.tsx` says so. Safari with VoiceOver may still not
  announce the list as a list.
- **New tests.** `useLocations.test.tsx`: 4 (create, rename and delete each answer the
  settings list twice, with a different second answer; a refused reorder reloads both
  lists). `index.cloud.test.tsx`: 3 (the reorder message and reload, the loading state, and a
  control that the empty state still shows for an empty answer). `index.test.tsx`: 1 (no role
  text in local mode). `LocationList.stories.test.tsx`: 1 (the hidden prefix).
- **Docs.** `hooks/CLAUDE.md`, `useLocations.ts` (`useDeleteLocation`'s comment), the
  locations `CLAUDE.md` (*Delete cascade (cloud)*, *Hooks*, *Tests*) and a comment in
  `useLocations.test.tsx` said only `GetLocations` is refetched, or that the page reads
  `useLocations()`. The every-field test of `mutationRoleCache.test.ts` was presented as the
  guard in this plan, in `mutationRoleCache.ts` and in the root `CLAUDE.md`; all three now
  say it proves only that at least one forget runs for each field.
- **Mutations, each copied aside and restored from the copy (`diff -q` clean):**

  | Mutation | Red |
  |---|---|
  | `HOUSEHOLD_LOCATIONS_REFETCH = 'NoSuchQuery'` (the reviewer's) | 5: the four new hook tests and the page's reorder test |
  | the settings refetch dropped from `useCreateLocation` only | `household owner sees a new location on the settings list after creating it` |
  | … from `useUpdateLocation` only | `household owner sees the new name on the settings list after a rename` |
  | … from `useDeleteLocation` only | `household owner no longer sees a deleted location on the settings list` |
  | `mutate` does not reload after a refusal | the hook's refused-reorder test and the page's reorder test |
  | the reload leaves out `GetLocations` | the same two |
  | the page shows no reorder message | `household owner sees why a refused reorder went back, and both location lists reload` |
  | the page ignores `isLoading` | `user sees no empty state while the cloud locations list is loading` |
  | `showRoles={true}` (the reviewer's) | `user sees no role text on the locations list in local mode` |
  | the hidden "Your role:" prefix removed | `user of a screen reader hears "Your role:" before the role and before No access` |

  Control, green either way: `user sees the empty state once the cloud list answers with no
  location`.

## Task F.4 — web: `usePermissions` and the View only badge

> **Note (2026-11-17, after F.3):** `usePermissions.ts` and `usePermissions.test.tsx` were
> made in F.3, with the shape below and the five hook tests of Step 1 (plus one for a loading
> location list). F.4 adds the switcher badge and its tests, and its two mutation checks can
> be re-run against the existing hook.

**Files:**
- Create: `apps/web/src/hooks/usePermissions.ts`, `apps/web/src/hooks/usePermissions.test.tsx`
- Modify: `apps/web/src/components/shared/LocationSwitcher/LocationSwitcher.tsx`, its stories
  and smoke test; `apps/web/src/hooks/CLAUDE.md` (one entry)

**Interfaces:**
- Produces: T9's shape, exactly:
  ```ts
  export interface Permissions {
    isLoading: boolean
    canEditCatalog: boolean          // cloud: household role owner or manager
    canManageLocations: boolean      // cloud: household role owner or manager
    roleAt(locationId: string): LocationRole | null
    canEditLocation(locationId: string): boolean   // participant or higher
    isOrganizerAt(locationId: string): boolean
  }
  export function usePermissions(): Permissions
  ```
- Consumes: `useDataMode`, `useHousehold`, `useLocations` (with `myRole` from F.1).

- [x] **Step 1: Write the failing tests:** local mode → all `true`, `roleAt('x')` is
  `'organizer'`; cloud loading → all `false`; cloud manager + viewer at K →
  `canEditCatalog` true, `canEditLocation('K')` false (Review Focus 4); member + participant at
  G → `canEditCatalog` false, `canEditLocation('G')` true; an id not in the list → `null` and
  `false`. Switcher: `location viewer sees View only next to that location` (button and
  dropdown both); an organizer's row has no badge.
- [x] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [x] **Step 5: Mutation checks:** return `true` while loading → the loading test goes red;
  make `canEditLocation` read the household role → the Review Focus 4 test goes red.
- [x] **Step 6: Gate**, commit `feat(households): usePermissions and the View only badge`.

**As built (2026-11-17, `e5669669`).**

- **The hook was already there.** `usePermissions` and its 6 tests came in F.3. F.4 adds
  no hook code. The switcher reads `usePermissions().roleAt(id)`.
- **The badge.** `LocationSwitcher` shows "View only" (`locationSwitcher.viewOnly`) where
  `roleAt(id)` is `viewer`:

  | Place | What shows |
  |---|---|
  | menu row of a viewer location | the badge, after the name. A `{' '}` text node before it, so the row's name is "Kitchen View only" |
  | `full` trigger (sidebar), while that location is active | the badge, after the name |
  | `compact` trigger (toolbars), while that location is active | a small `Eye` mark on the corner; there is no room for the word |
  | both triggers | the accessible name `locationSwitcher.triggerLabelViewOnly` |

  The badge is `Badge` `neutral-outline` with `normal-case` and `bg-background-surface`.
  No badge in local mode (`roleAt` is `organizer`) or while the roles load (`roleAt` is
  `null`, so the badge appears late and never on the wrong row). It follows the LOCATION
  role only: a household manager who views a location sees it (Review Focus 4). A
  participant sees no badge.
- **New texts (owner answer O11 for the badge; the label is new):**

  | Key | English | `tw` |
  |---|---|---|
  | `locationSwitcher.viewOnly` | View only | 僅檢視 |
  | `locationSwitcher.triggerLabelViewOnly` | Switch location (current: {{name}}, view only) (changed in the F.4 review, see there) | 切換據點（目前：{{name}}，僅檢視） |

- **Tests.** `LocationSwitcher.cloud.test.tsx` (new, 8): three locations with three roles
  (viewer, organizer, participant), a fourth on the settings list only (no role), and the
  same roles under a household `member` and a `manager`. `LocationSwitcher.test.tsx`: 1
  (no badge in local mode). Stories `CloudViewOnly` and `CloudViewOnlyCompact`, each
  rendering the real switcher in a `MockedProvider`, with 2 smoke tests (checked in
  `storybook-static/index.json`). Web suite **2715 / 285 → 2726 / 286** (after Part 1 of
  this session took it from 2706 to 2715).
- **E2E and a11y.** `a11y.spec.ts` does not run in the `cloud` project, and only cloud has
  roles. So the badge's scans live in `location-switcher.spec.ts`, as 3 cloud-only tests: a
  viewer sees the badge on Home, not on Garage (participant), and the Shed (no role) is not
  listed; and two axe scans, light and dark. Each scan checks the page with the menu
  closed, then only `[role="menu"]` with it open. The axe rules moved from `a11y.spec.ts`
  into `e2e/helpers/axe.ts`, so both files scan with the same rules.
- **What the first scan found.** Two violations, in both themes:
  - `aria-hidden-focus` on the app root, `.h-dvh`. Radix's modal menu marks the rest of
    the app `aria-hidden`. Every dropdown in the app does this; `a11y.spec.ts` already
    avoids scanning with a menu open for this reason. Not fixed here.
  - `color-contrast` on the menu badge: axe measured `#5e584a` on `#787062`, 1.44:1. The
    row really is `oklch(0.98 …)` (read with `getComputedStyle`), so the eye saw a pass.
    The badge had no background of its own, and axe took one from further down the stack.
    Giving it `bg-background-surface` fixed the measurement.
- **Mutations, each copied aside and restored from the copy (`diff -q` clean):**

  | Mutation | Red |
  |---|---|
  | badge for every role | 10, incl. every cloud test that expects no badge, and 3 local tests |
  | badge for every role below organizer | 4, incl. `location participant sees no View only badge` |
  | badge only when the household role is not owner or manager | `household manager who is only a viewer of the active location still sees View only` |
  | no badge on the `full` trigger | 3, incl. the viewer test and the manager test |
  | the accessible name ignores view only | 4, incl. `location viewer sees the eye mark on the compact trigger, and it is named` |
  | no badge in the menu | 3, incl. `location organizer sees no View only badge on the trigger` (its menu check) |
  | no space before the menu badge | only the story smoke test, by `textContent`. jsdom's accessible-name check passed without the space |
  | `usePermissions` gives `true` while loading (plan Step 5) | both loading tests of `usePermissions.test.tsx` |
  | `canEditLocation` reads the household role (plan Step 5) | the Review Focus 4 test and the member + participant test |
  | `usePermissions` fills the roles while the household loads | its loading test, and `user sees no View only badge while the household role is loading` |
  | the badge without `bg-background-surface` (E2E, `cloud`) | both axe tests, `color-contrast` on 1 node |

- **Order of work.** The implementation was written before the tests, in this task and in
  the F.3 review fixes. Every test was then checked by a mutation above, so each one is
  known to fail without the behaviour it names.

**Review fixes for F.4 (2026-11-17, review of `145ab166..54dcc8b3`).** Tests were written
first and shown red, then the code. Commits `0a6321a2`, `4cab8303`, `fe085176`.

- **A refused reorder now says what really happened.** The message and the reload follow
  the error code (`hasGraphQLErrorCode`):

  | Error | Toast | `useReorderLocations` reloads |
  |---|---|---|
  | `BAD_USER_INPUT` | `reorderError` | `GetHouseholdLocations`, `GetLocations` |
  | `FORBIDDEN` | `reorderFailed` (the general text, in the shape of `deleteError`) | `GetHousehold`, so the drag handles go away |
  | a network error, anything else | `reorderFailed` | nothing |
  | `OfflineWriteError` | none from the page | nothing |

  No toast once the page has unmounted (a `mounted` ref); the reload still runs. The hook's
  own `OfflineWriteError` check is gone: an offline error has no GraphQL code, so the code
  rule already reloads nothing (a mutation that removed only that check left every test
  green, so it was dead code).
- **`mutateAsync` keeps its reload, and now has a test.** It has no caller in the app, but
  the hook tests use it, and it keeps the cloud branch's shape the same as the local
  `useMutation` branch. Removing it would have changed three existing tests for no gain.
- **The badge is a `<span>`** with `badgeVariants({ variant: 'neutral-outline' })`. `Badge`
  renders a `<div>`, which is not valid inside the trigger `<button>`, and has no
  `asChild`. Same classes, and `inline-flex` lays a span out like the div.
- **Label in Name (WCAG 2.5.3).** The view only name now contains the visible text
  "<name> View only" in order. The plain name ("Switch location (current: Home)") already
  contained the visible name, so it is unchanged; E2E page objects that find the switcher
  by "Switch location" keep working.
- **The local badge test is a labelled negative control.** Local `roleAt` is hard-coded,
  so it cannot see a role bug. It still goes red when the switcher badges a non-viewer
  location.
- **Texts (new or changed):**

  | Key | English | `tw` (first version; the owner can correct it in the PR) |
  |---|---|---|
  | `settings.locations.reorderError` (changed) | The location list changed. Reloading it now. Try again. | 據點清單有變動，正在重新載入，請再試一次。 |
  | `settings.locations.reorderFailed` (new) | Could not save the new order. Please try again. | 無法儲存新的順序，請再試一次。 |
  | `locationSwitcher.triggerLabelViewOnly` (changed) | Switch location (current: {{name}} View only) | 切換據點（目前：{{name}} 僅檢視） |

- **Tests.** `useLocations.test.tsx` +4 (FORBIDDEN reloads the role only; network error
  and offline reload nothing; `mutateAsync` reloads both lists). `index.cloud.test.tsx` +4
  (FORBIDDEN, network error, offline, a refusal after the page unmounted); the
  `BAD_USER_INPUT` test now also checks that nothing else is reloaded.
  `LocationSwitcher.cloud.test.tsx` +1 (the name holds the visible words, in `en` and `tw`),
  and the viewer test checks the badge is a `SPAN`.
- **Mutations, each copied aside and restored from the copy (`diff -q` clean):**

  | Mutation | Red |
  |---|---|
  | the page's `OfflineWriteError` check removed | `household owner reordering while offline sees only the offline message` |
  | the hook reloads both lists for any non-code error (offline included) | 4: both hook tests "… gets no reload", and the page's offline and network tests |
  | `mutateAsync` does not reload | `household owner gets both location lists again after a refused reorder through mutateAsync too` |
  | the page shows `reorderError` for every error | the page's FORBIDDEN and network tests |
  | `FORBIDDEN` reloads nothing | the hook's and the page's FORBIDDEN tests |
  | the page toasts after unmount | `user who leaves the page before a reorder is refused sees no message about it` |
  | the badge is a `<div>` again | `location viewer sees View only next to that location, on the trigger and in the menu` |

  The `tw` label was red first too (the en/tw Label in Name test).

## Task F.5 — web: a household `member` sees the catalog read-only

**Files** (from research; re-check each):
- Catalog list pages: `routes/settings/household/{shelves,vendors,recipes,tags}/index.tsx`,
  `components/vendor/VendorCard/VendorCard.tsx`, `components/recipe/RecipeCard/RecipeCard.tsx`
- Catalog detail pages: `…/shelves/$shelfId/{index,filters,items}.tsx`,
  `…/vendors/$id/{index,items}.tsx`, `…/recipes/$id/{index,items}.tsx`,
  `…/tags/$id/{index,items}.tsx`
- Item page: `routes/items/$id/index.tsx` (`ItemForm` read only, `DeleteButton` hidden),
  `routes/items/$id/relation/{tags,vendors,recipes}.tsx`
- Search: `components/item/ItemListToolbar/ItemListToolbar.tsx` (hide **Create item** and the
  Enter shortcut when the caller passes no `onCreateFromSearch`); its callers in
  `components/pantry/PantryListView.tsx`, `ShelfDetailView.tsx`,
  `routes/shopping/$vendorId.tsx` pass it only when `canEditCatalog`
- Cooking: the empty state's **Create recipe** button in `routes/cooking.tsx`
- Tests beside each file (`*.cloud.test.tsx` where the file already has one)

- [x] **Step 1: Write the failing tests**, one per page group, cloud mode, `useHousehold`
  mocked to `member`, and one control per page in the `manager` state (so the test can fail
  both ways): `household member sees tags without add, edit or delete`, the same for shelves
  (no drag handle either), vendors, recipes; `household member sees item details read only`
  (inputs `disabled` or `readOnly`, no Save, no Delete) `and can still edit stock where they
  are a participant` (the Stock tab); `household member does not see Create item in search`.
- [x] **Step 2: Run** — FAIL. **Step 3: Implement** with `usePermissions().canEditCatalog`.
  Hide controls; do not disable them, except form inputs, which are `readOnly` so the text can
  still be selected. **Step 4: Run** — PASS.
- [x] **Step 5: Mutation checks:** on three pages chosen from different groups (one list,
  one detail, the item form), invert the condition → each page's test goes red. Report which
  three.
- [x] **Step 6:** stories: add one `MemberReadOnly` story per list page that renders the real
  page with the role mocked through the existing Apollo stub pattern (root `CLAUDE.md`,
  *Apollo context in route stories*). **Gate**, commit
  `feat(households): read-only catalog for household members`.

**As built (2026-11-17, `2adf7371..cf6fd212`).** Feature commits: lists `2adf7371`, Info pages `efdef324`, Items and Filters tabs `e3addd27`, item page `e9e1fb35`, search `1392029c`, cooking `b1889646`, pantry Add dialog `aaf908b8`. Fixes on the way: `134d7477`, `74d806fd`, `acff9ab0`, `cf6fd212`.

- **Order of work.** Tests first this time. Each group's tests were run and shown red for the
  member case before any page code changed, then the code, then green. One exception:
  `ItemForm`'s `readOnly` prop was written before its unit test; that test was proved by a
  mutation instead (M3 below).
- **Where the rules live.** `usePermissions` is split. `permissionsFor({ mode, isLoading?,
  householdRole?, locationRoles? })` holds the rules; the hook reads the two roles and calls
  it. Page tests set a role through the same rules with `src/test/rolePermissions.ts`. The
  two people in every role test differ ONLY in the household role (`member` and `manager`),
  and both are a viewer of one location, a participant of the active one, and have no role
  on a third. So a page that read a location role by mistake fails one of the two.
- **What a household member sees** (all through `usePermissions().canEditCatalog`; local
  mode is unchanged):

  | Surface | Member |
  |---|---|
  | tags, vendors, recipes, shelves lists | no add, edit, delete or drag; a `ReadOnlyNote` above a non-empty list; an empty list says who can add rows instead of "Create your first …" |
  | the four Info pages (`$id/index.tsx`) | name `readOnly`, selects disabled, no Save, no Delete, the note "Only a household owner or manager can change this." |
  | the four Items tabs | checkboxes and recipe amounts disabled (they still show what is assigned), no "Create item" from search (button or Enter) |
  | a filter shelf's Filters tab | badges show what is on, `aria-disabled`, a press writes nothing |
  | item Info tab | `ItemForm readOnly`, no Delete, the note. The unit-switch dialog is reached only through Save, so it cannot open |
  | item Tags, Vendors, Recipes tabs | badges `aria-disabled`, a press writes nothing, no "New …" buttons |
  | item Stock tab | unchanged: it follows the location role (F.6). A guard test checks a member who is a participant still edits it |
  | Create item in search (pantry list, shelf view, cart page) | hidden, Enter does nothing |
  | the search tail's group action (Apply vendor, Add to recipe, Add to shelf) | replaced by a note, "Only an owner or manager can add it here.", in `useItemSearchTailWiring` |
  | the pantry Add dialog (`NewItemDialog`) | no Create option, button or package unit field; picking an existing item still stocks it (a location right) |
  | cooking page | no "Create recipe" in the empty state, no "Create" from search |

  Controls are hidden, as Step 3 says, except form inputs (`readOnly`) and three things that
  SHOW state: the Items-tab checkboxes and recipe amounts (disabled), and the filter and
  relation badges (`aria-disabled`). Hiding those would hide what is assigned.
- **The note waits for the role.** `ReadOnlyNote` (new, `components/shared/`) and the
  read-only empty texts show only when `!isLoading && !canEditCatalog`. While the role loads
  `canEditCatalog` is `false` for every role, so with `!canEditCatalog` alone the note
  flashed for an owner, and a story test that waited for it passed with the role set to
  `owner`.
- **New texts** (first versions; the owner can correct `tw` in the PR):

  | Key | English | `tw` |
  |---|---|---|
  | `settings.catalogReadOnly` | Only a household owner or manager can add or change these. | 只有家庭擁有者或管理者可以新增或修改這些項目。 |
  | `settings.catalogReadOnlyItem` | Only a household owner or manager can change this. | 只有家庭擁有者或管理者可以修改這個項目。 |
  | `items.searchTail.catalogReadOnly` | Only an owner or manager can add it here. | 只有擁有者或管理者可以加到這裡。 |

- **Stories.** `MemberReadOnly` on the tags, vendors, recipes, shelves and cooking pages,
  each rendering the REAL page in cloud mode with the role from `GetHousehold`
  (`src/test/cloudRoleStory.tsx`, `CloudRolePage`). Each smoke test restores the real
  generated and Apollo hooks, waits for the member note FIRST, then checks the absences;
  each went red with the story's role set to `owner`. Also `ReadOnlyNote` (`Default`,
  `CustomText`), `ReadOnly` on `VendorCard`, `RecipeCard`, `VendorInfoForm`,
  `RecipeInfoForm`, `TagInfoForm`, and `InfoSectionReadOnly` on `ItemForm`. Checked in
  `storybook-static/index.json`.
- **Tests.** New files: `routes/settings/household/catalogReadOnly.test.tsx` (12),
  `catalogDetailReadOnly.test.tsx` (8), `catalogItemsReadOnly.test.tsx` (12),
  `routes/items/$id/readOnly.test.tsx` (10), `components/pantry/catalogReadOnly.test.tsx`
  (10), `routes/cooking.readOnly.test.tsx` (4), `NewItemDialog.readOnly.test.tsx` (2). Plus
  3 in `useItemSearchTailWiring.test.tsx`, 2 in `ItemForm.test.tsx`, and story smoke tests.
  Web suite **2735 / 286 → 2813 / 294** (2735 measured after Part 1 of this session, on the
  tree before F.5). Server unchanged at **1813 / 70**.
- **E2E** (ports 4001, 5174-5176 free first). `local`: tags, vendors, recipes, shelves,
  locations settings, `location-switcher`, `item-management`, `unified-item-search`,
  `shopping`, `cooking`, `shelves`, `vendors-group`, `recipes-group`,
  `settings-global-pages` and `a11y.spec.ts`: **149 passed, 9 skipped** (2.9m, load 18 at
  the start from other sessions, 4.8 at the end). `cloud`: the same files (a11y is not in
  cloud) plus the four specs where the browser is a household member (`shared-cart`,
  `live-cart`, `live-pantry`, `settings/import-households`): **105 passed, 6 skipped**
  (21.9m, load 2 to 5). No spec drives a member through a catalog page, so E2E proves no
  regression for owners and managers, not the member view; that is F.8.
- **Existing tests that had to change, and why:**
  - `routes/items/$id/index.cloud.test.tsx` and `NewItemDialog.cloud.test.tsx` now answer
    `GetHousehold` with `manager`. They stubbed it to nothing, so the role was unknown and
    the Info tab became read only.
  - `tags/index.test.tsx` and `vendors.test.tsx` render a page with no `QueryClient`, so
    they mock `usePermissions` to the local rules.
  - `useItemSearchTailWiring.test.tsx` mocks its neighbours, so it mocks `usePermissions`.
  - `recipes/$id/items.stories.test.tsx` waits for the assigned checkbox, not the name.
- **Mutations, each copied aside and restored from the copy (`diff -q` clean):**

  | # | Mutation | Red |
  |---|---|---|
  | M1 (list) | vendors list shows New Vendor for every role | 3, incl. `household member does not see add or delete on the vendors page` and the `MemberReadOnly` story test |
  | M2 (detail) | recipe Info page never `readOnly` | `household member sees read only a recipe's Info page` |
  | M3 (item form) | `ItemForm`'s name field not `readOnly` | 3, incl. `household member sees read only the item's Info tab` |
  | M4 | the search tail keeps the group action for a member | 5, incl. the cart, vendor, recipe and shelf view tests |
  | M5 | the Add dialog offers Create to every role | `household member cannot create a new item, and can still pick an existing one` |
  | M6 | vendor Items-tab checkbox enabled for every role | `household member on the Items tab of 'a vendor'` |
  | M7 | the Filters tab's write guard removed (`aria-disabled` kept) | `household member on a filter shelf's Filters tab cannot toggle a filter` |
  | M8 | the item Vendors tab's toggle guard removed | `household member on the item's 'vendors' tab cannot change it` |
  | M9 | `CookingControlBar` shows Create with no `onCreateRecipe` | `household member does not see Create when a recipe search finds nothing` |
  | M10 | the vendors note shown while the role loads | `user sees neither write controls nor the read-only note yet` |
  | M11 | a member can still drag a tag | `household member does not see add, edit, delete or drag on the tags page` |
  | M12 | shelf drag handle for every role | `household member does not see add, delete or drag handles on the shelves page` |
  | M13 | item Info Delete for every role | `household member sees read only the item's Info tab` |
  | M14 | `canEditCatalog` also true for a participant of the active location | 10, across the item page and the list pages |

  Plan Step 5 asked for three (one list, one detail, the item form): M1, M2, M3.
  Guard, green either way by design: `household member who is a participant of the active
  location still edits its stock`.

**Review fixes for F.5 (2026-11-17, review of `54dcc8b3..683d0f15`).** Tests were written
first and shown red, then the code, except where a row below says otherwise. Commits
`de8ca513`, `bc006456`, `ef030253`, `b2d9670f`, `1c82b170`.

- **A failed `GetHousehold` no longer shows an owner the member view.** When the query failed
  with nothing cached, `isLoading` was `false` and the role `undefined`, so every page said
  "Only a household owner or manager can change this.". `Permissions` has a new field,
  `roleKnown`: `true` in local mode; in cloud `true` only when not loading AND a household
  role is there. Every read-only note (the four list pages, the four Info pages, the item
  Info tab, the cooking empty state, the search tail's member note) now shows only when
  `roleKnown && !canEditCatalog`. Write controls stay hidden while the role is unknown.
  Elsewhere the app already treated a missing role this way: `ImportCard` shows its member
  line only for `role === 'member'` and keeps the button disabled otherwise, and
  `HouseholdNameCard` renders nothing without data.
- **A member is told why Create is missing.** A new line shows where Create would have
  shown, with the same trigger (search text, no exact match): under the `ItemListToolbar`
  search row (pantry list, shelf view, cart page, the four Items tabs) through a new prop
  `createReadOnlyNote`; under the `CookingControlBar` search row through the same prop; and
  under the matches of the pantry Add dialog. Only when `roleKnown`. No existing text fitted:
  `settings.catalogReadOnly` says "these", and `items.searchTail.catalogReadOnly` says "add
  it here".
- **An empty tags page tells a member why it is empty.** The note needed
  `tagTypes.length > 0`, so a member with no tag types saw a page with nothing on it. The
  note now shows on the empty page too.
- **The Info forms keep their autofocus.** `TagInfoForm`, `VendorInfoForm` and
  `RecipeInfoForm` set `autoFocus={!readOnly}`. While the role loaded the form mounted
  read-only, and React focuses only on mount, so an owner lost the focus. The three Info
  pages now wait for the role (`isLoading`) before they mount the form. The review said the
  Add Tag dialog had the same problem; it does not: it opens only from New Tag, which only an
  editor sees, and it never passes `readOnly`. A test pins that it keeps the focus.
- **Docs:** the tags, vendors and recipes notes, `routes/CLAUDE.md`, `items/CLAUDE.md`,
  `settings/CLAUDE.md` (there is no shelves note), `hooks/CLAUDE.md` and
  `components/CLAUDE.md`.
- **New texts** (first versions; the owner can correct `tw` in the PR):

  | Key | English | `tw` |
  |---|---|---|
  | `items.createReadOnly` | Only a household owner or manager can create a new item. | 只有家庭擁有者或管理者可以建立新的品項。 |
  | `cookingControlBar.createReadOnly` | Only a household owner or manager can create a new recipe. | 只有家庭擁有者或管理者可以建立新的食譜。 |

- **Tests.** `usePermissions.test.tsx` +4; `catalogReadOnly.test.tsx` +6 (2 empty tags page,
  4 unknown role); new `catalogInfoRoleArrives.test.tsx` (10: focus once the role arrives,
  member control, unknown role, for the tag, vendor and recipe Info pages, and the Add Tag
  dialog); `items/$id/readOnly.test.tsx` +1; `cooking.readOnly.test.tsx` +2 (unknown role, the
  O10 guard); `useItemSearchTailWiring.test.tsx` +1; `components/pantry/catalogReadOnly.test.tsx`
  +1 and four more assertions; `NewItemDialog.readOnly.test.tsx`, `catalogItemsReadOnly.test.tsx`
  (+1, the tag and recipe Filters badges) extended; `ItemListToolbar` story
  `CreateReadOnlyNote` with a smoke test. `src/test/rolePermissions.ts` gained `asRoleUnknown`
  and `useRoleOverride`. Web suite **2813 / 294 → 2841 / 295** (measured before and after on
  this branch). Server unchanged at **1813 / 70**.
- **Order of work, said plainly.** The unknown-role page tests were written after the page
  fix had already been applied, so they never ran red against the old code on their own.
  The mutation below (M-R1) is what proves them: it turns all 11 red.
- **Mutations, each copied aside and restored from the copy (`diff -q` clean):**

  | # | Mutation | Red |
  |---|---|---|
  | M-R1 | `roleKnown: !isLoading` (ignores a missing role) | 11: the hook test, 4 list pages, 3 Info pages, the item Info tab, the cooking empty state, the search tail |
  | M-R2 | the vendor Info page mounts its form while the role loads | `household manager gets the focus in the vendor name once the role has loaded` |
  | M-R3 | the tags note needs a tag type again | `household member on an empty tags page still sees why there is no add button` |
  | M-R4 | the toolbar note ignores an exact match | `household member sees no create note when the search matches an item exactly` |
  | M-R5 | the toolbar note text removed | 7: the four Items tabs, the pantry, the cart, the shelf view |
  | M-R6 | the Add dialog note also on an exact match | `household member cannot create a new item, and can still pick an existing one` |
  | M-R7 | the Add dialog note never shown | the same test |
  | M-R8 | the cooking note never shown | `household member does not see Create when a recipe search finds nothing` |
  | M-R9 | the recipe checkbox disabled for a member (O10 guard) | `household member can still cook at a location where they are a participant` |
  | M-R10 | the Filters tab tag badge loses `aria-disabled` | `household member on a filter shelf's Filters tab sees the tag and recipe badges marked disabled` |
  | M-R11 | the Filters tab recipe badge loses `aria-disabled` | the same test |

## Task F.6 — web: a location `viewer` sees the location read-only

**Files:**
- `components/item/ItemCard/ItemCard.tsx` callers (do not add a role prop to `ItemCard`
  itself; its callers already decide by passing or not passing `onQuickUpdate`,
  `onCheckboxToggle`, `onAmountChange`): `components/pantry/PantryListView.tsx`,
  `ShelfDetailView.tsx`, `VendorDetailView.tsx`, `RecipeDetailView.tsx`
- `routes/shopping/$vendorId.tsx` (no checkbox, no amounts, no Cancel, no Done)
- `routes/cooking.tsx` (no checkbox, no amounts, no Done)
- `routes/items/$id/stock.tsx` (stock form read only for a viewer; **Remove from location**
  only when `isOrganizerAt` — closes the H3a gap; a `FORBIDDEN` from the remove now shows a
  toast instead of an unhandled rejection)
- `components/settings/…/LocationList.tsx` is done in F.3
- Tests beside each

- [x] **Step 1: Write the failing tests** (cloud, active location K, `myRole: 'viewer'`, plus
  one `participant` case per page): `location viewer sees the pantry without quick update`,
  `location viewer sees the cart but cannot check out` (the rows and amounts are shown),
  `location viewer cannot cook`, `location participant does not see Remove from location`,
  `location organizer sees Remove from location`, `user sees a message when removing from a
  location is refused` (mock `FORBIDDEN`).
- [x] **Step 2: Run** — FAIL. **Step 3: Implement** with `canEditLocation(activeLocationId)`
  and `isOrganizerAt`. **Step 4: Run** — PASS.
- [x] **Step 5: Mutation checks:** invert the viewer check on the shopping page and on the
  pantry list → red; show Remove to `participant` → red.
- [x] **Step 6:** web side of T7: `ActiveLocationProvider` calls `cloudBootstrapCarts` only
  when `canEditLocation(activeLocationId)`. Test: `location viewer switching to a location sends
  no bootstrapCarts`. Mutation: remove the condition → red. **Gate**, commit
  `feat(households): read-only location views for viewers`.

**As built (2026-11-17, `7f50ece0`, docs `8c35e265`).** Tests were written first and shown
red (16 page tests, 11 Stock tab tests, 2 bootstrap tests, 2 `ItemForm` tests), then the code.

- **Where the rights are read.** Two new hooks in `hooks/useActiveLocationRights.ts`, on top
  of `usePermissions`: `useActiveLocationRights()` gives `canEditHere` (`participant` or
  higher at the active location) and `isViewerHere` (the role is KNOWN to be `viewer`, for the
  note); `useCreateHere()` gives `canCreate` and the note for a create-from-search that also
  stocks the item here, which needs the catalog right AND the location right. The rank rule
  moved to `lib/locationRole.ts` (`locationRoleAtLeast`), because several test files mock
  `usePermissions.ts` with only the hook, and `ActiveLocationProvider` needs the rule too.
- **What a viewer of the active location gets** (local mode is unchanged):

  | Surface | Viewer |
  |---|---|
  | pantry list, shelf, vendor and recipe views | no quick-update button; no Add button; no Create item on the empty pantry; no Create item from search (the search row says `common.locationViewOnly` instead); no `Add to {location}` in the search tail |
  | cart page | checkboxes and amount buttons DISABLED, so they still show what is in the cart and how much; no Cancel, no Done; no Create item or Add to location from search; the note above the list |
  | cooking | recipe and item checkboxes disabled; no Cancel, no Done (decision O10); the note under the toolbar |
  | item Stock tab | per PAGE, by the role at that page's location: viewer → form read only (numbers `readOnly`, steppers, Pack, Unpack, Clear and Fill disabled, no Save) and the note; Add to location needs `participant`; Remove from location needs `organizer`. A refused removal shows a toast |
  | `ActiveLocationProvider` | sends `bootstrapCarts` only where `myRole` is `participant` or higher (Review Focus 2). No call, so no error to handle |

- **Review Focus 4.** A household manager who is a viewer here keeps every catalog action
  (Apply vendor in the cart tail, Create recipe on the cooking page) and loses every stock
  action. `asLocationRole(role, householdRole = 'manager')` in `src/test/rolePermissions.ts`
  makes the viewer of every test a household manager on purpose.
- **Disabled, not hidden, where the control shows state** (the F.5 rule): the cart checkboxes
  and amounts, and the cooking checkboxes (their `aria-describedby` still names the stock
  status). `ItemCard` gets no role prop: its callers pass `disabled` or leave out
  `onQuickUpdate`, as the plan asked.
- **Why the bootstrap gate reads the list, not `canEditLocation`.** `usePermissions` returns
  `false` for every location while the HOUSEHOLD role loads. The provider already holds the
  location list with `myRole`, so it reads the role there and does not wait for
  `GetHousehold`. The ref that stops repeat calls is set only when a call is made, so a role
  that rises to participant later bootstraps then.
- **New texts** (first versions; the owner can correct `tw` in the PR):

  | Key | English | `tw` |
  |---|---|---|
  | `common.locationViewOnly` | You can view this location, but not change it. | 你只能檢視這個據點，不能修改。 |
  | `items.detail.locationPager.removeForbidden` | Only an organizer of {{location}} can remove {{name}} from it. | 只有{{location}}的據點王可以把{{name}}移出這個據點。 |
  | `items.detail.locationPager.removeFailed` | Could not remove {{name}} from {{location}}. Please try again. | 無法把{{name}}移出{{location}}，請再試一次。 |

- **Tests.** New files: `routes/locationViewer.test.tsx` (16: a viewer and a participant of the
  active location who differ only in that role, both household managers, each with the other
  role on a second location and none on a third; plus a household member who is a viewer),
  `routes/items/$id/stock.roles.test.tsx` (11: viewer, participant and organizer; paging to a
  location with another role; the FORBIDDEN and the general toast), `lib/locationRole.test.ts`
  (2). Plus 2 in `useActiveLocation.test.tsx` (cloud, `MockedProvider`, a viewer location, a
  participant location and a stored id with no role) and 2 in `ItemForm.test.tsx`. Story
  `StockSectionReadOnly` on `ItemForm` with a smoke test (checked in
  `storybook-static/index.json`). Web suite **2841 / 295 → 2875 / 298**. Server unchanged at
  **1813 / 70**.
- **Existing tests that had to change, and why:**
  - `routes/items/$id/stock.test.tsx` replaces the generated hooks with its own factory, which
    had no `useGetHouseholdQuery`. The Stock tab now reads `usePermissions`, so the real Apollo
    hook ran with no provider and 31 tests failed. One stub line fixed it.
  - `routes/items/$id/stock.stories.test.tsx`'s fixture locations had no `myRole`, so in cloud
    the Stock tab showed no Add to location. They now say `organizer`. The `CloudMode` story
    gained a `GetHousehold` mock (an owner), so in Storybook it does not depend on a failed
    query either.
- **Mutations, each copied aside and restored from the copy (`diff -q` clean):**

  | # | Mutation | Red |
  |---|---|---|
  | M1 | cart checkboxes ignore the viewer check (plan Step 5) | `location viewer sees the cart but cannot check out` |
  | M2 | cart Cancel and Done for every role | the same test |
  | M3 | pantry list quick update for every role (plan Step 5) | `location viewer does not see quick update, Add, or Add to location on the pantry list` |
  | M4 | Remove from location for a participant (plan Step 5) | `location participant does not see Remove from location` |
  | M5 | the bootstrap gate removed (plan Step 6) | `location viewer switching to a location sends no bootstrapCarts, and logs no error` |
  | M6 | the Stock tab form editable for a viewer | `location viewer cannot edit the stock of that location`, and the paging test |
  | M7 | `FORBIDDEN` gets the general text | `user sees a message when removing from a location is refused` |
  | M8 | the refusal rethrown (not caught) | both toast tests |
  | M9 | the tail's Add to location for every role | the pantry list test and `household member who is only a viewer of the active location gets neither` |
  | M10 | cooking Done for a viewer | `location viewer cannot cook` |
  | M11 | cooking recipe checkbox enabled for a viewer | the same test |
  | M12 | Fill to Full enabled in a read-only form | `location viewer sees every stock field read only and no Save` |
  | M13 | pantry Add button for a viewer | the pantry list test |
  | M14 | Stock tab Add to location for a viewer | `location viewer does not see Add to location on a page where the item is not stocked` |
  | M15 | no view-only note under the search row | `location viewer does not see Create item from a pantry search` |
  | M16 | create from search ignores the location role | the pantry and cart search tests |
  | M17 | vendor view quick update for a viewer | `location viewer does not see quick update on the shelf, vendor and recipe views` |

  Guard, green either way by design: the participant half of every test above.
- **Gate and E2E** (Node 22.17.1). Root `pnpm lint`, `pnpm build`, `build-storybook`,
  `pnpm check` and the `TS6385` grep: all clean. `pnpm test`: web **2875 / 298**, server
  **1813 / 70**, `scripts/spec` **70**. Ports 4001, 5174-5176 free first. `local`: cooking,
  item-management, item-stock-input, item-stock-pager, location-not-stocked-here,
  location-switcher, shopping, shelves, vendors-group, recipes-group, unified-item-search,
  item-list-state-restore, settings/tags, vendors, recipes, shelves, and `a11y.spec.ts`:
  **159 passed, 8 skipped** (3.1m; load 22 at the start from other sessions, 4.6 at the end).
  `cloud`: the same files (no a11y) plus shared-cart, live-cart, live-pantry and cloud-roles
  (the browser is a household member in some): **110 passed, 6 skipped** (24.6m; load 2.9 at
  the end). This covers Part 1 (the F.5 review fixes) too. No spec drives a location viewer
  through a page, so E2E proves no regression for the other roles, not the viewer view: that
  is F.8.

**Review fixes (2026-11-17, `31f83bc4`..`6c7193a2`).** A review of `683d0f15..eceef55b` found
these. Each was checked first, and each test was mutation-checked.

| # | Finding | Fix |
|---|---|---|
| 1 | A household manager who is a viewer of the active location could not create a vendor (Review Focus 4). `createVendor` asked `participant`, because it pre-creates the cart. The dialog stayed open with no message | `createVendor` asks `viewer` on the location (it reads the role for the cart decision in the same query, and keeps "no role learns nothing" before `requireLocationInHousehold`). It writes the cart and sends `CART` only for `participant` or higher. `NewVendorDialog` and the item Vendors tab show a toast (`showVendorCreateError`, `lib/vendorCreateError.ts`) |
| 2 | The Stock tab's note (`roleAt(viewed.id)`) and Remove (`isOrganizerAt(viewed.id)`) had no test that could tell the viewed page from the active one | two paging tests in `stock.roles.test.tsx`: organizer here and viewer at the Cabin, and the reverse |
| 3 | The viewer half of the cart search test asserted an absence before the catalog had loaded | it waits for Brie (stocked here, in the tail) first |
| 4 | `.not.toContain('Eggs')` compared ids with a name | compares with the Eggs item's id |
| 5 | A viewer was not told why the cart and cooking controls are disabled | `ReadOnlyNote` takes an `id`; `ItemCard` takes `controlsDescribedBy`; the cart checkboxes and amount buttons, and the cooking recipe and item checkboxes, name the note in `aria-describedby` (only for a KNOWN viewer, because the note renders only then) |
| 6 | Switches A (participant), B (viewer), A gave no second bootstrap of A | a viewer location moves the ref to a viewer marker, with no call. The "role rises later" rule had no test either; it has one now |
| 7 | Stale docs | `hooks/CLAUDE.md` (`useItemSearchTailWiring`, `useRemoveItemFromLocation`, `useImportTargetLocations`, the ref rule), root `CLAUDE.md` and `lib/importData.ts` |

New texts: `settings.vendors.createForbidden` "Only a household owner or manager can add a vendor."
/ 「只有家庭擁有者或管理者可以新增供應商。」 and `settings.vendors.createFailed` "Could not add
{{name}}. Please try again." / 「無法新增{{name}}，請再試一次。」

**Follow-up to F.6 (2026-11-17): a viewer's search lists items stocked elsewhere.** Owner
decision: "yes, viewer can see household items with no add buttons". As built:

- `ItemSearchTail` takes `notStockedHereReadOnly`. It lists the "not stocked here" section
  with NO action: no button, no disabled control, no row note. It is ignored when
  `addToLocationAction` is set. `hasVisibleTail` counts it, so a viewer's search that finds
  only such items no longer shows the empty state.
- `useItemSearchTailWiring` sets it only for a KNOWN viewer of the active location
  (`roleAt(activeLocation.id) === 'viewer'`). A participant or organizer keeps Add to
  location. While the roles load, or for no role, the section stays hidden, as before.
  Local mode is unchanged (`roleAt` is `organizer`).
- One change covers all five surfaces: the pantry list, shelf, vendor and recipe views and
  the cart page.
- No new text. The rows use the existing divider `common.notStockedHere`.
- Tests: `routes/locationViewer.test.tsx` (3 changed: the pantry list, the cart search, and
  the household member who is a viewer now see the row; Bread and Butter are stocked only at
  `loc-elsewhere`), `hooks/useItemSearchTailWiring.test.tsx` (+4: viewer, participant, no
  role, local), `ItemSearchTail.stories.test.tsx` (+2, story `NotStockedHereReadOnly`), and
  `e2e/tests/shared-household.spec.ts` test 3 (cloud, OWNER and a viewer MEMBER on Fridge,
  an item stocked only at Garage).
- Mutations, each restored from a copy (`diff -q` clean): the section hidden for a viewer →
  4 red; Add to location shown to a viewer → 4 red; `hasVisibleTail` ignoring the flag → 3
  red. The first one also turns the new E2E test red (`1 not stocked here` not found).
- Gate (Node 22.17.1): root `pnpm lint`, `pnpm build`, `build-storybook`, `pnpm check`, the
  `TS6385` grep: clean. `pnpm test`: web **2922 / 305 → 2928 / 305**, server **1820 / 70**,
  `scripts/spec` **70**. E2E: `cloud` `shared-household` + `unified-item-search` **14
  passed**; `local` `unified-item-search` + `a11y` **78 passed, 2 skipped**; `pwa` `a11y`
  **70 passed**.

## Task F.7 — lift the last-location refusal; the empty locations screen

**Files:**
- Server: `apps/server/src/resolvers/location.resolver.ts` (`deleteLocation`),
  `apps/server/src/schema/location.graphql` (comment), `location.resolver.test.ts`,
  `location-live-publish.resolver.test.ts`, `apps/server/scripts/verify-migration.ts`
  (`assertHouseholdLock`)
- Web: `apps/web/src/lib/graphqlErrorCode.ts` and its test,
  `routes/settings/household/locations/index.tsx` and `index.cloud.test.tsx`,
  `components/location/LocationList/LocationList.stories.tsx`,
  `hooks/useActiveLocation.tsx`, `hooks/useLocations.test.tsx`, `routes/index.tsx`,
  `routes/shopping/index.tsx`, `routes/cooking.tsx`, a new
  `components/location/NoLocationsEmptyState/` (component, `index.ts`, stories, smoke test),
  the comment in `lib/importData.ts` near `deleteHomeIfUnused`
- E2E: `e2e/tests/settings/locations.spec.ts`
- Docs: `routes/settings/CLAUDE.md`, `routes/settings/household/locations/CLAUDE.md`

- [ ] **Step 1: Write the failing tests.**
  - Server: `household manager can delete the last location` → `true`, 0 locations left, one
    `LOCATION` event. Keep the existing test that `lockHousehold` runs first.
  - Web: `user sees an empty pantry screen with Create a location when they have no locations`
    (and the same for Shopping and Cooking); pressing it opens the existing create dialog;
    `ActiveLocationProvider` with an EMPTY loaded list clears a stale active id from
    `localStorage` and makes no `bootstrapCarts` call (Review Focus 3).
  - E2E: the `LAST_LOCATION` test in `locations.spec.ts` becomes `user can delete the last
    location and sees the empty pantry`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** T8. Delete the count and the `LAST_LOCATION` throw. Remove the
  `LAST_LOCATION` entry and its message key from the web. Rewrite `assertHouseholdLock` so it
  proves the second `deleteLocation`'s `UPDATE` waits for the first transaction; keep its copy
  of the `UPDATE` in step with `lockHousehold`. **Do not run `verify-migration.ts`** — it runs
  only against the test database, and only with the owner's consent; the task reports that it
  was type-checked, not run. Change the `ActiveLocationProvider` rule: "a loaded but EMPTY list
  leaves the active id untouched" becomes "clears it" (the old reason, "an empty list is usually
  transient", no longer holds once an empty household is real); record the change in
  `hooks/CLAUDE.md`.
- [ ] **Step 4: Run** server, web and `pnpm test:e2e --project=cloud e2e/tests/settings/locations.spec.ts`
  plus `--project=local` for the same file (local mode is unchanged: it still has its own
  default) — PASS.
- [ ] **Step 5: Mutation checks:** put the count back → the server test goes red; render the
  pantry list instead of the empty state when the list is empty → the web test goes red.
- [ ] **Step 6:** add the empty screen to `e2e/tests/a11y.spec.ts`, light and dark. **Gate**,
  commit `feat(households): a household can have no locations`.

**As built (2026-11-17, `827b9997`).** Tests were written first and shown red (2 server, 8
page, 1 provider, 2 settings page, 1 story smoke test), then the code.

- **Server.** `deleteLocation` has no count and no `LAST_LOCATION`. `lockHousehold` stays
  first (T8); its comment in `lib/household.ts` now says why it stays. The
  `location.graphql` comment and the `clearAllData` comment in `import.resolver.ts`
  (which still makes "Home", so a cleared household can start again at once) are updated.
- **`verify-migration.ts`.** `deleteLocationBody` lost its count and its `last-location`
  outcome. Part 1 of `assertHouseholdLock` now proves the second of two deletes WAITS for
  the first: `overlapTwoTransactions` asserts B is blocked by A (`pg_blocking_pids`), and
  B counts the household's locations inside its own transaction AFTER its delete and must
  see 0 (A's committed delete). Without the lock B would not wait and would see 1. Part 2
  (`clearAllData` with `deleteLocation`) needed no change. Type-checked through the root
  `pnpm build`. **Run on 2026-11-17** against the TEST database, with the owner's consent:
  exit 0, 186 `ok —` lines, 0 `FAIL:` lines, and the three household-lock lines passed (the
  second `deleteLocation` WAITED, then saw 0 locations).
- **Web.**
  - `NoLocationsEmptyState` (`components/location/`): the text and **Create a location**.
    One prop, `onCreate`. Story `Default` (`components-location-nolocationsemptystate--default`
    in `storybook-static/index.json`) and a smoke test.
  - `NoLocationsGate` (`components/location/`): wraps the four route components
    (`PantryRoute`, `ShoppingIndexRoute`, `VendorCartRoute`, `CookingRoute`) and shows the
    empty screen only when the CLOUD list has loaded and is empty. It owns the Add Location
    dialog (the same texts as the settings page). The page is its child, so no page hook
    runs while the screen shows. No story: it reads three hooks and a story cannot mock
    them; it is tested through the routes.
  - `ActiveLocationProvider`: a loaded, EMPTY cloud list removes `active-location-id:cloud`
    and sets the id back to the `'local'` sentinel. Local mode keeps the old rule.
  - The settings page lost its `LAST_LOCATION` text (`settings.locations.deleteLastError`,
    both languages). An older server that still refuses gets the general `deleteError`.
- **New texts** (O11 and the owner answers):

  | Key | English | `tw` |
  |---|---|---|
  | `noLocations.title` | You have no locations in this household yet. | 你在這個家庭還沒有據點。 |
  | `noLocations.create` | Create a location | 建立據點 |

  Removed: `settings.locations.deleteLastError`.
- **Tests.** New: `routes/noLocations.cloud.test.tsx` (9: the empty screen and the dialog on
  Pantry, Shopping, a cart and Cooking, plus a one-location control), the
  `NoLocationsEmptyState` smoke test (1). Changed: `location.resolver.test.ts` (the
  last-location test now expects success; the lock test no longer spies on a count),
  `location-live-publish.resolver.test.ts` (one `LOCATION` event),
  `useActiveLocation.test.tsx` (the empty-list test inverted, plus a local control),
  `settings/household/locations/index.cloud.test.tsx` (delete the last location; an older
  server's `LAST_LOCATION` gets the general text), `graphqlErrorCode.test.ts` (its sample
  code is `CART_CHANGED` now). E2E: `settings/locations.spec.ts`'s last-location test is
  now `user can delete the last location and sees the empty pantry` (it also creates one
  from the empty screen), plus two cloud axe scans of the empty screen, light and dark.
- **Mutations, each copied aside and restored from the copy (`diff -q` clean):**

  | # | Mutation | Red |
  |---|---|---|
  | M1 | the count and `LAST_LOCATION` put back in `deleteLocation` (plan Step 5) | both server last-location tests |
  | M2 | `NoLocationsGate` never shows the empty screen (plan Step 5) | all 8 page tests |
  | M3 | the provider leaves an empty cloud list alone | `user whose cloud list comes back empty has the stale active location cleared…` |
  | M4 | the provider clears in local mode too | `user in local mode whose list is empty keeps the stored id…` |

  Guard, green either way by design: the one-location control in `noLocations.cloud.test.tsx`.
- **Gate** (Node 22.17.1): root `pnpm lint`, `pnpm build`, `build-storybook`, `pnpm check`
  and the `TS6385` grep clean. `pnpm test`: web **2900 / 302**, server **1816 / 70**,
  `scripts/spec` **70** (F.6 ended at 2875 / 298 and 1813 / 70; the F.6 review fixes and
  F.7 together added 25 web tests and 3 server tests).
- **E2E** (ports 4001, 5174-5176 free first). `local`: `settings/locations`,
  `location-switcher`, `shopping`, `cooking`, `shelves`, `vendors-group`, `recipes-group`,
  `location-not-stocked-here`, `unified-item-search`, `item-list-state-restore`,
  `item-management`, `item-stock-input`, `item-stock-pager`, `settings/vendors` and
  `a11y.spec.ts`: **142 passed, 10 skipped** (2.9m, load 15 at the start from other
  sessions, 3.4 at the end). `cloud`: the same files without `a11y`, plus `shared-cart`,
  `live-cart`, `live-pantry` and `cloud-roles`: **94 passed, 6 skipped, 1 failed** (19.1m,
  load 2.5 at the end). The new last-location test and both axe scans passed.
- **The one cloud failure, and what it showed.** `item-stock-input.spec.ts:369` (the decimal
  test) read `Expected "2.5" / Received "0"`. Its call log shows the Unpacked input
  `readonly` for 3 polls, then editable: the test typed while the form was still read only.
  Since F.6 the stock form is `readonly` until `usePermissions` knows the roles, and in cloud
  that waits for `GetHousehold` too. `test-results/` was copied aside before any re-run. Run
  alone at load 2.5 it passed (3 passed). So it is a timing race in the test, but it points at
  a real product gap (see *Known gaps*). `StockFormPage.navigateTo` now waits until the
  Packed field is editable; then `item-stock-input.spec.ts` gave 3 passed in `cloud` and 3
  in `local`. Of the three proofs for "not a code regression": it passed alone (yes); the
  error was the read-only state, not a wrong value (yes, from the call log); the failing set
  moving between runs was not measured, because the whole cloud set was not run twice.

## Task F.8 — two browsers, two people: E2E

**Files:**
- Create: `apps/web/src/lib/e2eUser.ts` and `e2eUser.test.ts`; `e2e/helpers/userContext.ts`;
  `e2e/tests/shared-household.spec.ts`
- Modify: `apps/web/src/main.tsx`, `apps/web/src/apollo/client.ts` (only if it reads the env
  value directly), `apps/web/src/components/settings/UserSettingsPanel/UserSettingsPanel.tsx:124`,
  `e2e/constants.ts:31–34`, `e2e/playwright.config.ts` (the `cloud` `testMatch`, the `local`
  `testIgnore`, and the comment at `:188–190`), `e2e/CLAUDE.md`

**Interfaces:**
- Produces (web): `getE2ETestUserId(): string | undefined` (T10).
- Produces (E2E): `newUserContext(browser: Browser, userId: string): Promise<BrowserContext>`
  — sets `baseURL: CLOUD_WEB_URL` and `storageState` with `data-mode: cloud`,
  `e2e-user-id: <userId>` and `e2e-skip-onboarding: true`, because `browser.newContext` does
  not inherit the project's `use` settings.

- [ ] **Step 1: Unit tests** for `getE2ETestUserId`: with the build flag unset it returns
  `undefined` even when the `localStorage` key is set (the production guard); with the flag set
  and no key it returns the flag; with both it returns the key.
- [ ] **Step 2:** implement and wire the four readers. Run the web suite.
- [ ] **Step 3: The spec** `shared-household.spec.ts`, cloud only. Owner O (its own context)
  sends one GraphQL request through `makeGql` and makes location K, then
  `addHouseholdMember` adds B as household `member`, `viewer` of K and `participant` of G,
  BEFORE B's context opens a page (the 409 rule). Clean up O and B in both hooks.
  1. `household member sees the catalog read-only` — B opens tags: no Add; O's browser shows
     Add (the same page, two people, two answers).
  2. `location viewer sees the cart but cannot check out` — O adds an item to K's cart in O's
     browser; B, active at K, sees the row appear without a reload (a live `CART` event between
     two people — the "two people on two devices" gap of H3c) and sees no Done button.
  3. `household owner sees a location a member created as No access` — B creates location
     "Shed" in B's browser (a household `member` may create a location, and becomes its only
     organizer, owner decision O4-A). O's switcher does not list "Shed"; O's settings list
     shows it with **No access** and **Delete** (Review Focus 5). O cannot then give
     themselves a role: `addHouseholdMember` refuses a person who already has a household
     (409). That step waits for H5c's `setLocationRole`; record it in *Known gaps*.
- [ ] **Step 4: Mutation checks** (each must turn a test red, report each): `canEditCatalog`
  always `true`; the shopping page ignores the viewer check; `householdLocations` returns
  `visibleLocations` for a manager.
- [ ] **Step 5:** run `pnpm test:e2e --project=cloud e2e/tests/shared-household.spec.ts
  e2e/tests/a11y.spec.ts` (a11y runs in `local`/`pwa`; run those projects for it too).
  **Copy `test-results/` aside before any re-run.** Update `e2e/CLAUDE.md` (the browser can now
  be any user; how; the 409 order still applies). **Gate**, commit
  `test(households): two people in two browsers`.

**As built (2026-11-17).** The unit tests were written first and shown red (the module did
not exist), then the code.

- **`getE2ETestUserId()`** (`apps/web/src/lib/e2eUser.ts`, decision T10). With no
  `VITE_E2E_TEST_USER_ID` it returns `undefined` BEFORE it reads `localStorage`. With the
  flag set, a non-empty `localStorage['e2e-user-id']` wins, else the build-time id. The key
  is `E2E_USER_ID_STORAGE_KEY`.
- **Readers: two, not four.** `main.tsx` reads it once and passes it to
  `createApolloClientForE2E` (the `x-e2e-user-id` header and the socket's `e2eUserId`) and
  to `LiveUpdatesRunner` (a prop). Neither of those two read the env value themselves, so
  neither changed. The Account card in `UserSettingsPanel` reads it, so each context shows
  its own id. The other readers of `VITE_E2E_TEST_USER_ID` (`__root.tsx`,
  `PostLoginMigrationDialog`, `DataModeCard`, `UserSettingsPanel`'s mode) only ask "is this
  the E2E build", which the override does not change.
- **The production guard, proved two ways.** (1) `e2eUser.test.ts` sets a key with the flag
  empty and expects `undefined`; with the guard removed it goes red. (2) A production
  `pnpm --filter web build` has no `"e2e-user-id"` string in any `dist/assets/*.js` (0
  files; the only match for the text is the old header name `x-e2e-user-id`). The same
  build with `VITE_E2E_TEST_USER_ID=probe` has it in 1 file, so the grep can find it.
- **E2E.** `e2e/helpers/userContext.ts` exports `newUserContext(browser, userId,
  extraLocalStorage?)`. The third argument was not in the plan: test 2 needs each person's
  active location (`active-location-id:cloud`). `e2e/tests/shared-household.spec.ts`, 3
  tests, cloud only (in `cloud`'s `testMatch` and `local`'s `testIgnore`). OWNER and MEMBER
  are `${E2E_SECOND_USER_ID}-shared-owner` / `-member`. MEMBER is `member`, `viewer` of
  Fridge, `participant` of Garage, no role on Home; OWNER has no role on Shed (test 3).
  Cleanup also deletes `E2E_USER_ID`'s rows: when the override was broken on purpose, both
  contexts became that user and wrote rows as it.
- **Mutations, each copied aside and restored from the copy (`diff -q` clean), each run in
  `cloud`:**

  | # | Mutation | Red |
  |---|---|---|
  | M1 | `permissionsFor` gives `canEditCatalog: true` (plan Step 4) | test 1: the read-only note not found |
  | M2 | the cart page shows Done without `canEditHere` (plan Step 4) | test 2: Done `toHaveCount(0)`, received 1 |
  | M3 | `householdLocations` returns `visibleLocations` for every role (plan Step 4) | test 3: the Shed row not found |
  | M4 | `getE2ETestUserId` ignores the key | all 3 tests |
  | M5 | `getE2ETestUserId` without its production guard (unit) | `ignores the localStorage key when the build flag is not set (production)` |
  | M6 | the Account card reads `import.meta.env.VITE_E2E_TEST_USER_ID` again (unit) | `user in E2E cloud mode acting as another person sees that person's id` |

- **E2E, 2026-11-17, ports 4001 and 5174–5176 free first, load 2.1–2.7.** `cloud`:
  `shared-household` plus every spec of a page Part 1 or F.8 touched (`settings/vendors`,
  `tags`, `recipes`, `shelves`, `locations`, `location-switcher`, `item-stock-input`,
  `item-stock-pager`, `item-logs`, `item-management`, `settings-global-pages`, `shopping`,
  `cooking`, `live-cart`, `live-pantry`, `cloud-roles`, `unified-item-search`,
  `location-not-stocked-here`): **107 passed, 7 skipped, 0 failed** (20.6m). `local`: the
  same files that run there, plus `a11y.spec.ts`: **159 passed, 11 skipped, 0 failed**
  (3.1m). F.9 runs the whole suite.

**Review of F.8 (`822b45bb..491dae25`), fixed in F.9.** No must-fix bug. Each new test was
shown red by a mutation, copied aside first and restored from the copy (`diff -q` clean):

| Finding | Fix | Mutation | Red |
|---|---|---|---|
| S1: no test of `useItems` while `GetLocations` loads | `useItems.cloud.test.tsx`: GetLocations waits 10 s; no GetItems request, `isLoading` true | `noLocations` = `(locations.length ?? 0) === 0` | yes (`isLoading` false; GetItems was sent) |
| S2: the deploy note said only the no-location `createVendor` fails on an old server | *Deploy notes* corrected: EVERY `createVendor` fails (`$locationId: ID` against `ID!`) | — | — |
| N1: `useCreateItem` with no location | `useItemStockWrites.cloud.test.tsx`: catalog only, no UpsertItemStock | delete the `if (locationId === undefined) return …` block | yes |
| N1: `useUpdateItem` resolves the location before the config write | same file: `NoCloudLocationError`, no UpdateItem | move the resolve after the config write | yes (`UpdateItem` 1) |
| N1: `useApplyUnitSwitch` with no location | same file: the switch and GetRecipes run, no PantryData | drop the `=== undefined` guard; and, separately, use `useRequiredCloudLocationId` | yes, both |
| N2: `useVendors.test.ts` could not tell "key omitted" from `locationId: undefined` | the test also checks `Object.keys(variables)` is `['name']` (the title was kept: it now proves what it says) | `variables: { name, locationId }` always | yes; the old `toHaveBeenCalledWith` line alone stays green |
| N3: a failed `GetLocations` with nothing cached leaves the Stock tab blank | recorded in *Known gaps* and `routes/CLAUDE.md`, not fixed | — | — |
| N4: the bundle grep must use the quoted key | `e2e/CLAUDE.md`. Measured on the F.9 production build: `"e2e-user-id"` 0 files, `e2e-user-id` 1 file | — | — |
| N5: a throw in `openAs` left its context open | `openAs` pushes the context into `contexts` before `newPage` | — | — |
| `createVendor(locationId: "")` | `catalog-household.resolver.test.ts`: `FORBIDDEN`, nothing written | `if (locationId)` instead of `!= null` | yes |

## Task F.9 — docs, deploy note and the final gate

**Files:** root `CLAUDE.md` (*Authorization (cloud)*: `myRole`, `hasOrganizer`,
`householdLocations`, the viewer cart read, H13 lifted, `usePermissions`; the E2E browser user
paragraph), `apps/web/src/hooks/CLAUDE.md`, `apps/web/src/routes/CLAUDE.md` (empty screens,
read-only views), `apps/web/src/routes/settings/household/locations/CLAUDE.md`,
the design (*Sequencing* H5 row, decision H13 now lifted, the D-table answers that the owner
approved), `docs/global/permissions/2026-10-31-households-plan.md` (H5 row and outline),
`docs/INDEX.md`, a deploy section (see *Deploy notes*), this plan's *What this plan got wrong*
and *Status*.

- [ ] **Step 1:** write the docs. Re-measure every count you write (test totals with
  `pnpm test`, E2E counts with `--list`); do not copy numbers from this plan.
- [ ] **Step 2:** the full gate, then `pnpm test:e2e:all`. Every failure is a hard stop. Copy
  `test-results/` aside before a re-run. Report load average and the three project results.
- [ ] **Step 3:** commit `docs(households): record H5a`. `git status` clean.

**As built (2026-11-17).** The review fixes of F.8 came first (see the table after F.8's
*As built*). Then the docs: root `CLAUDE.md` (*Authorization (cloud)*: an H5a table; the
E2E paragraph for `shared-household.spec.ts`; the cloud spec count; the test counts),
`hooks/CLAUDE.md` and `routes/CLAUDE.md` (one note each; the rest was written by F.3–F.7),
`e2e/CLAUDE.md` (the count table), the design (*Sequencing*, H13 lifted, *Known gaps*), the
phase plan (H5 row and outline), `docs/INDEX.md`, and section 8 of the H4 runbook (deploy).

**The gate, Node 22.17.1, on the finished tree:**

| Command | Result |
|---|---|
| `pnpm lint` | exit 0 (4 web warnings, 13 `e2e/` warnings, as before) |
| `pnpm build` | exit 0; no `TS6385` |
| `(cd apps/web && pnpm build-storybook)` | exit 0 |
| `pnpm check` | exit 0 |
| `pnpm test` | web **2922 / 305 files**, server **1820 / 70 files**, `scripts/spec` **70**; 0 failed |
| `pnpm test:e2e:all` | **all three passed**, no failure and no flaky test: `local` 178 passed / 11 skipped (3m33s), `cloud` 161 passed / 7 skipped (35m29s), `pwa` 73 passed (1m38s) |

Load average was 13.5 at one point before the E2E run (a browser on the same machine), 8.8
when it started and 7.4 when it ended. That is why `cloud` took 35 minutes; nothing failed,
so no re-run was needed. Collected with `--list`: `local` 189 in 23 files, `cloud` 168 in
34, `pwa` 73 in 2.

---

## H5b — invites, join, members (outline; detailed plan after H5a merges)

Needs owner decisions O2, O3, O6, O7, O9, O12.

- **Migration `add_household_invites`** (and, with O2-A, `User.activeHouseholdId` nullable,
  foreign key to `Household` with `onDelete: SetNull`). `HouseholdInvite` as the design's table,
  with `token` per O7. Add it to `MIGRATIONS` in `apps/server/scripts/verify-migration.ts`.
  **The migration runs only against the test database, and only with the owner's consent.** The
  agent prepares the command and stops; the owner runs it or says yes.
- **The "which household" rule** (O2, D1): `requireHousehold` reads
  `User.activeHouseholdId` when the person is still a member there, else the oldest
  membership by `joinedAt`, then `householdId`. `ensureHousehold`'s two `findFirst` reads get
  that same order. Tests with one person in two households, BEFORE any join code.
- **Mutations**, each in the live guard's `publishes` with `LOCATION` at household level
  (refetches every active query, which picks up roles and the member list):
  `createInvite(householdRole, locationRoles)`, `revokeInvite(id)`, `joinHousehold(token)`,
  `setHouseholdRole(userId, role)` (owner; member ↔ manager), `removeMember(userId)`,
  `leaveHousehold`, `createHousehold(name)` (O9-A). Queries: `invitePreview(token)` (signed in;
  household name, inviter name, roles; nothing else), `householdMembers`, `householdInvites`
  (owner and manager).
- **`joinHousehold` in one transaction**, `lockHousehold` first (T12): token valid, not used,
  not revoked, not expired; "already in this household" leaves the link unused (design);
  writes `HouseholdMember` and the `LocationMember` rows of locations that STILL exist in that
  household (an invite may name a location deleted since); sets `usedAt`, `usedBy`,
  `activeHouseholdId`; with O2-A deletes the person's own household when it is empty.
- **Removal and leaving delete the person's `LocationMember` rows of that household** (T11,
  D9). The owner cannot leave (design). A manager removes members only.
- **`requireCatalogRole(ctx, 'member')` now means something**: a person with no household gets
  `NO_HOUSEHOLD`. Add the no-household screen (O9) and a web handler for `NO_HOUSEHOLD`
  (none exists: `git grep NO_HOUSEHOLD apps/web/src` finds nothing).
- **Web:** `/join/$token` (O12; the sign-in page must return to the link, so `/sign-in` gets a
  `redirect` search param; the join page must NOT set `migration-strategy`, so
  `PostLoginMigrationDialog` stays closed), `/settings/household/members` (list, roles,
  invites, copy link per O7, revoke, remove, leave), the Members item in the household sidebar
  and the mobile accordion (P4). a11y scans for both pages.
- **`/e2e/cleanup`** must also delete invites; `purge-coverage.test.ts` and
  `cleanup-endpoint.spec.ts` gain the model. `e2eCleanup` deletes the user's memberships in
  other households already; check that a joined person's own (kept) household is deleted too.
- **Real-SQL tests owed:** the #381 test with one person in two households (H4 Known gaps); a
  full invite → join → member sees shared stock in two browsers (F.8 helper); expired, used and
  revoked links; a removed member's next request gets `NO_HOUSEHOLD` and their old location
  rows are gone; invite again and the old location roles do NOT come back (D9).
- **Deploy:** the migration deploys with the server. New web bundle selects new fields, so
  server first. No Clerk dashboard change is expected: the join link is on the same origin.
  Check that Clerk's sign-in accepts the return URL (`forceRedirectUrl` /
  `signInForceRedirectUrl`) for `/join/*` in the production instance; if Clerk needs an allowed
  redirect list, the runbook says so.

## H5c — the location people page (outline)

- Route `/settings/household/locations/$id` (P6). Name (organizer edits), people and their
  roles, **Add person** (choose from household members), change and remove roles, **Leave
  location**, **No organizer** warning. The danger zone's *Remove all items* stays in H6.
- Mutations `setLocationRole(locationId, userId, role)`, `removeLocationRole(locationId,
  userId)`, `leaveLocation(locationId)`, each publishing `LOCATION`. Rules (design): owner and
  manager give or remove any role on any location, themselves included; an organizer gives or
  removes `participant` and `viewer` only, and cannot touch another organizer; anyone leaves.
  The target must be a `HouseholdMember` of the location's household (H18), checked in SQL.
- Leaving or losing the role on the ACTIVE location: the web falls back to the first location
  (or the empty screen from F.7). Test it.
- E2E: an owner gives B a role on G in browser O, and B's switcher shows G without a reload.
  This closes the F.8 limit.

## Deploy notes

| Part | Migration | Order | Env / Clerk |
|---|---|---|---|
| H5a | none | **server before web** (new fields and query), the same rule as H4 | none |
| H5b | `add_household_invites` (+ `User.activeHouseholdId` with O2-A) | migration with the server, then the web | probably none; check Clerk's redirect rules for `/join/*` |
| H5c | none expected | server before web | none |

**H5a, two more notes (review of task F.7).**

- **`createVendor(locationId:)` is optional on the new server.** An old web bundle always
  sends it, so an old web on the new server works. **A new web bundle on an old server
  cannot create any vendor at all.** The new `vendors.graphql` declares the variable as
  `$locationId: ID` (nullable), and the old schema's argument is `locationId: ID!`. GraphQL
  validation compares the variable's TYPE, not its value, so the old server refuses EVERY
  `createVendor` from the new bundle, with or without a location:
  `Variable "$locationId" of type "ID" used in position expecting type "ID!"`. (This note
  said until the review of task F.8 that only the call with no location was refused. That
  was wrong.) That is one more reason for server before web: if the web is deployed first,
  nobody can add a vendor until the server is deployed.
- **The server-first window can leave an old web bundle on an empty household.** An old
  bundle on the new server can delete the household's last location, because the server no
  longer refuses it. That bundle has no `NoLocationsGate`, and its `ActiveLocationProvider`
  keeps the stale active id when the list is empty. So Pantry, Shopping and Cooking show a
  spinner that never ends, until someone adds a location (from the settings page, which
  still works) or the web is deployed. No data is lost. The window ends when the web
  deploys.

**H5a with H3a in one release: the server goes first, with a shim** (owner decision
2026-11-17, option 4; built the same day). Found in task F.9: neither order was safe. H3a
needed the web first, because `main`'s bundle selects `Location.isDefault`. H5a's bundle
selects `Location.myRole` in `GetLocations`, so with the web first the new bundle fails every
location query on `main`'s server.

Now the new server still accepts everything `main`'s old bundle sends, for ONE release:

| Shim field (`@deprecated`) | Value |
|---|---|
| `Location.isDefault` | `true` for the first location of the caller's `locations` list (by `order`, then `id`), else `false` |
| `CheckoutItemInput.itemId` (`cartItemId` becomes optional) | the row of that item is bought at its STORED amount; the old `quantity` (a stock total) is ignored |
| `ConsumeRecipesItemInput.packedQuantity`, `.unpackedQuantity`, `.quantity` | ignored; the old `delta` is already the amount used |

So the whole households release deploys **server first, then web**. The H4 runbook, section
8.3, has the full list of differences, the order, and the checks to run on an old device
between the two deploys. `apps/server/src/test/oldBundleCompat.test.ts` validates a copy of
`main`'s documents (`apps/server/src/test/fixtures/main-web-operations/`) against the schema.

The checkpoint release runs the H3a, H3b, H3c-1 and H4 runbooks, then an H5 section (now
section 8 of the H4 runbook). Rehearse
every new migration on a fresh Neon branch of production first, like H3a. The test database is
migrated by hand, by the owner or with the owner's consent.

---

## What the user gets / What the developer gets

See *Summary*. In one line each: the user gets nothing visible from H5a alone except the
deletable last location and its empty screen; with H5b and H5c, sharing works. The developer
gets one permission hook, real two-browser E2E, one fewer special rule (H13), and the H3a–H4
"owed to H5" list closed or named; the cost is about 30 role-checked components with tests,
and one test-only override in shipped code.

## Rules every task brief must pass down

- Plain English (short sentences, common words, main point first), in code comments, docs,
  commits and the report.
- The report shape from root `CLAUDE.md`, *Pull Requests and Agent Reports*, and an explicit
  section: **what this plan got wrong**.
- Node 22.17.1. The full gate after each task. Copy files aside before a mutation; never
  `git checkout --` to undo one.
- No database command. `verify-migration.ts` and any migration run only against the test
  database, and only with the owner's consent.
- Every role test has a second person with a different role and a location the caller has no
  role on (design, *Testing notes*).
- After each commit, `git show <sha> -- <file> | grep '<a line you added>'` (lint-staged can
  rewrite a staged file).

## Known gaps (expected after H5a)

- **Nobody can share a household in production after H5a alone.** Only E2E can, through
  `POST /e2e/household-members`.
- **F.8 cannot give a role to a person who already has a household** (the E2E route's 409
  rule). Tests that need a second role change wait for H5c's `setLocationRole`.
- **The read-only member rules are a first version** (design). `usePermissions` is the one
  place to change them.
- **`vendorCart` for a viewer returns a cart that is not saved.** If a participant creates it
  later, the viewer's cached cart has the same id, so nothing breaks; this is noted because a
  reader may expect every returned cart to exist.
- **The empty screen covers six routes** (F.7 and its review): Pantry, Shopping, a cart,
  Cooking, and the item page's Stock and log tabs. Before the review the Stock tab rendered
  nothing (`stock.tsx`, `if (!viewed) return null`) and the log tab showed a spinner forever
  (`useItemLogs` waits for a location). Both are now wrapped in `NoLocationsGate`. The item
  page's Info and relation tabs need no location and work as before.
- **In a household with no location, a cloud write that needs a location throws
  `NoCloudLocationError`** (review of F.7, `useRequiredCloudLocationId`) before anything is
  sent: stock, logs, cooking, add to or remove from a location. Before, they sent the
  `'local'` sentinel and got `FORBIDDEN`. Every page that offers them is behind
  `NoLocationsGate`, so no screen reaches them today; a page added later without the gate
  would get the thrown error instead of a `FORBIDDEN`. `createVendor` sends no location,
  `createItem` keeps the item in the catalog only, and `applyUnitSwitch` skips only its
  pantry refetch.
- **The settings Items tabs still offer Create while the catalog loads.** `hasExactMatch` is
  computed against `[]` for that moment. This is older than H5 and not specific to an empty
  household (the review of F.7 fixed only the empty-household case, where the catalog never
  loaded at all).
- **The Stock form is read only until `GetLocations` arrives** on a cold cache. Found in
  F.7's E2E run, caused by F.6. Until the review of F.7 the location rights waited for
  `GetHousehold` too; now `permissionsFor` has a separate `locationsLoading` flag, and
  `roleAt`, `canEditLocation` and `isOrganizerAt` read only that. The window is shorter but
  not gone, so `StockFormPage.navigateTo` still waits for an editable form.
- **A failed create from the empty screen shows no message** (F.7). `NoLocationsGate`
  copies the settings page's Add dialog, which has no `onError` either. Offline,
  `offlineWriteLink` shows its own toast.
- **The old-bundle shim fields must be removed in the release after households**, after every
  device has the households bundle: `Location.isDefault` (and its resolver in
  `location.resolver.ts`), `CheckoutItemInput.itemId` (make `cartItemId` `ID!` again; delete
  `checkoutInputShape` and `fromOldCheckoutInput` in `cart.resolver.ts`), and
  `ConsumeRecipesItemInput.packedQuantity`, `.unpackedQuantity` and `.quantity`. Delete
  `apps/server/src/test/fixtures/main-web-operations/` and
  `apps/server/src/test/oldBundleCompat.test.ts` with them. Until then, a new web document must
  not select them (that test fails if one does).
- **The shim is proved against the Prisma fakes and by GraphQL validation only.** No E2E test
  runs `main`'s old bundle against the new server. The checks on an old device in section 8.3
  of the H4 runbook are the real-world proof, and they are manual.
- **`Location.isDefault` costs one extra read per location in a list.** The role map is cached
  per request, but the "first location" read is not. Accepted for one release.
- **A removed member's open tab is not told.** Live events stop reaching them
  (`shouldDeliver` checks membership), so their screen is stale until their next request fails.
  H5b's `NO_HOUSEHOLD` handler covers the next request; nothing pushes it sooner.
- **The `tw` texts in O11 are set by the owner's answers; the owner can still correct them in the PR.**
- **The `role="button"` badges cannot be reached by keyboard.** On the item Tags, Vendors and
  Recipes tabs and on the shelf Filters tab, a badge has `role="button"` but no `tabIndex` and
  no key handler. This is older than H5; F.5 only added `aria-disabled` to them. Found in the
  review of F.5, not fixed there.
- **The Info tab's unit switch can fail for a household manager who is a viewer somewhere.**
  `applyUnitSwitch` asks `participant` on every location the item is stocked in. The page does
  not check that before Save, so the save fails with `FORBIDDEN`. Found in F.6, not fixed.
- **Owed to H6, must be fixed: a deleted organizer still counts for `Location.hasOrganizer`**
  (owner decision 2026-11-17). `countedOrganizerIn`, read by `locationIdsWithOrganizer` in
  `apps/server/src/lib/authz.ts`, checks only that the organizer is still a member of the
  household. It does not check `User.deletedAt`, the column that marks a deleted account. So
  a location whose only organizer deleted their account gets no "No organizer" warning. It
  may wait for a later phase, but it must be fixed; it is in the H6 section of
  `2026-10-31-households-plan.md`.
- **A viewer is not always told why the "not stocked here" rows have no action.** The rows
  have no button and no row note (follow-up to F.6, below). The pantry list and shelf view
  show `common.locationViewOnly` under the search row only when Create would have been
  offered, so not for an exact name. The vendor and recipe views show no note. The
  `LocationSwitcher` badge "View only" is on every page. Two more cases, found in the review
  of the follow-up:
  - A viewer who is a household `member` gets the catalog note `items.createReadOnly`
    ("Only a household owner or manager can create…") from `useCreateHere`. That note is
    about creating, not about this location.
  - When the pantry has nothing stocked here, the empty state used to show
    `common.locationViewOnly`. Now a search that finds items stocked elsewhere shows the
    tail instead, so that note is gone.
  The cart page is the only surface that always shows `common.locationViewOnly`.
- **Two viewer rules are pinned only below page level.** "No role at the active location →
  the read-only section is hidden" fails in one test only, the hook test
  `useItemSearchTailWiring.test.tsx` "person with no role". The shelf, vendor and recipe
  views have no viewer page test for the section. All five surfaces share the wiring hook,
  so the risk is low.
- **E2E drives a viewer through TWO pages only.** Since F.8, `shared-household.spec.ts`
  test 2 has a location viewer on a cart page (live row, disabled checkbox, no Done). Since
  the follow-up to F.6, test 3 has a viewer search the pantry (the "not stocked here" row,
  no Add). The rest of the viewer's pantry, cooking and the Stock tab are still proved by
  unit tests only.
- **When `GetLocations` fails with nothing cached, the item Stock tab shows nothing.**
  `NoLocationsGate` shows the empty screen only when the list has LOADED and is empty. A
  failed read is not "empty", so the gate lets the Stock tab through, and the tab renders
  nothing (`stock.tsx`, `if (!viewed) return null`): no error and no retry. This is older
  than H5; F.7's gate did not cause it and does not fix it. Found in the review of F.8
  (N3), not fixed: the right screen for "the location list could not be read" is a design
  question, and it touches every location page, not only this one.
- **`rolePermissions.ts` cannot tell `canEditCatalog` from `canManageLocations`.**
  `permissionsFor` gives both the same value (owner or manager), so no page test can catch a
  page that reads the wrong one of the two. If the rules ever differ, the helper needs a
  person for whom they differ. Found in the review of F.5.

## What this plan got wrong

Filled in from the task reports and reviews.

| Task | The plan said | What was true |
|---|---|---|
| F.1 | Add `myRole` to `GetLocations`; nothing about web fixtures | 15 web tests failed in 2 files (`cloudFetchPolicy.cloud.test.tsx` 13, `useLocations.test.tsx` 2). A cache write or `MockedProvider` result without a field the document selects reads back as incomplete. Seven fixture files now carry `myRole` |
| F.1 | `hasOrganizer` reads `locationMember.findMany({ where: { locationId: { in: ids }, … } })` | A field resolver does not know the other ids. One read per HOUSEHOLD (`location: { householdId }`), cached, gives the same answer |
| F.1 | `locationRolesByLocation(ctx, householdId)` cached on `ctx.requestCache.locationRoles` (one value) | The cache must be per household: a `Location` can be of a second household (`updateLocation`), and its role must be read there. Both caches are `Map`s keyed by household id |
| F.1 | Which household the field resolvers use was not said | The LOCATION's own, from the parent row. The caller's household gives `myRole: null` for a second household's location, and no test caught that until one was added |
| F.1 | The `hasOrganizer` test: remove O's membership, then check O's `myRole` on K too | After the removal O is in no household of K and `householdLocations` refuses O. The test lists as the manager; the H18 part of `myRole` is tested in `authz.test.ts` instead |
| F.1 | Use `householdFake` as it is | It did not model the `user` relation filter on `LocationMember`. Added, with three contract tests |
| F.1 | Step 4 refreshes `myRole` through the `LOCATION` live event, in OTHER tabs | Nothing covered the SAME request. The role caches lived for the whole request and no write cleared them, so `a: createLocation … b: createLocation …` gave `b` `myRole: null`. Fixed with `forgetLocationRoles` after the review |
| F.1 | Add `myRole` to `GetLocations`; no step for the mutations | `ReorderLocations`' result is written into `GetLocations` with `writeQuery`, and it did not select `myRole`, so the cached list read back as incomplete. `CreateLocation` and `UpdateLocation` lacked it too. Fixed after the review, with a selection test |
| F.1 | (nothing) | The `householdIdOf` fallback was reached by no test, and three comments still said "until H5". Fixed after the review |
| F.2 | The four reads get `{ householdId: await requireHousehold(ctx) }` | Right for the two reads. Wrong for the two writes: `addItemToLocation` and `checkout` act on a location of EITHER household, and the item is that location's household's (`requireLocationItems`). With the caller's household the copy-on-add finds no source and writes target 0. They use `householdOfLocation` |
| F.2 | `cartFake.state.carts` is unchanged (viewer test) | `cart.resolver.test.ts`, where `vendorCart` is tested, uses a `vi.fn()` recorder for `cart`, not `cartFake`. The test checks that `cart.create` is not called |
| F.2 | `cartItemCountByItem` "counts only A's carts" | It counts ROWS (`cartItem.count`), not amounts. The first draft of the test expected a sum of amounts and passed against the unfiltered code by chance (3 rows) |
| F.2 | (nothing about existing tests) | `cart.resolver.test.ts` had a block "a location viewer cannot use vendorCart" (2 tests) that T7 reverses; it is deleted. `location-live-publish.resolver.test.ts` expected an empty reorder list to pass; it is now `BAD_USER_INPUT` |
| F.2 | Step 1: write the `bulkUpsertLocations` test unless one exists | It existed, but did not check `householdId`. One assertion was added |
| F.1 review | `role-cache.guard.test.ts` "fails on a resolver field that writes a role row and does not call it" (this plan and root `CLAUDE.md`) | It read source text. A write through a helper and a call that was only a comment both passed it. Replaced by a wrapper around every `Mutation` field (review of F.2) |
| F.2 | The settings list sends every location (F.3) | True only after F.3. Between F.2 and F.3 an owner or manager with no role on a location cannot reorder in the web |
| F.3 | Consumes `usePermissions` "from F.4 — do F.4 first if the executor prefers" | Built in F.3 with T9's full shape and its hook tests. F.4 keeps the switcher badge only |
| F.3 | Test file `LocationList.test.tsx` | It does not exist; the component's tests live in `LocationList.stories.test.tsx`. The role tests went there and into the page's `index.cloud.test.tsx` |
| F.3 | "A No access row is not a link" | No row of this list was ever a link. Nothing to remove; a test checks there is still none |
| F.3 | (nothing about the reorder cache) | `useReorderLocations` wrote only into `GetLocations`. The answer holds only the caller's own locations, so the settings list (`GetHouseholdLocations`) would have stayed in the old order. The hook now reorders the cached settings rows by the ids it sent |
| F.3 | Local `useHouseholdLocations` returns `myRole: 'organizer'` | Kept, but the page passes `showRoles` only in cloud. Otherwise local mode would say "Organizer" on every row |
| F.3 | (nothing about the Add button) | Kept for everyone: the server asks household `member` to create a location |
| F.3 | The reorder test "sends every id of the list" | jsdom has no layout, so a keyboard drag never moves. The test stubs `getBoundingClientRect`. Without it, the test fails for a reason unrelated to the code |
| F.3 | (nothing) | Codegen types `ReorderLocations`' `orderedIds` variable as `string \| string[]` (list coercion). `tsc` caught `.flatMap` on it; the hook narrows it |
| F.3 review | (nothing about a refused reorder) | Since F.2 the server refuses a stale list, and the page showed nothing. `useReorderLocations` now reloads both lists and the page says why |
| F.3 review | (nothing about the first load) | The page showed "No locations yet" while `householdLocations` loaded. It now shows a spinner |
| F.3 review | (the reviewer) add `role="list"` on the `<ul>` if Biome allows | Biome refuses it (`noRedundantRoles`, an error here), and lint-staged's `--unsafe` would delete it. Not added |
| F.4 | Create `usePermissions.ts` and its test; consumes `useLocations` "with `myRole`" | Both existed since F.3. F.4 is the switcher only |
| F.4 | Modify the switcher, its stories and smoke test, and `hooks/CLAUDE.md` | Also: a new `LocationSwitcher.cloud.test.tsx` (the stories run in local mode, and a story cannot `vi.mock`), two new i18n keys (the accessible name had to say "view only" too), `components/CLAUDE.md`, and `e2e/helpers/axe.ts` |
| F.4 | (nothing about where the badge goes on the compact trigger) | The compact trigger is one letter in an icon-size button. It shows an `Eye` mark instead of the word, and both triggers say "view only" in their name |
| F.4 | (nothing about a11y) | `a11y.spec.ts` runs in `local` and `pwa` only, and roles exist only in cloud. The scans went into `location-switcher.spec.ts` (cloud). The first scan failed `color-contrast` on the transparent badge (an axe stack reading, 1.44:1) and `aria-hidden-focus` (Radix, every dropdown) |
| F.3 review | Show `reorderError` for every refusal except offline: "the reload is right whatever the reason" | Untrue for a network error or `FORBIDDEN`, and "has been reloaded" was too early even for `BAD_USER_INPUT`. Fixed in the F.4 review: the code decides the text and the reload |
| F.4 | Use `Badge` for the switcher's badge | `Badge` renders a `<div>`, invalid inside the trigger `<button>`. A `<span>` with `badgeVariants` |
| F.4 | The name "Switch location (current: {{name}}, view only)" | Fails WCAG 2.5.3: the visible "Home View only" was not in the name in order |
| F.4 review | (Review Focus) case 2's web side is in F.5 | T7 and F.6 Step 6 put it in F.6, and F.5 has no step for it. F.5 followed the task text; the Review Focus line now says F.6 |
| F.5 | Files: the list pages, `VendorCard`, `RecipeCard`, the detail pages, the item page, `ItemListToolbar`'s callers, cooking | Also catalog writes, and not listed: the pantry Add dialog's Create (`NewItemDialog`), the search tail's group action on five surfaces (one change in `useItemSearchTailWiring`), the three Info forms (`TagInfoForm`, `VendorInfoForm`, `RecipeInfoForm`, which had no read-only mode), `CookingControlBar` (it showed Create with no handler), the Filters tab's badges, and the item Tags tab's "New Tag Type" |
| F.5 | `ItemListToolbar`: hide Create when the caller passes no `onCreateFromSearch` | It already did. What it needed was `\| undefined` on the prop: `exactOptionalPropertyTypes` refuses `undefined` for an optional prop without it |
| F.5 | Hide controls; do not disable them, except form inputs | The Items-tab checkboxes, recipe amounts and the filter and relation badges SHOW what is assigned. They are disabled or `aria-disabled`, not hidden |
| F.5 | Tests in cloud mode with `useHousehold` mocked to `member` | Most pages read Dexie in local mode and many Apollo hooks in cloud. The page tests keep local data and set the role through the real rules (`permissionsFor`, `src/test/rolePermissions.ts`). Cloud is covered by the `MemberReadOnly` stories and `usePermissions.test.tsx` |
| F.5 | `MemberReadOnly` stories "through the existing Apollo stub pattern" | `noopApolloClient` cannot carry a role. The stories use `MockedProvider` (`src/test/cloudRoleStory.tsx`). Their tests needed a present-first anchor: while the role loads every write control is hidden for ANY role, so a story set to `owner` still passed. The new `ReadOnlyNote` is that anchor, and it must wait for `!isLoading` |
| F.5 | (nothing about empty states) | Vendors, recipes, shelves and cooking told a member to "Create your first …" with no button. A member now gets `settings.catalogReadOnly` there |
| F.5 | (nothing about existing tests) | 4 test files broke: two cloud tests stubbed `GetHousehold` to nothing (so the role was unknown and the form read only), and two page unit tests render with no `QueryClient`. A story test (`recipes/$id/items`) also failed in full-suite runs, on a row that moved between groups |
| F.5 review | (nothing about a failed `GetHousehold`) | `isLoading` is `false` when the query failed with nothing cached, so "not loading and not an editor" read as "member", and an owner was told the page is read only. `roleKnown` tells the two apart |
| F.5 review | (the reviewer) the Add Tag dialog loses its autofocus like `TagInfoForm` does | It does not: it never passes `readOnly`, and only an editor can open it. A test pins it |
| F.5 review | (nothing about a member whose search finds nothing) | Only the search tail said why Create was missing. The toolbar, the cooking search and the Add dialog now say it too, with two new texts |
| F.6 | Files: the four `ItemCard` callers, the cart page, cooking, the Stock tab | Also location writes, and not listed: the pantry Add button and the empty pantry's Create item (`NewItemDialog` stocks here), create-from-search on the pantry list, shelf view and cart page (it creates AND stocks here), the search tail's `Add to {location}` (`useItemSearchTailWiring`), the Stock tab's Add to location (`participant`), `ItemForm`'s stock section and `QuantityStepper` (no read-only mode; `ItemForm`'s own comment said the stock fields do not read `readOnly`), and `ActiveLocationProvider` (Step 6) |
| F.6 | Cart page: "no checkbox, no amounts"; Step 1: "the rows and amounts are shown" | The two lines disagree. The checkboxes and amounts are shown DISABLED, which is how a viewer sees what is in the cart and how much |
| F.6 | Cooking: "no checkbox" | Disabled, not hidden: the recipe checkbox carries the `aria-describedby` stock status, and hiding it would move the layout |
| F.6 | Step 6: call `cloudBootstrapCarts` only when `canEditLocation(activeLocationId)` | `canEditLocation` is `false` for every location while the HOUSEHOLD role loads, so bootstrap would wait for `GetHousehold`. The provider reads `myRole` from the list it already holds |
| F.6 | Step 1: tests in cloud mode | The page tests keep local data and set the role through `permissionsFor` (the F.5 pattern, `asLocationRole`). Only the bootstrap test runs in cloud, through `MockedProvider` |
| F.6 | (nothing about the search tail's lower section) | `ItemSearchTail` shows "not stocked here" only with its action (`hasVisibleTail`). With no Add to location, a viewer's search does not list items stocked elsewhere at all |
| F.6 follow-up | (the brief) follow the read-only pattern, e.g. `ReadOnlyNote` | The F.5 member pattern puts a note in place of the action on each row. For a viewer that would repeat one text on every row, and the owner asked only for "no add buttons". The rows have no note; the gap is in *Known gaps* |
| F.6 | (nothing about existing tests) | `stock.test.tsx`'s own graphql factory had no `useGetHouseholdQuery` (31 tests failed), and `stock.stories.test.tsx`'s fixture locations had no `myRole` |
| F.6 review | (nothing about `createVendor`) | `createVendor` asked location role `participant` for the cart it pre-creates, so a household manager who is a viewer of the active location could not create a vendor at all (Review Focus case 4), and `NewVendorDialog` and the item Vendors tab showed nothing. It now asks `viewer` and writes the cart only for `participant` or higher |
| F.6 | "The ref is set only when the call is made, so a role that rises later bootstraps then" | True, but with the switches A (participant), B (viewer), A the ref stayed at A, so A was not bootstrapped again. And the "role rises" rule had no test. A viewer location now moves the ref to a marker; both cases are tested |
| F.7 | Files: `lib/graphqlErrorCode.ts` holds a `LAST_LOCATION` entry and a message key | It held only an example in a comment. The mapping and the `deleteLastError` key were in `routes/settings/household/locations/index.tsx` and the two locale files |
| F.7 | Step 6: add the empty screen to `a11y.spec.ts`, light and dark | `a11y.spec.ts` runs in `local` and `pwa`, where the location list is never empty. The two scans went into `settings/locations.spec.ts`, in cloud (the F.4 pattern) |
| F.7 | Pantry, Shopping and Cooking show the empty screen | The cart page (`/shopping/$vendorId`) waited forever too. It is wrapped as well |
| F.7 | Change the files `routes/index.tsx`, `routes/shopping/index.tsx`, `routes/cooking.tsx` | Each route got a small wrapper component (`NoLocationsGate`), not a branch inside the page: inside the page every hook would still run for a location that does not exist. The gate is a component of its own, not part of `NoLocationsEmptyState`, so the empty state keeps a plain story |
| F.7 | Files: `hooks/useLocations.test.tsx` gets the provider test | The provider tests live in `hooks/useActiveLocation.test.tsx`; `useLocations.test.tsx` only had a stale comment |
| F.7 | (nothing about other mentions of `LAST_LOCATION`) | Also stale: `packages/types/src/index.ts`, `lib/household.ts` (`lockHousehold`'s reason), the `clearAllData` comment, `LocationList.stories.tsx`, `routes/settings/CLAUDE.md`, `locations/CLAUDE.md` |
| F.7 | The `deleteHomeIfUnused` comment changes | Its check ("the import created at least one location") is kept on purpose, now for a new reason: a `clear` import of a backup with no locations must not leave the household with none |
| F.7 review | (nothing about cloud writes in an empty household) | `useCloudLocationId` fell back to the `'local'` sentinel, so every cloud write sent it. An owner creating a vendor got `FORBIDDEN` and was told only an owner or manager may add one. `createVendor(locationId:)` is optional now, and the hook never returns the sentinel (`useRequiredCloudLocationId` throws `NoCloudLocationError` for the writes that need a location) |
| F.7 review | (nothing about the catalog in an empty household) | `useItems()` in cloud reads `PantryData`, which needs a `locationId`, so the four settings Items tabs showed no items and offered Create for an item that existed. `useItems()` now reads `GetItems` when the list is loaded and empty |
| F.7 review | The empty screen on Pantry, Shopping, a cart and Cooking | The item Stock tab rendered nothing and the log tab spun forever. Both are gated too |
| T9 | "Cloud while loading: every `can…` is `false`" | Right for the household rights, wrong for the location rights: a location role does not need `GetHousehold`, and waiting for it made the Stock form read only on a cold cache (the F.7 E2E race). `permissionsFor` has a separate `locationsLoading` flag now |
| F.7 review | (the F.7 server test) "a location of another household is refused" proves `requireLocationInHousehold` | It was refused earlier, by `requireLocationRole`: the caller had no role there. The test now gives the caller a role in the second household |
| F.8 | Modify `apollo/client.ts` "only if it reads the env value directly", and T10 names `LiveUpdatesRunner` as a reader | Neither reads it. `main.tsx` passes the id to both. Only `main.tsx` and the Account card changed |
| F.8 | `newUserContext(browser, userId)` | A third argument for extra `localStorage`, for the active location of each person |
| F.8 | Test 2: B "sees no Done button" | Done shows only when the cart has rows, so the absence alone proves little. The test checks OWNER's Done is visible first, after the row is added |
| F.8 | Clean up O and B in both hooks | Also `E2E_USER_ID`: if the override breaks, every context writes as that user, and the next spec sees the rows |
| F.8 | Step 5: run `a11y.spec.ts` for the new spec | `a11y.spec.ts` runs in `local` and `pwa`, where there are no users. The spec adds no page, so it adds no scan |
| Relations, Deploy notes | "H5a adds no new conflict with the H3a rule (web before server)" | It does. `GetLocations` selects `myRole`, so the new bundle on `main`'s server fails every location query. With H3a in the same release, neither order is safe. Found in F.9; options in the H4 runbook, section 8.3; the owner decides |
| Deploy notes (review of F.7) | An old server refuses only the `createVendor` call with no location | The variable's TYPE is checked, not its value: every `createVendor` from the new bundle fails on an old server. Corrected in the review of F.8 |
| F.9 | Files: "a deploy section" | No new runbook file: section 8 of the H4 runbook, like H3c-2's section 9 in the H3c-1 runbook |
| F.9 | Files: `hooks/CLAUDE.md`, `routes/CLAUDE.md`, `locations/CLAUDE.md` | Already written by F.3–F.7 and their reviews. F.9 added only the N3 note to `routes/CLAUDE.md` |
| Deploy shim (after F.9) | (brief) "the new server still ACCEPTS every field the old `main` bundle selects" | Selected fields were not the only break. Two INPUT types changed shape in H3b (`CheckoutItemInput`, `ConsumeRecipesItemInput`), and document validation cannot see that: the documents only declare `[CheckoutItemInput!]!`, and the variables fail later, at coercion. `findBreakingChanges` between the two schemas found them. Both are shimmed too |
| Deploy shim (after F.9) | (H3a runbook) the old bundle's default location is the `isDefault` row | The column is gone. The shim gives `true` to the first location of the CALLER's list, not the household's first: a person with no role on the household's first location would otherwise have no default |

## Status

**Plan written 2026-11-17** on `feature/households-h5`. Owner decisions O1–O12 answered
2026-11-17 (see *Owner answers*). H5a task F.1 is done (`a59cfcb8`), with review fixes. Task F.2 is done, with review fixes. Task F.3 is done (`5b88bee7`), and it built
`usePermissions`, with review fixes. Task F.4 (the View only badge) is done (`e5669669`).
Task F.4's review fixes are done (`0a6321a2`, `4cab8303`, `fe085176`). Task F.5 (a household
member sees the catalog read-only) is done, with review fixes. Task F.6 (a location viewer
sees the location read-only) is done, with review fixes. Task F.7 (a household can have no
locations) is done. Its `verify-migration.ts` rewrite was run on 2026-11-17 against the TEST
database, with the owner's consent: exit 0, 186 `ok —` lines, 0 `FAIL:` lines. The three
household-lock lines for two concurrent `deleteLocation` calls all passed: the second call
WAITED for the lock, then saw 0 locations (no location left is allowed since F.7). Its review
fixes are done. Task F.8 (two people in two browsers) is done. Its review fixes and task
F.9 (docs, deploy note, the final gate) are done. **H5a is built and waits for its PR. It is
not merged and not deployed.** How to deploy H5a together with H3a is decided (owner,
2026-11-17, option 4): the server keeps the fields `main`'s old bundle needs for one release,
and the server goes first (H4 runbook, section 8.3). The shim is built. H5b is next, with
its own detailed plan.
