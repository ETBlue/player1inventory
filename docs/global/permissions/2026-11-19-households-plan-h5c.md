# Households H5c (the location people page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an owner, a manager or a location's organizer can see who has a role on a
location, give a role to a household member, change it and take it away. Anyone can leave a
location. A location with no organizer says so. A member who joined with no location role
can be given one.

**Architecture:** no migration. One new query (`locationPeople`), one new field
(`HouseholdPerson.hasLocationRole`) and three new mutations (`setLocationRole`,
`removeLocationRole`, `leaveLocation`) in `location.resolver.ts`. Each mutation takes the
household lock first and reads every role through the transaction, like H5b's member writes.
The rule "who may give which role" is ONE pure function in `@p1i/types`, used by the server
check and by the web to hide buttons. Each mutation publishes household-level `LOCATION`, so
every open tab of the household refetches. The web gets a new page,
`/settings/household/locations/$id`, cloud only, and the locations list links to it.

**Tech Stack:** React 19, TanStack Router and Query, Apollo 4, Dexie (web); Express 5, Apollo
Server 4, Prisma 6, Postgres on Neon (server); Vitest, Playwright, Biome.

**Spec:** [2026-10-04-households-design.md](2026-10-04-households-design.md), sections
*Location roles* (the table and *Rules that cross the two levels*), *Authorization*,
*Flows › Location roles*, *Household roles, removal and leaving*, *Screens › Location pages*,
*Location switcher*, *Testing notes*. Decision H18 is in
[2026-11-04-households-plan-h3a.md](2026-11-04-households-plan-h3a.md). H5 plan:
[2026-11-17-households-plan-h5.md](2026-11-17-households-plan-h5.md), section *H5c — the
location people page (outline)*, owner answers O1–O12, *Deploy notes*, *Known gaps*, *What
this plan got wrong*. H5b plan:
[2026-11-18-households-plan-h5b.md](2026-11-18-households-plan-h5b.md), owner answers
O13–O22, *Known gaps*, *What this plan got wrong*. Phase plan:
[2026-10-31-households-plan.md](2026-10-31-households-plan.md), *H5*, decision P6.

Branch `feature/households-h5c`, worktree `.worktrees/feature-households`, from `develop` at
`712f76f6` (after #390). The PR goes into `develop`. Nothing deploys until the checkpoint
release that ships H3a–H5c together.

**Names in this file.** Tasks are `H.n` (H5a used `F.n`, H5b `G.n`). Technical decisions
continue from H5b: `T32…`. Owner decisions continue from H5b: `O23…`. Disagreements with the
code are `X1…` (H5 used `D…`, H5b `E…`). Outside this file, write "H5c decision T32".

---

## Global Constraints

Every task brief passes these down (see also *Rules every task brief must pass down*).

- Local mode has no roles and no people. The new page is cloud only. Nothing in
  `apps/web/src/db/` changes.
- Never write `row.userId === ctx.userId` or `row.householdId === …` as an authorization
  check. Every server check goes through `apps/server/src/lib/authz.ts`. Marking the
  caller's own row (`isMe`) is not a check.
- Household ladder `member < manager < owner`; location ladder `viewer < participant <
  organizer`. A household role gives NO location data (design, *Rules that cross the two
  levels*). The people page shows names and roles, never stock, carts or logs.
- **A location role counts only while the person is a member of the location's household
  (decision H18).** Every new read of `LocationMember` uses the existing builders in
  `lib/authz.ts` or the same `user: { householdMemberships: { some: { householdId } } }`
  shape. Never a plain `findMany({ where: { locationId } })`.
- Every new `Mutation` field goes into `publishes` in
  `apps/server/src/resolvers/live-publish.guard.test.ts`. Today: **69** fields, all in
  `publishes`. This plan adds **3** (72).
- **Do not break the old-bundle shim.** `apps/server/src/test/oldBundleCompat.test.ts` must
  stay green. This plan only ADDS a type, a field, a query and three mutations. Do not change
  or remove an existing field, argument or input field.
- A server schema change and the web documents that use it: this plan adds fields only, so a
  new web document may come in a later task than its schema. If a task must change an
  existing type, it goes in ONE commit with every document that uses it (root `CLAUDE.md`,
  *`pnpm codegen` is all-or-nothing*).
- Node 22.17.1 (`.node-version`). Node 25 breaks the web suite.
- No database command in a subagent. This plan has no migration, so no task needs one.
- Feature test titles start with `user can …` / `user sees …`. Role tests that really set up a
  role use the role name (`location organizer cannot …`).
- Location and person names render as stored, never `capitalize`.
- `tw` texts use the app's existing words: 家庭, 據點, 擁有者, 管理者, 成員 and the location
  roles **據點王** (organizer), **搬運工** (participant), **圍觀的** (viewer). Those three are
  the owner's O11 answer and are what `roles.location.*` in `tw.json` holds.
- Plain English in every comment, doc, commit and report.

## Review Focus

The cases most likely to hurt a real person first. Each has its test in the task named.

1. **An organizer tries to make someone an organizer, or to remove another organizer.** The
   server refuses with `FORBIDDEN`, and the page shows no control for it. (H.1 rule table,
   H.3 resolver tests, H.5 page tests, H.8 E2E.)
2. **B loses the role on the location B is looking at.** An owner removes B (or B leaves in
   another tab). B's tab switches to B's first other location, or to the empty screen, with
   no reload, no error and no rows of the old location left on screen. (H.7 unit tests, H.8
   E2E in two browsers.)
3. **Someone gives B a location role at the same moment as B is removed from the household.**
   No `LocationMember` row may be left behind. Both writes take the household lock, so one
   waits for the other, and the role write then sees that B is not a member and refuses.
   (H.3 order tests.)
4. **An owner with No access on a location opens its page.** They see the people and can give
   themselves a role. Before that, no stock, cart or log of that location reaches them. (H.2,
   H.5, H.8.)
5. **The only organizer leaves.** The location keeps working. Everyone who sees it reads "No
   organizer", and an owner or manager can give the role to someone. (H.3, H.5, H.8.)

---

## Summary

### Where this sits

| Phase | State |
|---|---|
| H1, H2 | ✅ merged into `main`, deployed |
| H3a, H3b, H3c-1, H3c-2, H4 | ✅ merged into `develop`, not deployed |
| H5a | ✅ merged into `develop` (#384), not deployed |
| H5b | ✅ merged into `develop` (#385, merge `938fa2aa`), not deployed; follow-ups #386–#390 merged |
| **H5c** | this plan: the location people page |
| H6 | transfer, hand-over, purges, activity log |
| H7 | personal location order, household switch and create from "Switch to…" |

After H5b people can join a household, but their location roles are fixed at the moment they
join. To change one, an owner must remove the person and invite them again. A person who
joined with no location role (owner decision O14-A) sees "You have no locations in this
household yet" and nobody can change that. H5c is the last part of H5. With it, sharing works
from start to end.

### Relations

- **Blocked by:** nothing. H5b is merged.
- **Blocks:** the checkpoint release (H5 decision T13: H5a, H5b and H5c ship together). H6's
  activity log will record the role changes this plan adds (owner decision O29).
- **Ships with:** H3a–H5b at the next checkpoint release.
- **Deploy order:** no migration. The new web bundle selects a new query and a new field, so
  the **server deploys before the web**, the rule for the whole households release (H4
  runbook, section 8.3).

### What the user gets (once merged AND deployed)

- On **Settings › Locations**, a location's name opens its own page (for the people owner
  decision O24 names).
- The page shows the location's name, every person with a role there, and each role.
- An owner or manager gives any household member any role on any location (themselves too),
  changes it and removes it.
- An organizer gives, changes and removes **搬運工** (participant) and **圍觀的** (viewer). They
  cannot make an organizer or touch another organizer.
- Anyone with a role presses **Leave location**. The only organizer is warned first (O25).
- A location with no organizer shows **No organizer** on the list and on its page.
- On the Members page, an owner or manager sees **No location roles** next to a person who has
  none, with a link to the locations (O28).
- When a person loses their role on the location they are using, their screen moves to
  another location (or to the empty screen) by itself, in every open tab (O27).

What H5c does NOT give: a log of who changed which role (H6, O29), **Remove all items** in a
danger zone (H6), a personal location order (H7).

### What the developer gets

| DX gain | Specifics |
|---|---|
| Fewer ways to get it wrong | One pure function, `canChangeLocationRole` in `packages/types`, decides who may give which role. The server check and the web's buttons both call it, so the two cannot drift. Today the location ladder already has two copies (`LOCATION_RANK` in `apps/server/src/lib/authz.ts` and in `apps/web/src/lib/locationRole.ts`); H.1 makes the new rule a third user of one shared copy instead of a fourth copy |
| Fewer ways to get it wrong | One lock order for every write that changes who belongs where: the household row first (`lockHouseholdOrForbid`, moved from `household.resolver.ts` to `lib/household.ts`) |
| Real-SQL coverage | The first E2E where a location role changes after a join, seen live in a second browser. Closes the H5a F.8 limit ("cannot give a role to a person who already has a household") |
| Less to remember | "Remove and invite again" stops being the only way to change a location role |
| Honest documentation | The locations `CLAUDE.md` line "Rows are not links" and the H5b known gap "location roles cannot be changed after they join" are closed and rewritten |

**Costs, stated plainly:**

- Three more mutations in the live guard (72), each a household-level `LOCATION`, which
  refetches every active query in every open tab of the household. Role changes are rare.
- One more page with its own stories, tests and two axe scans.
- `pnpm test:e2e:all` grows by one cloud spec file.
- The role rule moves into `packages/types`, so a server change to it is also a web change.
  That is the point, but it means the server build must bundle `@p1i/types` (it already
  does since `chore/build-shared-types`).

---

## Facts this plan is built on (checked 2026-11-19 at `712f76f6`)

Line numbers drift. Each task re-reads the code before it trusts a line here.

| Fact | Where |
|---|---|
| `model LocationMember { locationId, userId, role, createdAt }`, primary key `(locationId, userId)`, `location` relation `onDelete: Cascade`, `user` relation with no `onDelete` (Restrict). No `updatedAt` | `apps/server/prisma/schema.prisma:438–449` |
| `Location` has `members LocationMember[]`; `LocationRole` enum `organizer participant viewer` | `schema.prisma:263–281`, `:372–376` |
| A cart has no `userId` since H3b; it belongs to its location. `CartItem.userId` is only "added by", never a scope. `InventoryLog` keeps its author's `userId` | `schema.prisma:156–211` |
| `requireLocationRole(ctx, locationId, role)` reads through the GLOBAL `prisma`. It has no `db` argument. `requireHouseholdRole` has one (since H5b task G.5) | `apps/server/src/lib/authz.ts:58–75`, `:112–133` |
| `countedLocationRole(userId)` is the private H18 builder for the CALLER; `countedOrganizerIn(householdId)` is the H18 builder for each organizer row's own person | `authz.ts:89–94`, `:282–288` |
| `locationRolesByLocation`, `locationIdsWithOrganizer` cache per household per request; `forgetLocationRoles` clears them, and `forgetRolesAroundEach` calls it around every root `Mutation` field | `authz.ts:203–310`; `lib/mutationRoleCache.ts` |
| `Location.myRole` and `Location.hasOrganizer` exist (H5a F.1). `hasOrganizer` counts an organizer who is still a household member; it does NOT check `User.deletedAt` (owed to H6) | `apps/server/src/schema/location.graphql`; `resolvers/location.resolver.ts:167–180` |
| `householdLocations` gives an owner or manager every location of the household, a `member` the switcher's list | `location.resolver.ts:148–160` |
| No query lists the people of one location. No mutation writes a `LocationMember` row except `createLocation` (creator as organizer), `createHouseholdFor` and `joinHousehold` | `git grep -n "locationMember.create" apps/server/src` |
| `updateLocation` asks `organizer` on the location and acts on the LOCATION's household; `deleteLocation` and `reorderLocations` use the CALLER's household (`requireHousehold`) and take `lockHousehold` first | `location.resolver.ts:247–352` |
| `lockOrForbid(tx, householdId)` (wraps `lockHouseholds`, gives `FORBIDDEN` when the household is gone) is PRIVATE to `household.resolver.ts`; `setHouseholdRole`, `removeMember` and `leaveHousehold` call it first | `apps/server/src/resolvers/household.resolver.ts:89–95` |
| `removeFromHousehold` deletes the person's `LocationMember` rows of that household, revokes their open invites and deletes the member row, under the household lock | `household.resolver.ts:122–134` |
| `householdMembers` returns `HouseholdPerson { userId displayName role joinedAt isMe }` to every household role; names only, no e-mail | `apps/server/src/schema/household.graphql`; `household.resolver.ts:60–78` |
| `publishHouseholdChange(ctx, ['LOCATION'], householdId)` sends a household-level event. `shouldDeliver` gives it to every MEMBER of that household, except the tab that made the change (`sourceClientId`) | `lib/publishChange.ts:109–127`; `resolvers/live.resolver.ts` |
| The live guard lists **69** `Mutation` fields in `publishes`, 0 in `publishesNothing` | `resolvers/live-publish.guard.test.ts` |
| On the web, `LOCATION` refetches every active query (`'all'`); `GetLocations`, `GetHouseholdLocations` and `HouseholdMembers` are in its table | `apps/web/src/apollo/liveUpdates.ts:40–96` |
| `ActiveLocationProvider` already falls back when the active id is not in a LOADED cloud list: to the first location, or, for an empty list, clears the stored id so `NoLocationsGate` shows the empty screen | `apps/web/src/hooks/useActiveLocation.tsx:150–206` |
| `ActiveLocationProvider` bootstraps carts only at `participant` or higher, and again when the role rises (H5a F.6) | `useActiveLocation.tsx:221+`; H5 plan F.6 rows |
| `usePermissions()` gives `roleAt`, `canEditLocation`, `isOrganizerAt`, `canManageLocations`, `canManageMembers`, `isHouseholdOwner`; local mode allows everything | `apps/web/src/hooks/usePermissions.ts` |
| The web has its own location ladder, `locationRoleAtLeast` | `apps/web/src/lib/locationRole.ts` |
| `packages/types` is imported by the server at runtime (`parseCartId` in `authz.ts`) | `apps/server/src/lib/authz.ts:3`; `chore/build-shared-types` |
| `refetchAfterWrite` waits for a refetch but drops its error, so a write that worked never reports failure because a refresh failed (#386) | `apps/web/src/apollo/refetchAfterWrite.ts:46` |
| `/settings/household/locations` is a layout (`locations.tsx`, an `<Outlet />`) with one child, `locations/index.tsx`. No `$id` route | `apps/web/src/routes/settings/household/` |
| `/settings/household/<section>/<id>` is already full-screen on every screen (`HOUSEHOLD_DETAIL_PAGE`) | `apps/web/src/lib/layoutRules.ts:9`, `:47` |
| `LocationList` shows role text, **No access** and **No organizer** in cloud (`showRoles`). No row is a link. **No organizer** shows to anyone who sees the row, not only owner and manager | `components/location/LocationList/LocationList.tsx:128–141`; `routes/settings/household/locations/CLAUDE.md` |
| The Members page redirects local mode to `/settings/household` | `routes/settings/household/members.tsx:49–50` |
| `InviteDialog` already has a per-location role picker (`LOCATION_ROLES`, a `Select` per row) | `components/household/InviteDialog/InviteDialog.tsx:36`, `:173` |
| `settings.household.members.noLocationRoles` ("No location roles" / 「沒有據點角色」) exists, used by `InviteList` | `i18n/locales/*.json`; `InviteList.tsx` |
| `tw` role names: 據點王 / 搬運工 / 圍觀的; 擁有者 / 管理者 / 成員; "No organizer" is 「沒有據點王」 | `apps/web/src/i18n/locales/tw.json:653`, `:951–960` |
| E2E: `createInvite` and `joinHousehold` (`e2e/helpers/cloudUsers.ts:191`, `:238`) call the real mutations, so a spec can make a person who is in the household with NO location role. `addHouseholdMember` still refuses (409) a person who already has a household | `e2e/helpers/cloudUsers.ts`; `e2e/CLAUDE.md` |
| `newUserContext(browser, userId, extraLocalStorage?, options?)` makes a browser context as any user | `e2e/helpers/userContext.ts:44` |
| A new cloud-only spec goes into the `cloud` project's `testMatch` and the `local` project's `testIgnore` | `e2e/playwright.config.ts:197–214`, `:255–272` |
| `/e2e/cleanup` deletes 19 models; `LocationMember` is one of them. H5c adds no model | `apps/server/src/lib/e2eCleanup.ts` |
| Test baseline at `712f76f6`, Node 22.17.1, load 3.3: server **2111 / 76 files**, all passed (4.1 s). E2E collected: `cloud` **177 in 35 files**, `local` **189 in 23 files**. The web suite was NOT measured by this plan's author; H.1 measures it before any change | measured 2026-11-19 |

## Where the design and the outline disagree with the code

| # | The design or outline says | The code today | What this plan does |
|---|---|---|---|
| X1 | Outline: the web "falls back to the first location (or the empty screen from F.7)" when the person leaves or loses the role on the active location | Already built for any reason the list changes (`useActiveLocation.tsx:185–206`). But the tab that MAKES the change gets no live event (`sourceClientId`), so its lists change only if the hook refetches them | No new fallback logic. H.4's hooks refetch `GetLocations` and `GetHouseholdLocations` after each write (decision T37). H.7 tests the fallback for the role-loss path, and adds the notice of owner decision O27 |
| X2 | Outline: "B's switcher shows G without a reload. This closes the F.8 limit" | The live path already exists: a household-level `LOCATION` reaches B and refetches `GetLocations`. The F.8 limit was the E2E route's 409 rule, not the live path | H.8 makes B a member through `createInvite` + `joinHousehold` with no location role, then gives the role through the new page |
| X3 | Design, *Location pages*: owner and manager see a **No organizer** warning | `LocationList` shows it to anyone who sees the row (a `member` sees it on their own locations) | Owner decision **O26** |
| X4 | Design, *Rules that cross the two levels*: "Every location role change is written to the activity log" | There is no activity log until H6 | Owner decision **O29** |
| X5 | Design, *Location pages*: "people and their roles with **Add person** (organizer, owner, manager)" | It does not say who may SEE the people | Owner decision **O24** |
| X6 | Outline: "Name (organizer edits)" | Rename already exists: the list's pencil opens `AddNameDialog` and calls `useUpdateLocation` (organizer only) | The page reuses the same dialog and hook. The list keeps its pencil |
| X7 | Outline: "The target must be a `HouseholdMember` of the location's household (H18), checked in SQL" | Correct. But a check before the write is not enough on its own: `removeMember` could remove the person between the check and the write, leaving a role row H18 hides and T20 later cleans | The check runs AFTER the household lock, through `tx`. `removeMember` takes the same lock, so the two writes run one after the other (decision T34, Review Focus 3) |
| X8 | Outline: owner and manager act "on any location"; organizer on "their location" | `updateLocation` acts on the LOCATION's own household; `deleteLocation` on the CALLER's. A person in two households would get different answers from the two patterns | The three writes and the query act only on a location of the caller's household (decision T35) |
| X9 | The H5 plan *Known gaps*: "F.8 cannot give a role to a person who already has a household … Tests that need a second role change wait for H5c's `setLocationRole`" | — | H.8 uses `setLocationRole` through the page, and through `makeGql` for setup |
| X10 | Design, *Location pages* list: "Rows are not links" was never written, but the locations `CLAUDE.md` says "Rows are not links, so a 'No access' row opens nothing" | True today | H.6 makes the name a link for the people O24 names, and rewrites that line |
| X11 | Brief for this plan: the `tw` words 組織者 / 參與者 / 檢視者 | The app says 據點王 / 搬運工 / 圍觀的 (owner answer O11, `tw.json:953–955`) | This plan uses the app's words. Writing the other three would give one role two names |

## Gaps folded in from earlier plans

| Gap | From | Goes to |
|---|---|---|
| Location roles of a member cannot be changed after they join; the workaround is remove and invite again | H5b *Known gaps* | **H.3** (server), **H.5** (page) |
| A member who joined with no location role (O14-A) cannot be given one | H5b O14 note | **H.2** (`hasLocationRole`), **H.6** (Members page mark), owner decision **O28** |
| F.8 cannot give a role to a person who already has a household | H5 *Known gaps* | **H.8** |
| "Add person, change and remove roles, Leave location, No organizer warning" | H5 outline | **H.3**, **H.5** |
| Leaving or losing the role on the ACTIVE location falls back; test it | H5 outline | **H.7**, **H.8** |
| A live update shows B a new location without a reload | H5 outline | **H.8** |
| Not built in H5b on purpose: a "this location now has no organizer" note after a removal | H5b *Status*, G.9 | **H.5** shows **No organizer** on the people page; owner decision **O26** |

Not folded in, on purpose:

- A deleted organizer still counts for `hasOrganizer` (owed to **H6**, owner decision
  2026-11-17). H5c changes neither `countedOrganizerIn` nor `locationIdsWithOrganizer`.
- The activity log (H6, O29). The danger zone's **Remove all items** (H6).
- A person in two households writing into the wrong one (O21, owed to **H7**).
- The Info tab's unit switch failing for a manager who is a viewer somewhere (H5a gap).

---

## Decisions

### Technical decisions (made in this plan)

| # | Decision | Why | Rejected |
|---|---|---|---|
| T32 | **One query, one field, three mutations.** `locationPeople(locationId: ID!): [LocationPerson!]!`; `HouseholdPerson.hasLocationRole: Boolean!`; `setLocationRole(locationId: ID!, userId: ID!, role: LocationRole!): LocationPerson!` (adds a role or changes it); `removeLocationRole(locationId: ID!, userId: ID!): Boolean!`; `leaveLocation(locationId: ID!): Boolean!`. `type LocationPerson { userId: ID! displayName: String! role: LocationRole! isMe: Boolean! }`. All in `location.graphql` and `location.resolver.ts` | One "set" covers add and change, so the page has one write for a role picker. Leave is its own mutation because ANY role may leave, which the "set/remove" rule does not allow | Separate `addLocationPerson` and `changeLocationRole` (two writes with the same checks); a `locationPeople` field on `Location` (every `GetLocations` would carry it) |
| T33 | **The rule is one pure function in `packages/types`:** `canChangeLocationRole({ householdRole, callerRole, from, to }): boolean`, where `from` and `to` are `LocationRole \| null` (`null` = no role). False when `from` and `to` are both null, for everyone (nothing to change). Otherwise true when the household role is `owner` or `manager` (any change, any person, the caller too), and else true only when `callerRole === 'organizer'` and neither `from` nor `to` is `'organizer'`. (Corrected after H.1's review: the first wording made null→null true for owner and manager.) `packages/types` also exports `LOCATION_ROLE_RANK` and `locationRoleAtLeast`, and the server's `LOCATION_RANK` and the web's `lib/locationRole.ts` become thin users of it | The server and the web must give the same answer. One copy can be tested with every combination (3 household roles × 4 caller roles × 4 `from` × 4 `to` = 192 cases) | Two copies with matching tests; a GraphQL field that tells the web what it may do per row (one more query, and the web still needs the rule to build the picker) |
| T34 | **Lock and read order, the same for the three writes:** 1. `requireHousehold`; 2. in one transaction: `lockHouseholdOrForbid(tx, householdId)` FIRST (the private `lockOrForbid` moved to `lib/household.ts` and exported); 3. the location, `tx.location.findFirst({ where: { id: locationId, householdId } })` (none → `FORBIDDEN`); 4. the caller's household role with `requireHouseholdRole(ctx, householdId, 'member', tx)`; 5. the caller's counted location role with a new `locationRoleOf(ctx, locationId, db)` in `authz.ts` (returns the role or `null`, never throws, built on `countedLocationRole`); 6. the target's member row in that household, through `tx` (none → `FORBIDDEN`); 7. the target's current role row, through `tx`; 8. `canChangeLocationRole` (false → `FORBIDDEN`); 9. the write | The household lock is what `removeMember` and `leaveHousehold` take, so a role write and a removal cannot interleave (X7). Reading through `tx` keeps one connection (the H5b G.5 trap: a global read inside an interactive transaction needs a second pool connection) | `lockHousehold` (throws a raw `P2025` when the household was deleted, the H5b G.5 review finding); giving `requireLocationRole` a `db` argument (it throws; the rule needs the role or `null`, not a refusal) |
| T35 | **Only a location of the caller's household** (`requireHousehold`), checked in SQL after the lock. Another household's location, or an unknown id, is `FORBIDDEN` | The page lists the active household's locations only. A person in two households must not change the other one from a page that does not show it (the O21 shape) | The `updateLocation` pattern (the location's own household) |
| T36 | **Each write publishes ONE household-level `LOCATION` after the commit, and only when something changed.** No new `ChangeKind`. The live guard goes 69 → 72 | `LOCATION` already refetches `GetLocations` (`myRole`), `GetHouseholdLocations` (`hasOrganizer`), `HouseholdMembers` (`hasLocationRole`) and the new `LocationPeople` (`'all'`). The person who lost a role is still a household member, so their tabs get the event | A location-level event: the person who lost the role can no longer pass `requireLocationRole`, so their tab would not hear it |
| T37 | **The web hooks refetch after the write with `refetchAfterWrite`**, never `awaitRefetchQueries`: `LocationPeople` (this location), `GetLocations`, `GetHouseholdLocations`, `HouseholdMembers` | The acting tab gets no live event (`sourceClientId`). `awaitRefetchQueries` rejects a write that worked when a refetch fails (#386) | — |
| T38 | **Answers for "nothing to do".** `setLocationRole` with the role the person already has: no write, no event, returns the row. `removeLocationRole` or `leaveLocation` with no role row: `false`, no event. (Corrected after H.3: `removeLocationRole` gives that `false` only to a caller who may read the location's people (O24-A), so an organizer who is a household `member` gets `false` on a second press. Anyone else, for example a household `member` with no role on the location, gets `FORBIDDEN`, so `false` cannot tell them who has no role there.) A target who is not a member of the household: `FORBIDDEN`. `leaveLocation` never refuses for a role reason (any role may leave, the only organizer too, O25) | A second press of Leave or Remove must not show an error (the H5b G.9 double-press finding). The live rule: a change that changes nothing sends nothing | `FORBIDDEN` for a missing row (a double press would show an error toast) |
| T39 | **`locationPeople` answers** with every COUNTED role row of the location (decision H18 applied to each row's own person, the `countedOrganizerIn` shape with no role filter), sorted by role (organizer first), then `displayName`, then `userId`. Names come from `User.displayName` only, never e-mail (the H5b O13 rule). Who may call it: owner decision **O24**. Anyone else, an unknown id or another household's location: `FORBIDDEN` | A removed person's leftover row must not show (H18). A fixed order keeps tests and screens stable | — |
| T40 | **`HouseholdPerson.hasLocationRole`** is read ONCE per `householdMembers` answer: one `locationMember.findMany({ where: { location: { householdId }, userId: { in: memberIds } }, select: { userId: true }, distinct: ['userId'] })`. Every household role may read it; it says nothing about WHICH location | One read for the list, not one per person. A boolean is enough for the O28 mark | A list of the person's roles (needs a rule for who may see which location, for no gain in H5c) |
| T41 | **The page is cloud only.** In local mode `/settings/household/locations/$id` redirects to `/settings/household/locations` (the Members page pattern). In cloud, a `FORBIDDEN` from `locationPeople` shows "You do not have access to this location." with **Back to locations**, never an endless spinner | Local mode has one person and no roles | Showing the rename part in local mode (the list already has it) |
| T42 | **Removing a role deletes ONE `LocationMember` row and nothing else.** The location's carts, cart rows (their `userId` is only "added by"), stock and logs stay. A removed organizer's cart rows stay in the shared cart | Carts belong to the location since H3b. The design: "Everything they created stays" | Deleting the person's cart rows (other people may be buying them) |
| T43 | **The page reads the location's name and flags from `GetHouseholdLocations`** (already cached by the list page; it carries `myRole` and `hasOrganizer`), the people from `LocationPeople`, the Add person choices from `HouseholdMembers` minus the people already listed | No new "one location" query | A `location(id)` query (one more document and resolver for data the page already has) |
| T44 | **The new E2E spec makes the second person with `createInvite` + `joinHousehold`** with an empty `locationRoles` list, never `addHouseholdMember` | It is the real O14-A path, and the route refuses a person who already has a household | `addHouseholdMember` with a location role (cannot test "give a role later") |
| T45 | **The notice of O27 lives in `ActiveLocationProvider`**: it remembers the ids it has seen in the loaded list during this page visit. When the active id leaves a loaded list AND it was seen, it shows one toast. A stored id from an earlier visit, a household switch (`HouseholdChangeGuard` reloads), or the `'local'` sentinel never show it | A toast on a cold load with an old stored id would talk about something the person did not just see | A notice on every fallback |

### Owner decisions (needed before the task that uses them)

O1–O22 were answered for H5a and H5b. These are NEW. The recommendation is in **bold**.

**Answered 2026-11-19: all A** (the owner's reply: "all A"). O23-A one PR, O24-A, O25-A, O26-A,
O27-A, O28-A, O29-A, O30-A. O31: the texts below are used as written; the owner may correct
them in the PR.

**O23 — One PR or two?** (needed before H.1)

H5c has no migration. It adds a server part (H.1–H.3) and a web part (H.4–H.7), plus an E2E
spec (H.8).

- **A. One PR.** About the size of H5a. The web part cannot be tested in a browser without
  the server part.
- B. Two PRs: the server first, then the web.

**Recommendation: A.**

**O24 — Who may open a location's page and see who has a role there?** (needed before H.2)

- **A. Anyone with a role on that location, and every household owner and manager (on every
  location, also with No access).** A 搬運工 (participant) or 圍觀的 (viewer) sees the names
  and roles, and their own **Leave location**, but no buttons to change roles.
- B. Only the location's 據點王 (organizer), and household owners and managers. A
  participant or viewer cannot open the page; **Leave location** moves to the locations list.
- C. Everyone in the household, on every location.

**Recommendation: A.** Family members know each other, and the list tells a participant whom
to ask. C would show people a list of locations they cannot use. Note: with A, an owner or
manager sees the names on a No access location. That is the same kind of information the
Members page already shows them; it is not the location's stock, carts or logs.

**O25 — The only organizer of a location presses Leave location. What happens?** (needed
before H.3 and H.5)

- **A. Allowed, after a warning in the confirm:** "You are its only organizer. After you
  leave, only a household owner or manager can rename it or add people." The location keeps
  working and shows **No organizer**.
- B. Refused until someone else is organizer.

**Recommendation: A.** It is what the design says ("Anyone can leave a location, even its
only organizer"). B can trap a person whose household has no owner or manager left to help
(after H6's hand-over).

**O26 — Who sees "No organizer"?** (needed before H.5)

The design says owner and manager. Since H5a the locations list shows it to anyone who sees
the location.

- **A. Everyone who sees the location** (the list and the page). The sentence "Give someone
  the 據點王 role" and the controls for it show only to an owner or manager.
- B. Only owner and manager. H5c then hides it from everyone else on the list too (a change
  to H5a's list).

**Recommendation: A.** A participant learns why nobody can rename the location, and it keeps
H5a's list as it is.

**O27 — A person loses their role on the location they are using.** (needed before H.7)

This happens when they leave it, when someone removes them, or when the location is deleted.
The screen already moves to their first other location (or to the empty screen), with no
message.

- **A. Move as now, and show a short message once:** "You no longer have access to
  {location}." Only when this tab had shown that location during this visit (decision T45).
- B. Move silently, as now.

**Recommendation: A.** Without a message the pantry changes under the person with no reason
given.

**O28 — How does an owner find and help a member who joined with no location role?** (needed
before H.2 and H.6)

H5b's owner answer O14-A allows an invite with no location role. Such a person sees "You have
no locations in this household yet".

- **A. On the Members page, an owner or manager sees "No location roles" next to such a
  person, with a link "Give a location role" to Settings › Locations.** The role is then given
  on a location's page with **Add person**.
- B. A, plus a "Location roles" button on each Members row that opens a dialog with every
  location and a role picker (like the invite form). More work: it needs a list of the
  person's roles per location, and several writes from one dialog.

**Recommendation: A.** One place to change a location role (the location's page) is easier
to learn and to test. B can come later if it is asked for.

**O29 — The design says every location role change is written to the activity log. The log
is built in H6.** (needed before H.3, only to confirm no new table)

- **A. Accept that role changes made between H5c and H6 are not logged.** H6 starts logging
  from the day it ships.
- B. Add a small log table in H5c now (a migration, its own tests, a deploy step).

**Recommendation: A.** Nothing is deployed until the checkpoint release, and H6 follows. B
would build half of H6's activity log twice.

**O30 — Can a 據點王 (organizer) remove or change the role of a household owner or manager
who is a 搬運工 or 圍觀的 on their location?** (needed before H.1)

- **A. Yes.** The location rule looks only at location roles. The owner or manager can give
  themselves the role back at any time.
- B. No. An organizer acts only on people whose household role is `member`.

**Recommendation: A.** It is the design's rule as written, and it keeps the rule one table.

**O31 — The new texts.** (needed by H.5–H.7; the owner may also correct them in the PR)

English first, then the first `tw` version. Role names are the app's: 據點王, 搬運工, 圍觀的.

| Key (proposed) | English | `tw` |
|---|---|---|
| `settings.locations.open` | Open {{name}} | 開啟{{name}} |
| `settings.locations.people.title` | People | 人員 |
| `…people.description` | People who have a role on this location | 在這個據點有角色的人 |
| `…people.roleLabel` | Location role of {{name}} | {{name}} 的據點角色 |
| `…people.add` | Add person | 新增人員 |
| `…people.addPerson` | Person | 人員 |
| `…people.addRole` | Role | 角色 |
| `…people.noOneToAdd` | Everyone in this household already has a role here. | 家庭裡的每個人在這裡都已經有角色了。 |
| `…people.nobody` | Nobody has a role here yet. | 這裡還沒有任何人有角色。 |
| `…people.removeLabel` | Remove {{name}} from this location | 把 {{name}} 移出這個據點 |
| `…people.removeConfirm` | Remove {{name}} from {{location}}? They can no longer see its stock, carts or logs. | 要把 {{name}} 移出{{location}}嗎？對方將無法再看到這個據點的庫存、購物車和紀錄。 |
| `…people.leave` | Leave location | 離開據點 |
| `…people.leaveConfirm` | Leave {{location}}? You can no longer see its stock, carts or logs. | 要離開{{location}}嗎？你將無法再看到這個據點的庫存、購物車和紀錄。 |
| `…people.leaveOnlyOrganizer` | You are its only organizer. After you leave, only a household owner or manager can rename it or add people. | 你是這個據點唯一的據點王。你離開之後，只有家庭的擁有者或管理者可以重新命名這個據點或新增人員。 |
| `…people.noOrganizerNote` | This location has no organizer. Only a household owner or manager can rename it or add people. | 這個據點沒有據點王。只有家庭的擁有者或管理者可以重新命名這個據點或新增人員。 |
| `…people.noOrganizerAction` | Give someone the Organizer role. | 請把據點王的角色交給某個人。 |
| `…people.noAccess` | You do not have access to this location. | 你沒有這個據點的權限。 |
| `…people.back` | Back to locations | 回到據點列表 |
| `…people.leaving` | Leaving… | 離開中… |
| `…people.removing` | Removing… | 移除中… |
| `…people.loadError` | Could not load the people. Try again. | 無法讀取人員，請再試一次。 |
| `…people.error` | Could not save the change. Try again. | 無法儲存變更，請再試一次。 |
| `settings.household.members.giveLocationRole` | Give a location role | 指派據點角色 |
| `common.lostLocationAccess` | You no longer have access to {{location}}. | 你已經沒有{{location}}的權限了。 |

`…people.*` is `settings.locations.people.*`. "No organizer" reuses
`settings.locations.noOrganizer` (「沒有據點王」), "No location roles" reuses
`settings.household.members.noLocationRoles`, role names reuse `roles.location.*`. 「對方」
is used for "they", so the `tw` text does not choose 他 or 她.

---

## File map

| File | Task | Change |
|---|---|---|
| `packages/types/src/locationRoles.ts` (new), `packages/types/src/index.ts` | H.1 | `LOCATION_ROLE_RANK`, `locationRoleAtLeast`, `canChangeLocationRole`; export |
| `apps/server/src/lib/locationRoles.test.ts` (new) | H.1 | the 192-case table, run from the server (the package has no test runner) |
| `apps/server/src/lib/authz.ts` (+ test) | H.1 | `LOCATION_RANK` from the package; `locationRoleOf(ctx, locationId, db)` |
| `apps/server/src/lib/household.ts` (+ test), `resolvers/household.resolver.ts` | H.1 | move `lockOrForbid` → exported `lockHouseholdOrForbid`; callers unchanged in behaviour |
| `apps/web/src/lib/locationRole.ts` | H.1 | re-export from `@p1i/types` |
| `apps/server/src/schema/location.graphql`, `household.graphql` | H.2, H.3 | `LocationPerson`, `locationPeople`, `HouseholdPerson.hasLocationRole`, three mutations |
| `apps/server/src/resolvers/location.resolver.ts` | H.2, H.3 | the query, the field, the mutations |
| `apps/server/src/resolvers/household.resolver.ts` | H.2 | `hasLocationRole` |
| `apps/server/src/resolvers/location-people.resolver.test.ts` (new) | H.2, H.3 | resolver tests on `householdWorld` |
| `apps/server/src/resolvers/live-publish.guard.test.ts` | H.3 | 3 entries |
| `apps/web/src/apollo/operations/locations.graphql`, `household.graphql` | H.4 | `LocationPeople`, the three mutations, `hasLocationRole` in `HouseholdMembers` |
| `apps/web/src/hooks/useLocationPeople.ts` (+ test, new) | H.4 | query and three write hooks |
| `apps/web/src/hooks/usePermissions.ts` (+ test) | H.4 | `canOpenLocationPage(locationId)`, `canChangeRole(locationId, from, to)` |
| `apps/web/src/apollo/liveUpdates.ts` | H.4 | `LocationPeople` row in the comment table |
| `apps/web/src/routes/settings/household/locations/$id.tsx` (new, + cloud test, stories, smoke) | H.5 | the page |
| `apps/web/src/components/location/LocationPeopleList/` (new: component, `index.ts`, stories, smoke, test) | H.5 | people rows, role picker, remove |
| `apps/web/src/components/location/AddLocationPersonDialog/` (new, same set) | H.5 | Add person |
| `apps/web/src/components/location/LocationList/LocationList.tsx` (+ stories, tests) | H.6 | name as a link |
| `apps/web/src/components/household/MemberList/MemberList.tsx` (+ stories, tests) | H.6 | No location roles mark and link |
| `apps/web/src/hooks/useActiveLocation.tsx` (+ test) | H.7 | the O27 notice |
| `apps/web/src/i18n/locales/en.json`, `tw.json` | H.5–H.7 | O31 texts |
| `e2e/tests/location-people.spec.ts` (new), `e2e/pages/LocationPeoplePage.ts` (new), `e2e/playwright.config.ts` | H.8 | the spec, its page object, `testMatch`/`testIgnore` |
| docs (below) | H.9 | |

---

## Task H.1 — the shared role rule, `locationRoleOf`, and the lock helper

**Files:** `packages/types/src/locationRoles.ts` (new), `packages/types/src/index.ts`,
`apps/server/src/lib/locationRoles.test.ts` (new), `apps/server/src/lib/authz.ts`,
`apps/server/src/lib/authz.test.ts`, `apps/server/src/lib/household.ts`,
`apps/server/src/lib/household.test.ts`, `apps/server/src/resolvers/household.resolver.ts`,
`apps/web/src/lib/locationRole.ts`.

- [ ] **Step 0: measure the baseline.** On the unmodified tree, `pnpm test` from the repo
  root (all three suites). Record web, server and `scripts/spec` counts in the report. If
  the web suite fails, check `uptime` and re-run the failing file alone before calling it
  real (the H5b plan names one flaky story test under load).
- [ ] **Step 1: write the failing test** `apps/server/src/lib/locationRoles.test.ts`. Build
  the full table from the rule in T33 and compare it with `canChangeLocationRole` for all
  192 combinations of `householdRole` (`owner`, `manager`, `member`), `callerRole`
  (`organizer`, `participant`, `viewer`, `null`), `from` and `to` (each a role or `null`).
  Name a few rows by hand too, so a reader sees the rule:
  - an owner gives `organizer` to a person with no role → true;
  - a manager with no location role removes an organizer → true;
  - an organizer (household `member`) gives `participant` → true; gives `organizer` → false;
  - an organizer changes another organizer to `viewer` → false;
  - an organizer changes their OWN organizer row → false (they use Leave);
  - a participant gives `viewer` → false;
  - `from: null, to: null` → false for everyone.
  Also `locationRoleAtLeast` for every pair, and `null` never enough.
- [ ] **Step 2:** run it: red (module missing).
- [ ] **Step 3: implement** `packages/types/src/locationRoles.ts`:

  ```ts
  export type LocationRoleName = 'organizer' | 'participant' | 'viewer'
  export type HouseholdRoleName = 'owner' | 'manager' | 'member'
  export const LOCATION_ROLE_RANK: Record<LocationRoleName, number> = {
    viewer: 1, participant: 2, organizer: 3,
  }
  export function locationRoleAtLeast(role: LocationRoleName | null | undefined, min: LocationRoleName): boolean
  export function canChangeLocationRole(args: {
    householdRole: HouseholdRoleName | null
    callerRole: LocationRoleName | null
    from: LocationRoleName | null
    to: LocationRoleName | null
  }): boolean
  ```

  Comment the rule with the design's words and the owner answers O25 (leave is separate) and
  O30 (the household role of the TARGET does not matter). Export it from `index.ts`.
- [ ] **Step 4:** `authz.ts`: `LOCATION_RANK` becomes `LOCATION_ROLE_RANK` from the package
  (the Prisma enum and the package type are the same three strings; a `satisfies` check
  makes `tsc` fail if they ever differ). Add:

  ```ts
  /** The caller's COUNTED role on the location (decision H18), or null. Never throws for a role. */
  export async function locationRoleOf(
    ctx: Context,
    locationId: string,
    db: { locationMember: Prisma.TransactionClient['locationMember'] } = prisma,
  ): Promise<LocationRole | null>
  ```

  built on `countedLocationRole`. Tests in `authz.test.ts`: a counted role, no role, a
  leftover row of a person no longer in the household (→ `null`), and that the `db` passed
  is the one read (a spy on the global client sees no call).
- [ ] **Step 5:** move `lockOrForbid` from `household.resolver.ts` to `lib/household.ts` as
  exported `lockHouseholdOrForbid(tx, householdId)`, same body and comment. The three
  callers import it. Add a direct test in `household.test.ts` (a locked household; a deleted
  one → `FORBIDDEN`).
- [ ] **Step 6:** `apps/web/src/lib/locationRole.ts` re-exports `locationRoleAtLeast` from
  `@p1i/types`. Its comment says it is the shared copy now. The web's own rank map is
  deleted. Note: the web map started at 0 and the package at 1; only the order matters, and
  the web tests of `locationRoleAtLeast` must still pass unchanged.
- [ ] **Step 7:** the full gate (root `CLAUDE.md`, *Verification Gate*).

**Mutation checks** (copy each file aside first; restore from the copy):

| Mutation | Must go red |
|---|---|
| `canChangeLocationRole` lets an organizer give `organizer` | the 192-case table and the named row |
| the rule ignores `from` (an organizer may change another organizer) | the table, "an organizer changes another organizer" |
| `locationRoleOf` drops the H18 part of `countedLocationRole` | the leftover-row test |
| `locationRoleOf` ignores `db` | the spy test |
| `lockHouseholdOrForbid` returns without the check | the deleted-household test, and H5b's existing remove/leave tests |

**E2E:** none in this task.

---

## Task H.2 — server: `locationPeople` and `HouseholdPerson.hasLocationRole`

Needs owner decisions **O24** and **O28**.

**Files:** `apps/server/src/schema/location.graphql`, `household.graphql`,
`resolvers/location.resolver.ts`, `resolvers/household.resolver.ts`,
`resolvers/location-people.resolver.test.ts` (new), and the `householdWorld` / `householdFake`
fakes if a filter they do not model is needed (`src/test/`).

- [ ] **Step 1: write failing tests** on `householdWorld` (the H5b pattern: two households,
  a person with no role, a leftover row of a removed person). Every role test has a second
  person with a different role and a location the caller has no role on (design, *Testing
  notes*).
  - `user sees everyone with a role on the location, organizer first`;
  - a 搬運工 and a 圍觀的 may read it (O24-A); a household `member` with no role there →
    `FORBIDDEN`; an owner and a manager with No access → the list;
  - a leftover role row of a person removed from the household is NOT listed (H18);
  - another household's location, and an unknown id → `FORBIDDEN`, the same error;
  - no e-mail in the answer (the `select` of the user read names `displayName` only; the
    fake APPLIES `select`, as H5b's G.3 review made it);
  - `hasLocationRole`: true for a person with a counted role in THIS household, false for a
    person with roles only in another household, false with none; ONE `locationMember` read
    for a list of three people (a call counter).
- [ ] **Step 2:** run: red.
- [ ] **Step 3: schema.**

  ```graphql
  type LocationPerson {
    userId: ID!
    displayName: String!
    role: LocationRole!
    isMe: Boolean!
  }
  extend type Query {
    # Households H5c. See the plan, decisions T39 and O24.
    locationPeople(locationId: ID!): [LocationPerson!]!
  }
  ```

  and `hasLocationRole: Boolean!` on `HouseholdPerson`. Comments in plain English, like the
  existing ones.
- [ ] **Step 4: resolver.** `locationPeople`: `requireHousehold`; the location by
  `{ id, householdId }` (none → `FORBIDDEN`); the caller's household role
  (`requireHouseholdRole(ctx, householdId, 'member')`); with O24-A, pass when the household
  role is `owner` or `manager` OR `locationRoleOf` is not null; else `FORBIDDEN`. Then
  `locationMember.findMany({ where: { locationId, user: { householdMemberships: { some: {
  householdId } } } } })`, the names with `select: { id, displayName }`, sort per T39.
  No lock: it is a read.
- [ ] **Step 5:** `hasLocationRole` in `householdMembers` (T40).
- [ ] **Step 6:** run `pnpm codegen`, then check the output, not the log:
  `grep -c LocationPerson apps/server/src/generated/graphql.ts`. Run
  `oldBundleCompat.test.ts`: the dangerous and breaking lists must be unchanged.
- [ ] **Step 7:** the full gate.

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| drop the `user: { householdMemberships … }` filter | the leftover-row test |
| drop the household role branch (only location roles may read) | "an owner with No access gets the list" |
| drop the location role branch | "a viewer may read it" |
| look the location up by `id` alone | "another household's location is FORBIDDEN" |
| `hasLocationRole` without `location: { householdId }` | "roles only in another household → false" |
| `hasLocationRole` read per person | the call counter |

**E2E:** none (H.8).

---

## Task H.3 — server: `setLocationRole`, `removeLocationRole`, `leaveLocation`

Needs owner decisions **O25**, **O29** (no table) and **O30**.

**Files:** `apps/server/src/schema/location.graphql`, `resolvers/location.resolver.ts`,
`resolvers/location-people.resolver.test.ts`, `resolvers/live-publish.guard.test.ts`, the
fakes if needed.

- [ ] **Step 1: write failing tests.** For each mutation, with the H5b G.5 fixtures (owner,
  manager, member; organizer, participant, viewer; a location the caller has no role on; a
  second household):
  - **Who may do what:** one test per row of the rule's named cases from H.1, through the
    resolver, so the wiring is tested and not only the function. Include: an organizer
    gives 搬運工 to a household `member` with no role; an organizer cannot give 據點王
    (`FORBIDDEN`); an organizer cannot remove another organizer; a manager with No access
    gives themselves 據點王 and then `locationPeople` lists them; with O30-A an organizer
    removes the owner's 搬運工 role.
  - **H18 in SQL:** the target is not a member of the household → `FORBIDDEN`, and no row is
    written. The target is a member of the OTHER household only → `FORBIDDEN`.
  - **T35:** a location of the caller's other household (the caller is in two; use
    `world.setActiveHousehold`, NOT a `requestCache` pin, which a `Mutation` field forgets
    since H5b T15) → `FORBIDDEN`.
  - **T38:** the same role again → returns the row, no write (a spy), no event; remove or
    leave with no row → `false`, no event. Include the organizer double press: an organizer
    who is a household `member` removes a person with no row → `false`, no event. And a
    household `member` with no role on the location gets `FORBIDDEN` for the same call.
  - **O25:** the only organizer leaves → `true`; then `hasOrganizer` is `false` for that
    location.
  - **T42:** removing a role leaves the location's carts, cart rows (also the removed
    person's own "added by" rows), stock rows and logs as they were.
  - **T34 order:** for each mutation, `lockHouseholdOrForbid` is the FIRST call of the
    transaction, before any role read (the H5b pattern: moving the lock after
    `requireHouseholdRole` turns it red). Every read inside goes through `tx` (the test
    file's `prisma` mock has its own copy of each model object over the same stores, as
    after H5b's G.5 review; a spy on the global client sees no call).
  - **Review Focus 3:** with `serialTransactions(true)`, `removeMember(B)` then
    `setLocationRole(B)` → the second is `FORBIDDEN` and B has no role row. The opposite
    order → B's new row is deleted by the removal (T11). Note in the test that the queue runs
    them one after the other with or without the lock; the ORDER tests above are the ones
    that prove the lock (the H5b G.5 trap).
  - **Events (T36):** one household-level `LOCATION` per change, after the commit, with the
    household of the location; none when nothing changed; none when refused.
  - A household deleted after `requireHousehold` found it → `FORBIDDEN`, not `P2025`.
  - `leaveLocation` by a person with a role on a location of their OTHER household →
    `FORBIDDEN` (T35).
- [ ] **Step 2:** run: red.
- [ ] **Step 3: schema** (decision T32), with comments naming the rule and this plan.
- [ ] **Step 4: resolvers**, in the T34 order. `setLocationRole` writes with
  `tx.locationMember.upsert({ where: { locationId_userId }, create: {…}, update: { role } })`.
  `removeLocationRole` and `leaveLocation` use `deleteMany` with `{ locationId, userId }` and
  read the count. Publish after the transaction, only when it changed something.
- [ ] **Step 5:** add the 3 fields to `publishes` with `['LOCATION']`. The guard holds 72.
- [ ] **Step 6:** `pnpm codegen` (check the output), `oldBundleCompat.test.ts`, the full gate.

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| skip the target membership read | "the target is not a member → FORBIDDEN" |
| read the target membership through the global client | the `tx` spy test |
| lock after the role reads | the three order tests |
| `canChangeLocationRole` not called (any household member may write) | "an organizer cannot give 據點王", "a participant cannot …" |
| location looked up by `id` only | the T35 test |
| publish when nothing changed | the T38 event test |
| `setLocationRole` always `create` (no upsert) | "change 搬運工 to 圍觀的" fails on `P2002` |
| `removeLocationRole` also deletes the person's cart rows | the T42 test |

**E2E:** none (H.8).

---

## Task H.4 — web: documents, hooks and `usePermissions`

**Files:** `apps/web/src/apollo/operations/locations.graphql`, `household.graphql`,
`apps/web/src/hooks/useLocationPeople.ts` (new) and its test, `hooks/usePermissions.ts` and
its test, `hooks/CLAUDE.md`, `apollo/liveUpdates.ts` (comment table), `apollo/cloudCache.ts`
(a type policy if needed).

- [ ] **Step 1: failing tests** (`MockedProvider`):
  - `useLocationPeople(locationId)` returns the people, `isLoading`, and an `errorCode`
    (`FORBIDDEN` must be told apart from a network error, for T41);
  - each write hook sends the right variables, then refetches with `refetchAfterWrite` the
    four documents of T37; a failed refetch does NOT reject the write (the #386 rule); a
    second call while the first runs shares the first promise (the H5b G.9 double-press
    finding);
  - `usePermissions`: `canOpenLocationPage(id)` per O24 (owner, manager on every id; others
    only with a role); `canChangeRole(id, from, to)` gives the same answer as
    `canChangeLocationRole` for owner, manager, organizer, participant and no role. Local
    mode: `canOpenLocationPage` is `false` (T41) and `canChangeRole` is `false`.
- [ ] **Step 2:** red.
- [ ] **Step 3:** the documents. `HouseholdMembers` selects `hasLocationRole`. Grep the web
  test files for every `HouseholdMembers` mock and add the field (an Apollo result missing a
  selected field reads back as incomplete: the H5a F.1 trap; `tsc` does not catch an extra
  or missing key in an untyped mock, root `CLAUDE.md`).
- [ ] **Step 4:** the hooks and the two `usePermissions` members. `LocationPerson` has no
  `id`; give `locationPeople` a `merge: false` field policy or a key on `userId` +
  `locationId` so a shorter list after a removal does not warn "Cache data may be lost" (the
  H5b G.9 `householdMembers` finding). Prove the policy by mutation in
  `apollo/client.test.ts`.
- [ ] **Step 5:** the full gate.

**Mutation checks:** remove `refetchAfterWrite` for `GetLocations` → the "refetches" test;
`awaitRefetchQueries: true` → "a failed refetch does not reject"; no shared promise → the
double-press test; `canOpenLocationPage` true for a member with no role → its test; the
field policy removed → the `client.test.ts` warning test.

**E2E:** none.

---

## Task H.5 — web: the page `/settings/household/locations/$id`

Needs owner decisions **O24**, **O25**, **O26**, **O31**.

**Files:** `apps/web/src/routes/settings/household/locations/$id.tsx` (new),
`$id.cloud.test.tsx`, `$id.test.tsx` (local redirect), `$id.stories.tsx`,
`$id.stories.test.tsx`; `components/location/LocationPeopleList/` and
`components/location/AddLocationPersonDialog/` (each: `Name.tsx`, `index.ts`, stories,
smoke test, unit test); the two locale files; `routes/settings/household/locations/CLAUDE.md`;
`components/CLAUDE.md`.

What the page shows, top to bottom (full-screen, with its own Back, because
`HOUSEHOLD_DETAIL_PAGE` already makes it full-screen):

1. **Back to locations**, then the name as the page heading, as stored. A rename button for
   an organizer (`isOrganizerAt`), opening the existing `AddNameDialog` with
   `useUpdateLocation`.
2. **No organizer** (`hasOrganizer: false`), to everyone (O26-A), with
   `noOrganizerNote`; `noOrganizerAction` only for an owner or manager.
3. **People**: one row per person: name (with "(you)" from `members.you`), the role. Where
   `canChangeRole(id, from, to)` allows at least one other role, the role is a `Select` with
   only the allowed choices, and a Remove button when `canChangeRole(id, role, null)`.
   Otherwise the role is plain text.
4. **Add person** when the caller may give at least one role. The dialog lists household
   members with no role here (T43), and the roles the caller may give. With nobody to add:
   `noOneToAdd`, and no button.
5. **Leave location** for anyone with a role (`roleAt(id) !== null`), with
   `leaveConfirm`, plus `leaveOnlyOrganizer` when the caller is the only organizer (O25-A).
   After the leave: an owner or manager stays on the page (they can still see it); anyone
   else goes to `/settings/household/locations`.

States: loading → `LoadingSpinner`; `FORBIDDEN` → `noAccess` and Back (T41); other error →
`loadError` with Retry; local mode → redirect to the list. Confirms use `DeleteButton` and
catch their own errors (the H5b G.9 note: it has no `catch`). While a remove or leave runs,
the button is replaced by `removing` / `leaving` in an `<output>`. After a Remove, focus moves
to the People heading.

- [ ] **Step 1: failing tests** (cloud through `MockedProvider` and the REAL
  `usePermissions`, the H5b G.9 pattern; a page test through `permissionsFor` cannot tell
  `canManageLocations` from `canEditCatalog`):
  - `user sees the people of a location and their roles`;
  - `household owner can give a member the organizer role` (exact variables);
  - `location organizer sees only participant and viewer as choices` and no control on
    another organizer's row and none on their own;
  - `location participant sees the people and Leave, and no other control` (O24-A);
  - `user sees No organizer`; the action sentence only for owner and manager;
  - the only organizer's Leave confirm has the extra sentence; another organizer's does not;
  - after Leave, a participant lands on the list; an owner stays;
  - `user sees that they have no access` on `FORBIDDEN`; Retry on a network error;
  - local mode redirects;
  - Add person lists only members with no role here; with none, `noOneToAdd`;
  - a second press on Remove or Leave sends one mutation.
- [ ] **Step 2:** red.
- [ ] **Step 3:** build the two components (stories with realistic data: an owner view, an
  organizer view, a participant view, No organizer, nobody to add) and the route.
- [ ] **Step 4:** add the O31 texts to both locale files. `locales.test.ts` must pass.
- [ ] **Step 5:** update `locations/CLAUDE.md` (the page, who sees what, the rules table) and
  `components/CLAUDE.md`.
- [ ] **Step 6:** the full gate, `pnpm build-storybook`, and check the new story ids in
  `apps/web/storybook-static/index.json` (no exported fixture became a story).

**Mutation checks:** the page passes every role to the picker (ignores `canChangeRole`) →
the organizer test; Leave hidden for a participant → the participant test; the extra
sentence for every organizer → "another organizer's confirm"; no `FORBIDDEN` branch →
the no-access test; Add person lists everyone → its test.

**E2E:** in H.8.

---

## Task H.6 — web: list links and the Members page mark

Needs owner decisions **O24** and **O28**.

**Files:** `components/location/LocationList/LocationList.tsx`, its stories, smoke test and
tests; `routes/settings/household/locations/index.tsx` and its cloud test;
`components/household/MemberList/MemberList.tsx`, its stories and tests;
`routes/settings/household/members.cloud.test.tsx`; locale files; the two `CLAUDE.md` files.

- [ ] **Step 1: failing tests:**
  - in cloud, a row's name is a link to `/settings/household/locations/$id` when
    `canOpenLocationPage(id)`; a member's own rows link; in local mode no row is a link
    (T41); the link's accessible name is `settings.locations.open`;
  - drag handle, rename and delete still work (the link must not start a drag:
    `PointerSensor` has `activationConstraint: { distance: 8 }`, `LocationList.tsx:202`;
    test a click);
  - Members page: an owner or manager sees `noLocationRoles` and a
    `giveLocationRole` link (to `/settings/household/locations`) on a row with
    `hasLocationRole: false`; a member sees no mark.
- [ ] **Step 2–4:** red, build, the full gate. Rewrite "Rows are not links" in
  `locations/CLAUDE.md`.

**Mutation checks:** the link for every row → "a member's No access row is not a link" (a
member never sees such a row, so use an owner with `canOpenLocationPage` stubbed to answer
by id); the mark for a member → its test.

**E2E:** in H.8.

---

## Task H.7 — web: losing the role on the active location

Needs owner decision **O27**.

**Files:** `apps/web/src/hooks/useActiveLocation.tsx` and `useActiveLocation.test.tsx`; the
locale files; `hooks/CLAUDE.md`, `routes/CLAUDE.md`.

The fallback itself exists (X1). This task proves it for the H5c paths and adds the notice.

- [ ] **Step 1: failing tests** (cloud, `MockedProvider`, a refetch that changes the list):
  - `user who loses the role on the active location is moved to their first other
    location`: active K; `GetLocations` refetches without K → active is the first location;
    no `bootstrapCarts` for a viewer location; the pantry query for K is no longer active;
  - the same when the list becomes EMPTY → the stored id is removed and the empty screen
    shows (`NoLocationsGate`);
  - **O27-A:** one toast `common.lostLocationAccess` with K's name; no toast on a cold load
    with an old stored id; no toast for the `'local'` sentinel; no toast after a household
    switch (the guard reloads, so the seen set starts empty); not two toasts for one loss;
  - a role DOWN (participant → viewer, K stays in the list) moves nothing and shows no
    toast; the page controls become read only (`canEditLocation` false).
- [ ] **Step 2–4:** red, build (decision T45), the full gate.

**Mutation checks:** the seen set removed (toast on every fallback) → "no toast on a cold
load"; the fallback effect's empty-list branch removed → the empty test (it exists since
F.7; confirm it is still red); toast keyed on the id, not on the loss event → "not two
toasts".

**E2E:** in H.8.

---

## Task H.8 — E2E: the people page in two browsers

**Files:** `e2e/tests/location-people.spec.ts` (new), `e2e/pages/LocationPeoplePage.ts`
(new; its constructor ends with `withSteps(this)`; each method cites the aria-label and the
source line), `e2e/playwright.config.ts` (`cloud` `testMatch` and `local` `testIgnore`, and
the comment above `testIgnore`), `e2e/CLAUDE.md`.

Read `e2e/CLAUDE.md` first: ports, the 409 order, `forgetDeletedHousehold` after a mid-test
cleanup, `cleanupCloudData` for every user AND for `E2E_USER_ID`.

Setup: OWNER (`E2E_USER_ID` page or a `newUserContext`) owns household H with "Home" and
"Garage". B joins through `createInvite(…, locationRoles: [])` + `joinHousehold` (T44), so
B has no location role. C joins as `member` with 據點王 on Garage.

- [ ] **Test 1 — `household owner can give a role, and the member sees the location without
  a reload`** (closes the F.8 limit). B's browser shows the empty screen ("You have no
  locations in this household yet"). In OWNER's browser: Members shows "No location roles"
  on B's row; open Home's page; Add person → B → 搬運工 (participant). B's browser, with NO
  reload: the empty screen goes away, the switcher shows Home, the pantry shows Home. Read
  `locationPeople` back through `makeGql` (use `expect.poll`: a click resolves before the
  write commits).
- [ ] **Test 2 — `location organizer can give participant and viewer, and nothing more`.**
  As C on Garage: the role picker on B's new row offers 搬運工 and 圍觀的 only; OWNER's row
  (if OWNER has a role there) has no control on organizer rows. Then the API:
  `setLocationRole(Garage, B, organizer)` as C → `FORBIDDEN`.
- [ ] **Test 3 — `user who loses the role on the active location is moved to another one`.**
  B has 搬運工 on Home and 圍觀的 on Garage, active Home, pantry open. OWNER removes B from
  Home. B's browser, no reload: the active location is Garage, "View only" shows, the message
  of O27-A shows once, and no Home row is on screen. Then OWNER removes B from Garage: B sees
  the empty screen.
- [ ] **Test 4 — `the only organizer can leave, and the location shows No organizer`.** C
  leaves Garage from its page (the extra sentence shows), lands on the list, Garage is gone
  from C's switcher. OWNER's list shows "No organizer" on Garage; OWNER gives themselves
  據點王 from Garage's page, and the warning goes away.
- [ ] **Test 5 — `household owner with No access sees the people, not the data`.** Garage
  made by C; OWNER has no role there. OWNER opens Garage's page: people listed, no stock.
  Through the API: `itemStocks(locationId: Garage)` as OWNER → `FORBIDDEN`.
- [ ] **Tests 6, 7 — axe, light and dark:** the page as owner (with No organizer), the Add
  person dialog, the Remove confirm, the Leave confirm. Use `checkA11y` for the page and
  `checkDialogA11y` (`e2e/helpers/axe.ts`) for dialogs (the known `opacity-90` contrast
  defect of filled buttons in a dialog).

- [ ] Run `pnpm test:e2e --project=cloud e2e/tests/location-people.spec.ts`, then the files
  this branch touches by path: `settings/locations.spec.ts`, `location-switcher.spec.ts`,
  `shared-household.spec.ts`, `household-invites.spec.ts`, `settings-global-pages.spec.ts`
  (it counts sidebar links; nothing should change, check it).

**Mutation checks** (each in `cloud`, restored from a copy):

| Mutation | Must go red |
|---|---|
| `setLocationRole` publishes nothing | test 1: B still sees the empty screen (timeout on the switcher) |
| `canChangeLocationRole` lets an organizer give 據點王 | test 2: the picker shows 據點王, and the API call resolves |
| `ActiveLocationProvider`'s fallback effect returns early | test 3: the active location stays Home |
| `leaveLocation` deletes nothing | test 4: Garage still in C's switcher |
| `locationPeople` refuses a household owner with No access | test 5 |
| the web hooks skip the refetch of `GetLocations` | test 4: C's own switcher still lists Garage (the source tab gets no event) |

**Negative controls** (expected to stay green, not counted as coverage): test 5's
`FORBIDDEN` on `itemStocks` passes before and after H5c.

---

## Task H.9 — docs, deploy notes and the final gate

**Files:** root `CLAUDE.md` (an H5c paragraph beside the H5b one: the query, the three
mutations, the rule's home, the live guard count 72, the E2E spec), `e2e/CLAUDE.md` (the new
spec, its mutation table, the cloud collected count), `apps/web/src/routes/CLAUDE.md`,
`hooks/CLAUDE.md`, `components/CLAUDE.md`, `locations/CLAUDE.md`, the design's *Sequencing*
row and *Location pages* (built, with O24–O30), the phase plan's H5 outline, the H5 plan's
H5c outline (points here), `docs/INDEX.md`, the H4 runbook (a new **section 10, H5c**: no
migration, server first, checks after deploy), and this plan's *What this plan got wrong*
and *Status*.

- [ ] Step 1: the docs above. Re-measure every count you write; do not copy one from here.
- [ ] Step 2: the full gate from the repo root, then `pnpm test:e2e:all` (never the bare
  `pnpm test:e2e`, never `--grep`). Copy `test-results/` aside before re-running anything.
- [ ] Step 3: `git status` clean; `git show --stat` for each commit.

---

## Deploy notes

| Part | Migration | Order | Env / Clerk |
|---|---|---|---|
| H5c | **none** | server before web (the new bundle selects `locationPeople` and `HouseholdPerson.hasLocationRole`) | none |

- **An old bundle and H5c.** `main`'s bundle selects none of the new fields, so it keeps
  working. An H5b-era bundle does not exist in production (H5b is not deployed), so there is
  no in-between bundle to plan for.
- **`oldBundleCompat.test.ts`** must still list exactly the known breaking and dangerous
  changes. Adding a field to `HouseholdPerson` is not dangerous for `main`'s documents (they
  do not select the type).
- The H4 runbook gets a section 10 for H5c: after the server deploy, on a device with the
  new bundle, give a role from a location page and check a second device sees it without a
  reload.

## What the user gets / What the developer gets

See *Summary*. In one line each: the user can see and change who has which role on each
location, leave a location, and find a member with no location role; the screen follows a
lost role by itself. The developer gets one shared role rule for server and web, one lock
order for every "who belongs where" write, and the last H5 gap closed; the cost is three
more live events, one more page and one more cloud spec.

## Rules every task brief must pass down

- Plain English (short sentences, common words, main point first), in code comments, docs,
  commits and the report. `tw` texts use 據點王 / 搬運工 / 圍觀的 for the location roles.
- The report shape from root `CLAUDE.md`, *Pull Requests and Agent Reports*, and an explicit
  section: **what this plan got wrong**.
- Node 22.17.1. The full gate after each task. Copy files aside before a mutation; never
  `git checkout --` to undo one; never bare `git stash`.
- No database command in a subagent.
- Every role test has a second person with a different role and a location the caller has
  no role on. A test that needs one person in two households to act in one of them sets
  `User.activeHouseholdId` (`world.setActiveHousehold`), not a `requestCache` pin.
- Every new mutation is in the live guard, with its test of the published event.
- Do not change or remove an existing GraphQL field, argument or input field. Run
  `oldBundleCompat.test.ts`.
- A write hook refetches with `refetchAfterWrite`, never `awaitRefetchQueries`.
- After each commit, `git show <sha> -- <file> | grep '<a line you added>'` (lint-staged can
  rewrite a staged file).
- The web suite has one known flaky story test under load
  (`routes/shopping/index.stories.test.tsx`, Offline). Check `uptime` and re-run it alone
  before you call it a regression.

## Known gaps (expected after H5c)

- **Role changes are not logged** until H6 (O29). A manager who gives themselves a role,
  reads a location and leaves again leaves no trace before H6.
- **A deleted organizer still counts for `hasOrganizer`** (owed to H6). So a location whose
  only organizer deleted their account shows no **No organizer**.
- **A deleted account still shows in Add person and on the people page** with its stored
  name, until H6's hand-over decides what a deleted person is. Nothing in H5c reads
  `User.deletedAt`.
- **An owner or manager sees the names on a No access location's page** (O24-A). Not its
  data.
- **The race in Review Focus 3 is proved by call order in unit tests only.** The Prisma fake
  has no row lock, and no E2E test makes two writes overlap in Postgres.
- **A person in two households** acts on the people of their active household only (T35).
  The other household's locations wait for H7's switch. O21 (a stale tab writing into the
  other household) is still owed to H7.
- **Remove all items** (the location danger zone) is H6.
- **The lost-access toast can show for the person's own `clear` import** (H.7). The import
  marks every location as an expected loss before `ClearAllData`, and takes the mark back
  when `ClearAllData` fails. If the server applied the clear and the answer was lost (a
  dropped connection), the locations are gone and the mark is gone too, so the person reads
  "You no longer have access to …" for their own import.
- **The lost-access toast after a sign-out and a sign-in in the same household** (H.7). With
  no reload between them, the second person gets no toast for a location the first person
  had seen, until a reload.
- Carried over, still open: the old-bundle shim removal, the keyboard gap on `role="button"`
  badges, and the other items in the H5 and H5b plans' *Known gaps*.

## What this plan got wrong

Filled in from the task reports and reviews.

| Task | The plan said | What was true |
|---|---|---|
| H.1 | Step 5: move `lockOrForbid` to `lib/household.ts` with the same body | The body calls `forbidden()` from `lib/authz.ts`, and `authz.ts` already imports `household.ts`. `household.ts` builds the same `GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } })` itself, to avoid an import cycle |
| H.1 | The file list | Root `CLAUDE.md` also named `lockOrForbid`; that line was updated |
| H.1 | `householdRole: null` is allowed by the signature | The plan did not say what it gives. It is treated like `member`, with a test |
| H.1 | T33's first wording | Made null→null true for owner and manager; step 1 said false. The code follows step 1; T33 is corrected |
| H.2 | The fakes model what T40 needs | `householdFake` threw on `distinct` for every model. `locationMember.findMany` now APPLIES `distinct` (a string or an array of columns; any other key throws), with 5 tests in `householdFake.test.ts` |
| H.2 | Step 5: `hasLocationRole` in `householdMembers` | `setHouseholdRole` returns a `HouseholdPerson` too, so it needs the field. It reads it after the commit with the same helper (`peopleWithLocationRole`) |
| H.2 | Step 4: names with `select: { id, displayName }` | `household.resolver.ts` and `invite.resolver.ts` each had a private `displayNames`. One shared `displayNamesOf` in `lib/household.ts` replaces both, so `locationPeople` adds no third copy |
| H.2 | Only `oldBundleCompat.test.ts` lists fields | `household-members.resolver.test.ts` has a test that lists every `HouseholdPerson` field (the no e-mail test). It needed `hasLocationRole` added. `oldBundleCompat.test.ts` needed no change |
| H.2 | T40's `where`: `location: { householdId }, userId: { in }` | That `where` carries no H18 filter. The ids come from the same household's member list, so it is right today, but the rule says every `LocationMember` read applies H18. The `user: { householdMemberships: { some: { householdId } } }` filter is added too |
| H.2 | Mutation "drop the `user: { householdMemberships … }` filter" | It can go red only for `locationPeople`. For `hasLocationRole` it cannot: the ids already come from this household's member list, so the filter changes nothing there. It is not coverage for `hasLocationRole` |
| H.3 | Review Focus 3 tests: `Promise.all([removeMember(B), setLocationRole(B)])` with `serialTransactions(true)` | The queue order is not the call order: both calls do async work before `$transaction`, and the role write reached the queue first. The tests now start the second write only after the first one has taken the household lock (a spy on the lock's `updateMany`), and assert the lock order `[1, 2]` |
| H.3 | T38: `removeLocationRole` with no row → `false` | A `false` to anyone would tell a household `member` with no role on the location whether a person has a role there, which `locationPeople` refuses them (O24-A). So `false` goes only to a caller who may read the people (an owner, a manager, or anyone with a role there). Anyone else gets `FORBIDDEN`. Tested and mutation-checked |
| H.3 | Mutation "`removeLocationRole` also deletes the person's cart rows" goes red on the T42 test | At first it went red only because `householdWorld` has no `cartItem` model: the mutated code threw a `TypeError`. After the review, the test file wraps `tx` in a Proxy that records every model a transaction reaches, and gives a model the world lacks a recording stub. The T42 test asserts the models are exactly `household`, `householdMember`, `location`, `locationMember`, and every test checks that no unknown model was reached. The same mutation now fails on that assertion (`+ "cartItem"`) |
| H.3 | (review) Nothing pinned the organizer double press | Changing the no-row guard to `if (householdRole === 'member') throw forbidden()` left all 59 tests green. A test now has BEA (organizer, household `member`) remove NOA, who has no row → `false`, no event. That mutation turns it red |
| H.3 | The target's role read applies H18 | It does (`roleOfPerson`), but removing the filter leaves every test green: the target's membership is checked first, so the filter changes nothing today. Not coverage, the same as the H.2 `hasLocationRole` row |
| H.3 | Mutation "location looked up by `id` only" turns the T35 test red | The `world.setActiveHousehold` test stays green under it: MIA, acting in hh_x, is still refused, because she is a household `member` there with no role on LOC_K. The two other T35 tests (another household's location; `leaveLocation` on the other household's location) go red |
| H.3 | Step 1: the order tests for "every read goes through `tx`" spy on one method | A spy on the global client also sees `requireHousehold`'s reads, which run before the transaction. The test file now counts the running `$transaction` callbacks (`tx.depth`) and records only global reads made while one runs. The same counter checks that each event is published at depth 0, after the commit |
| H.4 | Step 1: "a second call while the first runs shares the first promise" | The plan did not say per WHAT. The H5b `leave()` guard holds one promise per module. Here a location write is keyed by its arguments (`set:loc:user:role`, `remove:loc:user`, `leave:loc`): the same press again shares the promise and sends nothing; a different person or role is sent, because it is a different change. Still per module, so two mounts share it. (Review: the first version claimed the "different arguments" half was pinned. It was not: keying `set` and `remove` by a constant left all 19 tests green. Three tests now send two different changes at once and expect 2 writes; the constant key turns them red) |
| H.4 | T37: refetch "`LocationPeople` (this location)" | The four reads are passed as DOCUMENTS, so only MOUNTED queries are read again. A `{ query, variables }` entry would read the page even when it is not mounted, and after a leave that read is a `FORBIDDEN` that `refetchAfterWrite` swallows, while the mounted page would not see it. Only the people page mounts `LocationPeople`, so "this location" holds in practice. (Review: T37 says the write "waits for the four reads", but did not think of a read that FAILS on purpose: after a participant or viewer leaves, the `LocationPeople` read is FORBIDDEN every time. `refetchAfterWrite` waited for `client.refetchQueries()`, a `Promise.all` that rejects at the first failed read, so `leave()` resolved and `isPending` went false about 100 ms before `GetHouseholdLocations` landed. Fixed in the shared helper, which now waits for each read on its own; `apollo/refetchAfterWrite.test.ts`. After the leave, `useLocationPeople` keeps the old rows with `isError: false` and `errorCode: 'FORBIDDEN'`, so H.5 must read `errorCode`) |
| H.4 | Step 1: the tests use `MockedProvider` | True for `useLocationPeople.test.tsx`. `usePermissions.test.tsx` stubs the two generated hooks, as it did before H.4, and the new tests follow that file. The hook only reads `GetHousehold` and `GetLocations`, so a stub is enough |
| H.4 | `canChangeRole` per the rule | The plan did not say what it gives while the household role is not known. It gives `false` (loading, or `GetHousehold` failed with nothing cached), also to an organizer, whose answer does not need the household role. The server checks every write. `canOpenLocationPage` does NOT wait: a role on the location is enough by itself. (Review: the `!isLoading` half was not pinned at first. A test now has an owner with `GetLocations` still loading; dropping `!isLoading` turns it red) |
| H.4 | Step 3: grep for `HouseholdMembers` mocks (the `tsc` gap for untyped mocks) | All three fixtures (`useHouseholdMembers.test.tsx`, `members.cloud.test.tsx`, `members.stories.tsx`) are typed as `HouseholdMembersQuery['householdMembers'][number]`, so `tsc` would have caught them. `MemberList` uses its own `MemberRow` type and needs nothing. `SetHouseholdRole` does not select `hasLocationRole`: its answer has no `id` and is not merged into the list, which is read again |
| H.4 | Step 4: `merge: false` "or a key on `userId` + `locationId`" | `merge: false` with `keyArgs: ['locationId']`. The `keyArgs` is Apollo's default for a field with one argument, but it is written out and pinned: `keyArgs: false` turns "two locations keep their own lists" red |
| H.4 | Step 1: "each write hook … refetches with `refetchAfterWrite`" | The first version pinned the reads but not `isPending: loading \|\| isRefetching`: dropping `\|\| isRefetching` from the three hooks left every test green. The three hooks joined `hooks/refetchPending.cloud.test.tsx` (each with `GetHouseholdLocations` MOUNTED, because they read again by document); the same mutation turns 6 tests red |
| H.5 | "Confirms use `DeleteButton` and catch their own errors (the H5b G.9 note: it has no `catch`)" | Since 2026-11-19 `DeleteButton` HAS a `catch`: a rejected `onDelete` shows `common.deleteFailed`. The page still catches its own errors, so the person reads `people.error`, and `DeleteButton` then sees a success and shows nothing more. A remove or leave the server answers `false` shows nothing (mutation-checked) |
| H.5 | Item 3: Remove "when `canChangeRole(id, role, null)`" | For an owner or manager that is true on their OWN row too, so the row would show Remove next to Leave location, two buttons for one act. The page hides Remove on the caller's own row (`LocationPeopleList`, mutation-checked); an owner or manager keeps the picker there. An organizer gets no Remove on their own row from the rule anyway |
| H.5 | O31 lists every text the page needs | Two were missing. **Retry** (the `loadError` state): `settings.locations.people.retry`, "Retry" / 「再試一次」 (the same words as `settings.import.retry`). The Remove confirm's title and button: they reuse `settings.household.members.remove` ("Remove" / 「移除」) |
| H.5 | States: "other error → `loadError` with Retry" | `useLocationPeople` had no way to read again. It gained `refetch` (never rejects). Pinned through the page: Retry made a no-op turns "user can retry after a network error" red |
| H.5 | Mutation "the page passes every role to the picker" covers the organizer rule | It covers the row pickers only. Add person builds its role list separately (`canChangeRole(id, null, r)`). A second mutation, "Add person offers every role", turns "location organizer can add a member as participant or viewer, never organizer" red |
| H.5 | Step 1: "a second press on Remove or Leave sends one mutation" | A second press cannot happen in the page: the button is replaced by "Removing…" / "Leaving…" at once. The test checks that the button is gone and that exactly one mutation was sent. Removing the replacement turns 3 tests red. The hook's own shared-promise guard is H.4's, pinned there |
| H.5 | Review Focus 4: "no stock, cart or log … is fetched" | The plan named no way to see a request that is NOT made. The page test records every operation with a spy `ApolloLink` in front of the `MockLink`, and checks that only `LocationPeople` names the No access location before the owner gives themselves a role. Proved: a `PantryData` read added to the page turns that test red |
| H.5 | Step 6 and root `CLAUDE.md`: add a new page to `a11y.spec.ts`, light and dark | `a11y.spec.ts` runs in `local` and `pwa` only, where this page redirects. No scan was added; it is owed to H.8's cloud spec, like the H5b Members page |
| H.5 | The mutation list | It named neither "focus after Remove" nor "read `errorCode`, not `isError`". Both were unpinned: deleting the focus line, or changing the check to `people.isError && people.errorCode === 'FORBIDDEN'`, left every route test green (review of H.5). Two tests now pin them: "after a Remove, focus moves to the People heading" and "user who loses their role in another tab sees no access, and no old names" (a FORBIDDEN on a refetch of ACTIVE queries, the way a live `LOCATION` event reads them). Each mutation turns its test red |
| H.5 | (review) Items the plan did not cover | Four more gaps, all fixed with a test each and a mutation that turns it red: the heading was empty when the location is not in the caller's list (now `people.unnamed`); a role picker jumped back to the old role until the read landed and allowed a second pick meanwhile (now it shows the pick and is disabled); Add person vanished with no message when `HouseholdMembers` failed (now `people.membersLoadError` and Retry; `useHouseholdMembers` gained `refetch`); an owner or manager who left and stayed had no focus target (now the People heading). The Person select got a placeholder, `people.choosePerson` |
| H.6 | Mutation "the link for every row → a member's No access row is not a link (use an owner with `canOpenLocationPage` stubbed to answer by id)" | The page test answers the roles through the generated hooks and the REAL `usePermissions`, so there is nothing to stub by id. The test feeds a household `member` a "No access" row the server would never send, and the real rule leaves it unlinked. Both mutations turn it red: `LocationList` ignoring `canOpen`, and the page passing `canOpen={() => true}`. The first one also turns 12 unrelated `LocationList` story tests red, only because a `<Link>` with no router in context throws. The tests that fail on the VALUE are "household member sees a link only on the locations they have a role on", "user sees no link to a people page in local mode" and "a list without canOpen has no link" |
| H.6 | The file list | It missed three things. (1) A story or unit test of `LocationList` or `MemberList` with a link needs the router in context: a shared helper, `src/test/routerContext.tsx` (`WithRouterContext`), was added. (2) Local mode is tested in `locations/index.test.tsx`, not the cloud file. (3) The Members page stories (`members.stories.tsx`) got `OwnerSeesNoLocationRoles` |
| H.6 | Step 1: "test a click" on the link | A click opens the people page, which mounts its own Apollo hooks. The locations cloud test's mock factory REPLACES `setup.ts`'s, so those hooks needed a client and the page crashed into the router's error boundary. **The test still passed**: the path had changed before the crash, and the error was only logged. The factory now stubs `useLocationPeopleQuery`, `useHouseholdMembersQuery` and the three role mutations, and the test also waits for the page's **Back to locations** link |
| H.6 | The mark shows "on a row with `hasLocationRole: false`" | It did not say what `undefined` gives. It gives no mark (the list cannot say the person has no role). The first tests did not pin it: the mutation `hasLocationRole !== true` left all 101 tests green. A row with no field now sits in `MemberList.test.tsx`, and that mutation turns it red. The mark also shows on the caller's OWN row, for an owner or manager with no location role: they can give themselves one |
| H.6 | Step 1: "test a click" to show "the link must not start a drag" | A click test cannot fail: the `PointerSensor` waits for an 8 px move, so a click never starts a drag, wherever the listeners are. What must be pinned is that the LINK carries no drag listeners. Review of H.6: adding `{...listeners}` to the `<Link>` left all 44 tests in `LocationList` and `locations/index*` green. A test now focuses the name, presses Space (expects no drag overlay copy) and Enter (expects the people page and no reorder). `KeyboardSensor` starts a drag on those keys on any element with the listeners, so the same mutation turns it red (`expected [ <a>, <span> ] to have a length of 1 but got 2`) |
| H.6 | (review) the link's look | The name was underlined on hover only, so at rest it looked like plain text, while "Give a location role" in `MemberList` is underlined at rest. The name is now underlined at rest too. The `ManagerWithPeopleLinks` smoke test checks the `underline` class; `hover:underline` alone turns it red |
| H.6 | (E2E) nothing in the plan | `household-invites.spec.ts:899` reads `members.main().getByText('No location roles')` for the open invite with no location role. Today every person in that test has a location role, so it matches one element. A future fixture with a person who has none would make it match two (Playwright strict mode). Not changed in H.6; noted for H.8 |
| H.7 | T45: "remembers the ids it has seen in the loaded list" | A loaded list can be only the restored Apollo cache (`cache-and-network`, persisted to IndexedDB), which can name a location lost since the last visit. That makes two cases the plan did not name: the first read still in flight (status `loading`, 1), and the first read FAILED offline (status `error`, 8, with the cached list still in `data`). The first version (`isCacheOnly`, "status is `loading`") missed the second; the review proved it (1 → 8, then a refetch answering `[HOME]` showed "You no longer have access to my Garage."). `useLocations()` now gives `isFromServer`: `true` once the status was `ready` with data in this mount. Tests "cached list that still has the location" and "offline, then online"; the old rule turns the second red |
| H.7 | Mutation "toast keyed on the id, not on the loss event → not two toasts" | A guard that takes the id out of the seen set after the toast is never reached: the toast is in the effect run that moves the tab, so a second read (or StrictMode) finds the tab already moved. Removing that guard left all 11 tests green, so it was removed (and put back in the review, see below). What CAN give two toasts is a toast outside that effect run. The mutation "toast from the render body" turns 5 tests red under StrictMode, "not two toasts" among them |
| H.7 | Step 1: the tests go in `useActiveLocation.test.tsx` | They are in a new file, `useActiveLocation.lostAccess.test.tsx`. They need the real `@apollo/client/react` (the leave hook refetches through `useApolloClient`, which `setup.ts` stubs), a `sonner` mock and StrictMode; the old file needs none of them |
| H.7 | Step 1: "the pantry query for K is no longer active" | `PantryData` selects about 30 fields, too many for a `MockedProvider` fixture here. A small `ProbeRows(locationId)` query, gated like every location-scoped read on the active location being in the list, stands in for it. Its row is asserted PRESENT for the new location before the old row is asserted ABSENT |
| H.7 | (re-review) "`ready` with data" means the server answered `GetLocations` | Not always. After a failed first read (status 8), a cache write by ANOTHER answer (`GetHouseholdLocations` writing `Location.myRole`) makes Apollo 4.1.6 read the cache again (`reobserveCacheFirst`) and give `ready` (7) with the RESTORED list. `isFromServer` now counts a `ready` only right after `loading` or `refetch` in this mount. Test "offline … after another answer writes into the cached list"; the old rule turns it red. Test "opened the app offline … once the list was read online"; leaving out `refetch` turns it red |
| H.7 | O27 / T45: the toast for every loss of the active location | They did not name the person's OWN destructive acts. Chosen (review of H.7): no toast when the person deletes the location themselves, and none for a `clear` import, which replaces every location with a new one (the ImportCard `clear` and the post-login copy with `clear`). `lib/seenLocations.ts` (`expectLocationLoss`) marks the ids first; a failed write takes the mark back. A removal or a delete by SOMEONE ELSE still shows the toast. Sign-out (`clearCache`) forgets the seen ids. Known gap: after a sign-out and a sign-in of another person in the SAME household with no reload, that person gets no toast for a location the first person had seen, until a reload |
| H.7 | The mutation list | It had no check for the `mode === 'cloud'` guard. The first local test could not fail: its stored id was never in a list, so `if (true)` left all 11 tests green (review). The test now seeds two local locations, shows the second, then removes it while active; the same mutation turns it red |
| H.7 | (review) the `seen.delete` guard | Put back after the toast, with a comment: it covers a render of higher priority committing before the fallback update lands, which no test can easily show |
| H.8 | Setup: "C joins as `member` with 據點王 on Garage" | C joins with NO role, like B, then makes Garage itself (`createLocation`). So C is Garage's only organizer and OWNER has No access there, which is what tests 4 and 5 need. With a join role on an OWNER-made Garage, OWNER would be an organizer there too |
| H.8 | Test 4: "lands on the list, Garage is gone from C's switcher" | Settings pages show the household sidebar, not the switcher. The first run timed out looking for it. The test now reads `active-location-id:cloud` on the list page, then checks the switcher after `goto('/')` |
| H.8 | Mutation "the web hooks skip the refetch of `GetLocations`" → test 4 red | It stays GREEN on test 4. C's leave ends in a navigation to the list, and the list mounts new `useLocations` readers, whose `cache-and-network` reads `GetLocations` again. A new test 5 has an owner leave their ACTIVE location and stay on the page; the same mutation turns it red (the stored active id stays Garage's) |
| H.8 | The mutation table has no H18 row (the brief asked for one) | On real SQL the H18 filter of `locationPeople` cannot go red alone: `removeMember`, `leaveHousehold` and the E2E cleanup all delete a person's role rows, so no non-member keeps one. Test 7 goes red on it only together with "`removeMember` keeps the role rows" (T11). T11 alone stays green (H18 hides the row, and the join's T20 delete removes it at the rejoin) |
| H.8 | Test 5 (now 6): the `FORBIDDEN` on `itemStocks` as the check of Review Focus 4 | That is a negative control. The test also records every GraphQL request of the owner's tab and checks that the only operation naming Garage is `LocationPeople`; a mutation that adds a `PantryData` read to the page turns it red. After the owner gives themselves Viewer, `itemStocks(Garage)` answers: the positive control |
| H.8 | "the message of O27-A shows once" | A visible toast does not prove "once". The test checks `toHaveCount(1)`; a mutation that calls `toast.info` twice turns it red (strict mode, 2 elements) |
| H.8 | (not in the plan) the toast after the person's OWN leave | The review of H.7 left out the toast for a delete and a `clear` import, not for a leave. O27 names leaving, so test 5 expects "You no longer have access to Garage." after the owner's own leave. Recorded as what the code does, not as a new decision |
| H.8 | Step: also run `settings/locations.spec.ts`, `location-switcher.spec.ts`, `shared-household.spec.ts`, `household-invites.spec.ts`, `settings-global-pages.spec.ts` | Not run in H.8: the task brief allowed only this spec, and H.8 changed no app code, only `e2e/`. H.9's `pnpm test:e2e:all` runs them |

## Status

**Plan written 2026-11-19** on `feature/households-h5c`, based on `develop` at `712f76f6`.
Owner decisions O23–O31 answered 2026-11-19: all A. No task has started.
