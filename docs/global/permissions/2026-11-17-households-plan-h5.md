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
   made for a viewer, and no unhandled error. (Task F.2 server side, F.5 web side.)
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
  deploys before the web**, the same rule as H4 (H4 decision T9). H5a adds no new conflict
  with the H3a rule (web before server); the H4 runbook already explains how both fit in one
  release.

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

- [ ] **Step 1: Write the failing tests.**
  - `location viewer can open a vendor cart that does not exist yet, and no cart is written` → viewer V at K; `vendorCart(vendorId: v1, locationId: K)` returns `{ id: 'K:v1', lastPurchasedAt: null }`; `cartFake.state.carts` is unchanged.
  - `location participant still gets the missing cart created` → the row exists after the call.
  - `a person with no role on the location cannot open its vendor cart` → `FORBIDDEN`.
  - In `two-households-reads.resolver.test.ts`: user U is in households A and B, with a role in both; the target pinned through `ctx.requestCache.householdId = A`. Stock of item `iA` at a location of B is put straight into the fake state (it cannot be made through the API — that is the invariant this guards). `cartItemCountByItem(itemId: iA)` with no `locationId` counts only A's carts; `itemStocksForItem(iA)` returns only A's rows; `addItemToLocation` with no `sourceLocationId` copies settings only from A; `checkout`'s copy-on-add reads only A.
  - `reorderLocations refuses a list that leaves out a location of the household` → `BAD_USER_INPUT`, no `order` changed.
  - The H3a owed test: `bulkUpsertLocations does not move a location of another household` — first `git grep -n "another household" apps/server/src/resolvers/import-role-gate.resolver.test.ts`; if a test already asserts that an existing location of household B, named in an import into A, is refused and keeps `householdId: B`, name it in the commit message and write nothing new.
- [ ] **Step 2: Run** the four files — the new tests FAIL.
- [ ] **Step 3: Implement** T5, T6 and T7. In `vendorCart`, call
  `requireLocationRole(ctx, locationId, 'viewer')`, keep its returned `role`, and create only
  when `LOCATION_RANK[role] >= LOCATION_RANK.participant` (export the rank check as
  `roleAtLeast(role, min)` from `authz.ts` rather than reading the rank map at the call site).
  Update the comment in `cart.graphql` above `vendorCart`.
- [ ] **Step 4: Run** the files and `pnpm test:server` — PASS.
- [ ] **Step 5: Mutation checks:** remove `householdId` from each of the four reads, one at a
  time → each two-household test goes red; make `vendorCart` create for every role → the
  viewer test goes red on "no cart is written"; allow a subset in `reorderLocations` → red.
- [ ] **Step 6: Gate**, commit `fix(households): viewer cart reads and one-household reads`.

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

- [ ] **Step 1: Write the failing tests** (cloud, mocked hooks):
  - `household manager sees a location they have no role on, marked No access` → row "Garage" shows "No access", has no link into its data, has Delete.
  - `household manager sees No organizer on a location without one`.
  - `household member does not see Delete or drag handles` and `sees their role on each row` ("Participant").
  - `location organizer who is a household member can rename that location and not the others`.
  - `user sees the role on each row` for an owner: "Organizer".
  - The reorder sends every id of the list, including the No access one.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Rows show name, the role label, and the two marks (texts from
  O11). Delete and drag only when `canManageLocations`; rename only when `isOrganizerAt(id)`.
  A No access row is not a link. Remove the H3a `LAST_LOCATION` handling only in F.7, not here.
  Stories: add `ManagerWithNoAccessRow`, `MemberReadOnly`, `NoOrganizer`, each rendering the
  real `LocationList`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Mutation checks:** show Delete for every role → the member test goes red;
  build the list from `useLocations` instead of `useHouseholdLocations` → the No access test
  goes red.
- [ ] **Step 6: Gate**, commit `feat(households): locations list shows every location to managers`.

## Task F.4 — web: `usePermissions` and the View only badge

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

- [ ] **Step 1: Write the failing tests:** local mode → all `true`, `roleAt('x')` is
  `'organizer'`; cloud loading → all `false`; cloud manager + viewer at K →
  `canEditCatalog` true, `canEditLocation('K')` false (Review Focus 4); member + participant at
  G → `canEditCatalog` false, `canEditLocation('G')` true; an id not in the list → `null` and
  `false`. Switcher: `location viewer sees View only next to that location` (button and
  dropdown both); an organizer's row has no badge.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Mutation checks:** return `true` while loading → the loading test goes red;
  make `canEditLocation` read the household role → the Review Focus 4 test goes red.
- [ ] **Step 6: Gate**, commit `feat(households): usePermissions and the View only badge`.

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

- [ ] **Step 1: Write the failing tests**, one per page group, cloud mode, `useHousehold`
  mocked to `member`, and one control per page in the `manager` state (so the test can fail
  both ways): `household member sees tags without add, edit or delete`, the same for shelves
  (no drag handle either), vendors, recipes; `household member sees item details read only`
  (inputs `disabled` or `readOnly`, no Save, no Delete) `and can still edit stock where they
  are a participant` (the Stock tab); `household member does not see Create item in search`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** with `usePermissions().canEditCatalog`.
  Hide controls; do not disable them, except form inputs, which are `readOnly` so the text can
  still be selected. **Step 4: Run** — PASS.
- [ ] **Step 5: Mutation checks:** on three pages chosen from different groups (one list,
  one detail, the item form), invert the condition → each page's test goes red. Report which
  three.
- [ ] **Step 6:** stories: add one `MemberReadOnly` story per list page that renders the real
  page with the role mocked through the existing Apollo stub pattern (root `CLAUDE.md`,
  *Apollo context in route stories*). **Gate**, commit
  `feat(households): read-only catalog for household members`.

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

- [ ] **Step 1: Write the failing tests** (cloud, active location K, `myRole: 'viewer'`, plus
  one `participant` case per page): `location viewer sees the pantry without quick update`,
  `location viewer sees the cart but cannot check out` (the rows and amounts are shown),
  `location viewer cannot cook`, `location participant does not see Remove from location`,
  `location organizer sees Remove from location`, `user sees a message when removing from a
  location is refused` (mock `FORBIDDEN`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** with `canEditLocation(activeLocationId)`
  and `isOrganizerAt`. **Step 4: Run** — PASS.
- [ ] **Step 5: Mutation checks:** invert the viewer check on the shopping page and on the
  pantry list → red; show Remove to `participant` → red.
- [ ] **Step 6:** web side of T7: `ActiveLocationProvider` calls `cloudBootstrapCarts` only
  when `canEditLocation(activeLocationId)`. Test: `location viewer switching to a location sends
  no bootstrapCarts`. Mutation: remove the condition → red. **Gate**, commit
  `feat(households): read-only location views for viewers`.

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

The checkpoint release runs the H3a, H3b, H3c-1 and H4 runbooks, then an H5 section. Rehearse
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
- **`assertHouseholdLock` is rewritten but not run** until the owner runs `verify-migration.ts`
  against the test database.
- **A removed member's open tab is not told.** Live events stop reaching them
  (`shouldDeliver` checks membership), so their screen is stale until their next request fails.
  H5b's `NO_HOUSEHOLD` handler covers the next request; nothing pushes it sooner.
- **The `tw` texts in O11 are set by the owner's answers; the owner can still correct them in the PR.**

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

## Status

**Plan written 2026-11-17** on `feature/households-h5`. Owner decisions O1–O12 answered
2026-11-17 (see *Owner answers*). H5a task F.1 is done (`a59cfcb8`). Task F.2 is next.
