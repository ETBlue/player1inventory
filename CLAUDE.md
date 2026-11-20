# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Player 1 Inventory — a grocery and pantry management app. Designed by ETBlue.

## Commands

```bash
pnpm dev          # Start development server (Vite)
pnpm build        # Build for production
pnpm test         # Run ALL tests — web + server (Vitest)
pnpm test:web     # Run web tests only
pnpm test:server  # Run server tests only
pnpm test:watch   # Run web tests in watch mode
pnpm test:ui      # Run web tests with UI browser interface
pnpm test:e2e      # Run E2E tests with Playwright (headless) — ONE project at a time, or narrowed by path
pnpm test:e2e:all  # THE GATE — runs local, cloud and pwa as three separate invocations
pnpm test:e2e:ui   # Run E2E tests with Playwright UI (interactive)
pnpm test:e2e:debug # Debug E2E tests step-by-step
pnpm lint         # Lint with Biome — apps/web/src AND e2e/
pnpm lint:e2e     # Lint e2e/ only (biome lint ./e2e, root biome.jsonc)
pnpm format       # Format with Biome — apps/web/src AND e2e/
pnpm format:e2e   # Format e2e/ only (biome format ./e2e --write, root biome.jsonc)
pnpm check        # Run all Biome checks — apps/web/src AND e2e/
pnpm check:e2e    # Biome check on e2e/ only (biome check ./e2e, root biome.jsonc)
pnpm typecheck    # tsc for apps/web, apps/server and e2e/
pnpm typecheck:e2e      # tsc -p e2e/tsconfig.json (also the last step of pnpm build)
pnpm storybook         # Start Storybook dev server
pnpm storybook:build   # Build Storybook to apps/web/storybook-static/
pnpm design            # Start design guide dev server (Astro/Starlight)
pnpm design:build      # Build design guide to apps/design/dist/
pnpm design:preview    # Preview built design guide locally
pnpm spec:build        # Build the living spec sites from the test reports on disk (spec-dist/, spec-dist-dev/)
pnpm spec:publish      # Run all tests, build, and upload both spec sites to Cloudflare Pages
pnpm test:spec         # Test the spec site scripts in scripts/spec/ (node --test)
```

## Tech Stack

### `apps/web` — Main app
- **Build**: Vite
- **Framework**: React 19 + TypeScript (strict)
- **Routing**: TanStack Router (file-based)
- **Data/State**: TanStack Query + Dexie.js (IndexedDB)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Code Quality**: Biome
- **Testing**: Vitest + React Testing Library

### Service worker and offline

The app is a PWA. `vite-plugin-pwa` builds the service worker in `generateSW`
mode. A service worker only exists in a real build, never on the dev server.

- To test offline behavior, run `pnpm --filter web build && pnpm --filter web preview`.
- If a bad service worker is stuck in a browser, open the DevTools console and
  run `window.__unregisterServiceWorkers()`.
- The cloud Apollo cache is saved in a separate Dexie database named
  `Player1InventoryCloudCache`. It is not part of the app database.

### `apps/design` — Design guide
- **Build**: Astro + Starlight
- **Content**: MDX with React islands for live component demos
- **Tokens**: imported directly from `apps/web/src/design-tokens/` — no duplication
- **Deployed to**: `design.player1inventory.etblue.tw` (Cloudflare Pages)

## Architecture

```
Components → TanStack Query hooks → Dexie.js → IndexedDB
```

Components never access the database directly — they use Query hooks from `src/hooks/`.

## Local Database & Dexie Schema

> See `apps/web/src/db/CLAUDE.md` — schema versioning rules (forward-only, add a version rather than editing one, fresh DBs never run upgrade functions so `on('populate')` must seed too), the v14 `locations` / v15 `Item`+`ItemStock` / v16 global-stock-settings / v18 `Location.isDefault` migrations, the Item/ItemStock join (configuration on `Item`, per-location state on `ItemStock`), and the three cascades.

## Living Spec Site

Test results published as public HTML pages for non-developers, plus the full Vitest UI
report for developers. Built by `scripts/spec/`, published with `pnpm spec:publish`.

| Site | Cloudflare Pages project | Content |
|---|---|---|
| `spec.player1inventory.etblue.tw` | `p1i-spec` | landing page, the three Playwright reports, the feature page (every `apps/web` test whose own title starts with `user `) |
| `dev-spec.player1inventory.etblue.tw` | `p1i-spec-dev` | the full Vitest UI report, behind a secret guard |

> See `docs/global/testing/2026-09-28-living-spec-reports-design.md` for how it works and
> the one-time Cloudflare setup, and the brainstorming log beside it for why.

**Publishing needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment.**
The token has only the Cloudflare Pages: Edit permission and lives in the owner's macOS
Keychain, never in the repo. Do not run `wrangler login`: it saves a broad, account-wide
token in a plain file. `publish.sh` checks the token, the account ID and both Pages
projects before any test runs, and stops in seconds if one is wrong.

**Test names are what non-developers read.** A `user …` title appears on the public
feature page as a sentence; any other title does not appear at all. Name feature tests
`user can …` / `user sees …`. Keep role names (`location viewer cannot …`) for RBAC tests
that really set up that role.

## Backend & Prisma Migrations

> See `apps/server/prisma/CLAUDE.md` — migration safety rules (reset the dev DB after squashing uncommitted `migrate dev` migrations; a migration must be valid on a DB built only from committed history).

## Authorization (cloud)

> See `docs/global/permissions/2026-10-04-households-design.md` (which replaces the role table of `docs/global/permissions/2026-08-29-design-location-rbac.md`). Rights come from roles, not from having created the row. **Households are built in H3a** (merged into `develop` in #375, not deployed; deploy steps in `docs/global/backend/2026-11-11-deploy-runbook-households-h3a.md`). **Shared carts are built in H3b** (merged into `develop` in #377, not deployed; deploy steps in `docs/global/backend/2026-11-15-deploy-runbook-households-h3b.md`): a cart belongs to its location, every cart read and write is scoped by location role, `Cart.userId` is dropped, and `CartItem.userId` means only "added by". **Import and export are built in H4** (merged into `develop` in #382, merge `bf87e839`, not deployed; deploy steps in `docs/global/backend/2026-11-17-deploy-runbook-households-h4.md`). H4 needs the **server before the web**, the opposite of H3a; that runbook says how the two rules fit in one release. Each person still has exactly one household until H5b (invites), so nothing is shared yet in production.
>
> **Roles in the web, read-only views and empty households are built in H5a** (merged into `develop` in #384, merge `4307d30a`, 2026-11-18; not deployed; plan `docs/global/permissions/2026-11-17-households-plan-h5.md`; deploy notes in section 8 of the H4 runbook). **The households release deploys the SERVER first, then the web** (owner decision 2026-11-17, option 4; runbook section 8.3). For that, the server keeps a one-release shim: see *Old-bundle shim* below. What H5a adds:
>
> | Part | What |
> |---|---|
> | `Location.myRole` | the caller's counted location role there, or `null`. `GetLocations` and the three location mutations select it, so the web knows every location role (task F.1) |
> | `Location.hasOrganizer` | `false` when no organizer of the location is still in the household (task F.1) |
> | `householdLocations` | the settings list: every location of the household for an owner or manager (`myRole: null` = "No access"), the switcher's list for a member (tasks F.1, F.3) |
> | `vendorCart` for a `viewer` | an unsaved empty cart instead of `FORBIDDEN`; it creates the cart only for `participant` (task F.2) |
> | `reorderLocations` | refuses a list that is not the household's full set (`BAD_USER_INPUT`, task F.2) |
> | `deleteLocation` | the LAST location can be deleted. `LAST_LOCATION` is gone (decision H13 lifted, task F.7). `lockHousehold` is still taken first |
> | `createVendor(locationId:)` | optional. With no location the vendor is written with no cart. `""` is not "no location": it is refused like any unknown id |
> | web: `usePermissions()` | one hook for "may I edit the catalog" and "may I edit this location" (`apps/web/src/hooks/CLAUDE.md`). It hides controls only; the server checks every write |
> | web: read-only views | a household `member` sees the catalog read-only; a location `viewer` sees that location's stock, carts and cooking read-only; the switcher shows **View only** (`apps/web/src/routes/CLAUDE.md`, *Read-only views by role*) |
> | web: no locations | `NoLocationsGate` shows "You have no locations in this household yet" on Pantry, Shopping, a cart, Cooking and the item Stock and log tabs. A cloud write that needs a location throws `NoCloudLocationError` before anything is sent (`useRequiredCloudLocationId`) |
> | E2E: a browser per user | `newUserContext(browser, userId)` (`e2e/helpers/userContext.ts`) makes a context that acts as `userId`; see *E2E* below and `e2e/CLAUDE.md` |
>
> | Role ladder | Names, weakest first | Governs |
> |---|---|---|
> | `HouseholdRole` (Prisma enum) | `member`, `manager`, `owner` | the catalog, the household and its locations list |
> | `LocationRole` (Prisma enum) | `viewer`, `participant`, `organizer` | one location's stock, carts and logs |
>
> All checks go through `apps/server/src/lib/authz.ts`:
>
> | Helper | What it does |
> |---|---|
> | `requireHousehold(ctx)` | the caller's household id. Also first sign-in: it calls `ensureHousehold` (`lib/household.ts`), which makes the household and its first location, "Home", once, guarded by the `User.householdSetupAt` claim. Since H5b task G.2 a person in several households gets one fixed answer (decision T14): `User.activeHouseholdId` while they are still a member there, else the oldest membership by `joinedAt`, then `householdId`. One `user.findUnique` on the common path |
> | `requireHouseholdRole(ctx, householdId, role, db?)` | refuses with `FORBIDDEN` unless the caller's household role is `role` or stronger. Inside an interactive transaction pass its `tx` as `db` (since H5b task G.5), so the read uses the transaction's connection |
> | `requireCatalogRole(ctx, role)` | both of the above; returns the household id. Catalog reads ask `member`, writes `manager` |
> | `requireLocationRole(ctx, locationId, role)` | refuses unless the caller has `role` or stronger on that location. A location role counts only while the matching `HouseholdMember` row exists (decision H18) |
> | `locationIdsWithRole(ctx, role?, { householdId }?)` | every location the caller has a counted role on, optionally only in one household (since H4 task E.1). Use it for a read across locations; never write a new membership query. The five reads behind an export (`locations`, `inventoryLogs`, `allCarts`, `allCartItems`, `allItemStocks`) pass `{ householdId: await requireHousehold(ctx) }` since H4 task E.5, so they give one household only. Since H5 task F.2 so do `cartItemCountByItem` (with no `locationId`) and `itemStocksForItem`; the copy-on-add of `addItemToLocation` and `checkout` passes the TARGET location's household (`householdOfLocation`), not the caller's |
> | `locationRolesByLocation(ctx, householdId)` | the caller's counted role on each location of ONE household, as a `Map`. Read once per household per request (`ctx.requestCache.locationRoles`). `Location.myRole` reads it (since H5 task F.1) |
> | `locationIdsWithOrganizer(ctx, householdId)` | the locations of one household with an organizer who is still in it (decision H18 applied to the ORGANIZER, through `countedOrganizerIn`) and whose account is not deleted (`User.deletedAt` is null; households H6b task K.2, decision T61). Cached the same way. `Location.hasOrganizer` reads it (since H5 task F.1) |
> | `forgetLocationRoles(ctx)` | clears both role caches above. **No resolver calls it.** `forgetRolesAroundEach` (`lib/mutationRoleCache.ts`) wraps the whole `Mutation` map in `resolvers/index.ts` and calls it before and after EVERY root mutation field, also when the field throws. The root fields of one mutation share the cache, so without it `a: createLocation … b: createLocation …` gives `b` `myRole: null`. A new writer of a `LocationMember` or `HouseholdMember` row (H5b's join, remove, leave) needs nothing extra. `lib/mutationRoleCache.test.ts` calls every `Mutation` field of the executable schema with no user and fails if one leaves a cache filled. That proves only that at least one forget runs for each field (every field is wrapped): with no user a field throws before it reads anything, so the forget before OR the one after is enough. The before half, the after half and the throw case are pinned by their own unit tests of `forgetRolesAroundEach` in the same file. (Between the review of H5 task F.1 and the review of F.2, five resolvers called it by hand and a SOURCE-TEXT guard, `role-cache.guard.test.ts`, checked them. The guard missed a write through a helper, a call that was only a comment, and more, so it was replaced.) Since H5b task G.2 it also forgets `householdId` (decision T15): a join, leave, removal or create changes the caller's household, so a later root field must read it again. So a household pinned on `requestCache` holds for a query but NOT for a `Mutation` field; a test that needs one person to act in one of two households sets `User.activeHouseholdId` instead (`world.setActiveHousehold` in `src/test/householdWorld.ts`) |
> | `roleAtLeast(role, min)` | `true` when a location role is `min` or stronger. For a resolver that asks a low role and does more for a higher one: `vendorCart` asks `viewer` and creates a missing cart only for `participant` (since H5 task F.2) |
> | `requireLocationInHousehold(ctx, locationId, householdId)` | the location is in that household (one scoped read, `FORBIDDEN` otherwise). Since H4 task E.1. A person in two households holds roles in both, so `requireLocationRole` alone cannot say which household a location is in |
> | `requireLocationItems(ctx, locationId, itemIds)` | every item is in the location's household. Call it AFTER `requireLocationRole` |
> | `requireCatalogIds(ctx, householdId, model, ids)` | every id a write attaches is in the household (#273) |
> | `requireOwnRowOrUnclaimed(ctx, model, id, targetHouseholdId)` | see the next paragraphs. The fourth argument is the household the write goes INTO, since H4 task E.1 |
>
> **Invites, join, members and the no-household screen are built in H5b** (merged into
> `develop` as #385, merge `938fa2aa`, 2026-11-18; not deployed; plan
> `docs/global/permissions/2026-11-18-households-plan-h5b.md`; deploy notes in section 9 of
> the H4 runbook). One migration, `20261118000000_add_household_invites` (table
> `HouseholdInvite`, column `User.activeHouseholdId`), deploys with the server. Since H5b a
> person CAN be in two households. What H5b adds:
>
> | Part | What |
> |---|---|
> | which household (decision T14) | `requireHousehold` picks `User.activeHouseholdId` while the person is still a member there, else the oldest membership. See `requireHousehold` in the table above |
> | one lock order (decision T16) | the `User` row (`lockUser`) before any household row (`lockHouseholds`, sorted by id). See *Joining a household* below |
> | 3 queries | `householdInvites` (owner and manager; a manager sees `member` invites only, O15-A). The `token` is on the `HouseholdInvite` type only, so only this query and the `createInvite` answer carry it, `invitePreview(token)` (`requireAuth` only, never throws for a token: `status` is `VALID`, `ALREADY_MEMBER` or `INVALID`, and `INVALID` carries no name), `householdMembers` (any household role, no e-mail) |
> | 7 mutations | `createInvite` and `revokeInvite` (`resolvers/invite.resolver.ts`, task G.3), `joinHousehold` (G.4), `setHouseholdRole`, `removeMember`, `leaveHousehold`, `createHousehold` (`resolvers/household.resolver.ts`, G.5). All seven publish household-level `LOCATION` after the commit (decision T19), so the live guard holds **69** fields. `revokeInvite` answers `false`, not an error, for every invite this caller may not revoke (unknown, another household's, used, revoked, or a `manager` invite for a manager) |
> | refusals (decision T18) | `BAD_USER_INPUT` with `extensions.reason`: `INVITE_INVALID` (one answer for unknown, expired, used and revoked), `ALREADY_MEMBER`, `ALREADY_IN_HOUSEHOLD`. Role refusals stay `FORBIDDEN`. A person in no household gets `NO_HOUSEHOLD` (a `GraphQLError` code) |
> | web: the household guard | `HouseholdChangeGuard` (`apps/web/src/apollo/householdGuard.ts`, decision T23) clears the Apollo cache and reloads when the server answers another household id. It cannot see a move into NO household; `NoHouseholdGate` clears the cache then. See `apps/web/src/routes/CLAUDE.md`, *Join Page* and *No household* |
> | web: pages | `/join/$token`, `/sign-in?redirect=` (`safeRedirectPath`), `/settings/household/members` (cloud only), the no-household screen (`apps/web/src/routes/settings/CLAUDE.md`, `apps/web/src/components/CLAUDE.md`) |
> | E2E | `household-invites.spec.ts`, 8 cloud tests; see *E2E* below and `e2e/CLAUDE.md` |
>
> **Joining a household (households H5b task G.4).** `joinHousehold(token)` in
> `resolvers/invite.resolver.ts` is one transaction, and it never calls `requireHousehold`
> (decision T22). Two rules from it hold for every later writer:
>
> | Rule | Why |
> |---|---|
> | **One lock order: `lockUser` (the `User` row) first, then household rows, sorted by id (`lockHouseholds`).** Only `joinHousehold` and `createHousehold` take `lockUser`. Never write a `User` row after a household lock unless `lockUser` is already held. **One write breaks this and cannot be avoided: deleting a household also writes every `User` row that names it**, because `User.activeHouseholdId` is `onDelete: SetNull` and a person who left or was removed still names it. So `joinHousehold` retries its whole transaction ONCE on Prisma's `P2034` (`retryOnceOnConflict` in `resolvers/invite.resolver.ts`) | locks taken in opposite orders give a Postgres deadlock (`40P01`), which Prisma reports as `P2034`. The helpers are in `lib/household.ts` |
> | **`joinHousehold` locks every household it may delete**, in the same sorted call as the household it joins | without it, a person joining the joiner's empty own household at the same moment could commit between the "is it empty" check and the delete, and lose their new membership with it |
> | **`joinHousehold` sets the first sign-in claim** (`User.householdSetupAt`) when it is still null | a person can join before any request made them a household. Without the claim, after a later leave or removal `ensureHousehold` would make them a new household instead of answering `NO_HOUSEHOLD` |
> | **A new model that belongs to a household or a location must be added to `emptyHouseholdWhere`** (`lib/invite.ts`) | the join deletes the joiner's own household when that `where` matches (decision T21). A household holding only data of a model the `where` does not name would be deleted |
>
> The fakes model that `where`: `householdFake` throws on any key of it that it does not
> model, and reads the other models' rows from `householdWorld`'s `contents` store
> (`world.contents.rows`). A test that `extend`s the world with its own `item` or `cart`
> model must ALSO put rows in `contents`, or the "is it empty" check will not see them.
>
> **Members, roles, leaving and creating (households H5b task G.5).** In
> `resolvers/household.resolver.ts`, tested in `household-members.resolver.test.ts`:
>
> | Field | Who | What it does |
> |---|---|---|
> | `householdMembers` | any household role (owner decision O13-A) | every person whose account is not deleted (since households H6b task K.2, decision T61; the Add person list is built from it): `userId`, `displayName`, `role`, `joinedAt`, `isMe`, and since households H5c task H.2 `hasLocationRole` (`true` when the person has a counted role on at least one location of this household; one read for the whole list, decision T40). Owner first, then by `joinedAt`, then by `userId`. `HouseholdPerson` has NO e-mail field, and the name read selects `{ id, displayName }` only. `setHouseholdRole` returns a `HouseholdPerson` too, so it reads `hasLocationRole` the same way, after the commit |
> | `setHouseholdRole(userId, role)` | owner | `member` ↔ `manager`. `role: owner` and the owner's own row are `BAD_USER_INPUT`; a person not in the household is `FORBIDDEN`. The same role again changes no member row and publishes nothing (the lock's `UPDATE` still moves `Household.updatedAt`). Location roles and open invites stay (a demote is not a removal; owner decision O20) |
> | `removeMember(userId)` | owner: anyone but themself (`BAD_USER_INPUT`); manager: only a `member` | deletes the person's `LocationMember` rows on THIS household's locations, revokes every open invite of THIS household they made (owner decision O20, which replaced O18-A; decision T30), then deletes their member row (decision T11). All in one transaction |
> | `leaveHousehold` | manager or member; the owner gets `BAD_USER_INPUT` | the same deletes and the same invite revoke, for the household the caller acts in |
> | `createHousehold(name)` | a person in NO household (owner decision O16-A); else `BAD_USER_INPUT`, `extensions.reason` `ALREADY_IN_HOUSEHOLD` | `lockUser`, the first sign-in claim, the membership count, then `createHouseholdFor` (`lib/household.ts`, shared with first sign-in), then `activeHouseholdId`. It never calls `requireHousehold` (decision T22) |
>
> The first three take the household lock first (`lockHouseholdOrForbid` in `lib/household.ts`,
> which uses `lockHouseholds`;
> a household deleted since `requireHousehold` found it gives `FORBIDDEN`, not Prisma's
> `P2025`) and NEVER write a `User` row (decision T16), so
> the person's `activeHouseholdId` may still name the household they left. `ensureHousehold`
> ignores it, because it requires a current membership. They read the caller's role with
> `requireHouseholdRole(ctx, householdId, role, tx)`: the optional fourth argument makes the
> read use the transaction's own connection, not a second one from the pool. The test file
> gives the global `prisma` mock its own copy of each model object over the same stores, so a
> spy on `prisma.householdMember` sees only reads outside a transaction (a read that forgot
> `tx`), and a spy on `world.client.householdMember` only reads through `tx`. All four
> publish household-level `LOCATION` after the commit. **A removed or leaving person's open
> tabs do not hear it**: `shouldDeliver` checks membership, and they are no longer members
> (tested; the H5a known gap is still open). Their next request shows the right screen.
>
> **The location people page is built in H5c** (merged into `develop` as #391, merge
> `7dbaeca9`, 2026-11-20; branched from `develop` at `712f76f6`; not deployed; plan
> `docs/global/permissions/2026-11-19-households-plan-h5c.md`; deploy notes in section 10 of
> the H4 runbook). No migration. The new web bundle selects a new query and a new field, so
> the **server deploys before the web**. What H5c adds:
>
> | Part | What |
> |---|---|
> | the rule (decision T33) | ONE pure function, `canChangeLocationRole({ householdRole, callerRole, from, to })` in `packages/types/src/locationRoles.ts`. A household owner or manager may make any change, to anyone, themselves too. A location organizer may give, change and remove `participant` and `viewer` only, never `organizer`, and never their own organizer row. The TARGET's household role does not count (owner decision O30-A). The server check and the web's buttons both call it. The location ladder (`LOCATION_ROLE_RANK`, `locationRoleAtLeast`) lives in the same file, and `lib/authz.ts` and `apps/web/src/lib/locationRole.ts` use it instead of their own copies (task H.1) |
> | `locationRoleOf(ctx, locationId, db?)` | `lib/authz.ts`, task H.1. The caller's counted role on a location, or `null`. Unlike `requireLocationRole` it does not refuse: "no role" is a valid input to the rule. It does not check WHICH household the location is in, so a caller that must stay in one household checks that first |
> | 1 query | `locationPeople(locationId)` (`resolvers/location.resolver.ts`, task H.2): every person with a COUNTED role on the location (decision H18 applied to each row; since households H6b task K.2 also not a deleted account), organizers first, then by name, then by id; `userId`, `displayName`, `role`, `isMe`, no e-mail. Who may read it (owner decision O24-A): anyone with a role there, and every household owner and manager, also on a No access location. They get names and roles only, never the location's stock, carts or logs. Anyone else, another household's location and an unknown id all get the same `FORBIDDEN` |
> | 1 field | `HouseholdPerson.hasLocationRole` (task H.2), for the "No location roles" mark on the Members page (owner decision O28-A). See the `householdMembers` row above |
> | 3 mutations | `setLocationRole(locationId, userId, role)`, `removeLocationRole(locationId, userId)`, `leaveLocation(locationId)` (`resolvers/location.resolver.ts`, task H.3). Each takes the household lock FIRST (`lockHouseholdOrForbid`, moved from `household.resolver.ts` to `lib/household.ts` in task H.1), then reads the location, the caller's roles and the target's membership through `tx` (decision T34). Only a location of the household the caller acts in (decision T35). Each publishes ONE household-level `LOCATION` after the commit, and only when something changed (decision T36), so the live guard holds **72** fields |
> | "nothing to do" (decision T38) | `setLocationRole` with the role the person already has: no write, no event, the row comes back. `removeLocationRole` with no role row: `false`, but only to a caller who may read the location's people (O24-A); anyone else gets `FORBIDDEN`, so the answer cannot tell them who has a role. `leaveLocation` with no role: `false` |
> | what a remove deletes (decision T42) | ONE `LocationMember` row. Carts, cart rows, stock and logs stay. Any role may leave, the only organizer too (owner decision O25-A); the location then shows **No organizer** |
> | the race with `removeMember` | both writes take the household lock, so a role given at the same moment as a removal waits, then finds the person is not a member and refuses. Proved by call order in `location-people.resolver.test.ts` only: the Prisma fake has no row lock |
> | web | the page `/settings/household/locations/$id` (cloud only; local mode redirects to the list), the name links on Settings › Locations, the Members page mark, the hooks in `hooks/useLocationPeople.ts`, `usePermissions().canOpenLocationPage` and `.canChangeRole`, and a toast when a tab loses its active location (owner decision O27-A). See `apps/web/src/routes/settings/household/locations/CLAUDE.md`, `apps/web/src/hooks/CLAUDE.md` and `apps/web/src/routes/CLAUDE.md` |
> | E2E | `location-people.spec.ts`, 9 cloud tests, up to two browsers; see `e2e/CLAUDE.md` |
>
> **`refetchAfterWrite` now waits for each read on its own** (`apps/web/src/apollo/refetchAfterWrite.ts`,
> fixed in task H.4). It waited for `client.refetchQueries()`, which is a `Promise.all`, so it
> stopped waiting at the FIRST read that failed. After a participant leaves a location the
> `LocationPeople` read is always `FORBIDDEN`, so `leave()` resolved and `isPending` went
> false about 100 ms before `GetLocations` landed. It now waits for every read, and still
> never rejects. This is a shared helper, so it changes the 7 older write hooks too, but only
> when one read fails while another is still open. Tested in
> `apps/web/src/apollo/refetchAfterWrite.test.ts`.
>
> **The activity log, the purges and the danger zones are built in H6a** (on
> `feature/households-h6a`, from `develop` at `7dbaeca9`; merged into `develop` (2026-11-20, #392, merge `c0f096ed`), not deployed; plan
> `docs/global/permissions/2026-11-20-households-plan-h6.md`, tasks J.1 to J.9; deploy notes
> in section 11 of the H4 runbook). **One additive migration**,
> `20261120000000_add_household_activity`: one enum (`ActivityAction`, 19 values, H6b's six
> included) and one table (`HouseholdActivity`). It deploys with the server, and the
> **server deploys before the web**. Owner decisions O32 to O39: all A. What H6a adds:
>
> | Part | What |
> |---|---|
> | the table (decision T46) | `HouseholdActivity`: `id`, `householdId` (the ONLY foreign key, `ON DELETE CASCADE`), `actorId`, `action`, `targetUserId?`, `locationId?`, `details` (JSONB), `createdAt`. `actorId`, `targetUserId` and `locationId` have NO foreign key on purpose: a log row must outlive the person and the location it names, and a key to `User` would block `/e2e/cleanup`. A location's name is stored in `details` when the row is written. Index `(householdId, createdAt DESC, id)`. No retention limit (T48). It is NOT in `emptyHouseholdWhere` (T49): a household holding only log rows is still "empty" for a join |
> | `recordActivity(tx, entry)` (decision T47) | `apps/server/src/lib/activity.ts`, the ONLY writer. It takes the transaction client, never the global `prisma`, and every logged write calls it as the LAST step of its own transaction. So a log row for a change that rolled back cannot exist. `createInvite` and `revokeInvite` became interactive transactions for this |
> | what is logged (decision T51, task J.2) | the 3 location role writes, `setHouseholdRole`, `createInvite`, `revokeInvite`, `joinHousehold`, `leaveHousehold`, `removeMember`, `clearAllData`, the 2 new purges and `recordImport`. NOT logged: `createLocation`'s organizer row for its creator, `createHousehold`, renames, item and stock writes (those are in `InventoryLog`). `deleteHousehold` writes no row: the cascade deletes the log with the household |
> | 1 query (decisions T53, T54, task J.3) | `householdActivity(before: ID, first: Int)` (`resolvers/activity.resolver.ts`, `schema/activity.graphql`). Owner or manager of the caller's household; anyone else `FORBIDDEN`. Newest first by `(createdAt, id)`. `first` defaults to 50, at most 200; 0 or less is `BAD_USER_INPUT`, and so is an unknown or another household's `before`. Each `HouseholdActivityEntry` has typed fields (`actorName`, `actorIsMe`, `actorDeleted`, `targetName`, `targetIsMe`, `targetDeleted`, `locationName`, `fromRole`, `toRole`, `householdRole`, `count`, `importCounts`); the web builds one translated sentence from them. A deleted account shows its stored name with "(deleted account)" after it (O35-A) |
> | 4 mutations (decision T55, owner decisions O33, O34, O38, tasks J.2 and J.4) | `deleteAllLocations` (owner; every location of the household goes, with its stock, carts, logs and role rows; the catalog stays; no new "Home", O34-A). `removeAllLocationItems(locationId)` (organizer of that location, in the household the caller acts in; deletes its `ItemStock` rows and the `CartItem` rows of its carts; keeps the `Cart` rows with `lastPurchasedAt`, the logs and the roles). `deleteHousehold` (owner; the household and all its data, O38-A). `recordImport(counts: ImportCountsInput!)` (owner or manager; one `IMPORT` row per import, O33-A; the web calls it once at the end of `importCloudData`). The two purges answer `false`, with no log row and no event, when there was nothing to delete |
> | one ordered delete (decision T64) | `deleteHouseholdData(tx, householdId)` in `lib/household.ts`: the fourteen `deleteMany` of a household's data, `tag` before `tagType` (`Tag.type` is `NoAction`). `clearAllData` and `deleteHousehold` both call it. `verify-migration.ts` keeps a copy |
> | the lock order (decision T52) | `clearAllData`, `renameHousehold`, `deleteAllLocations`, `deleteHousehold` and `deleteLocation` take `lockHouseholdOrForbid` FIRST in their transaction, and read the caller's role AFTER it, through `tx`. So a household deleted since `requireHousehold` gives `FORBIDDEN`, not Prisma's raw `P2025` (the H5b known gap), and a role taken away at the same moment is seen. `removeAllLocationItems` takes the same lock and reads the location and the role through `tx` (`locationRoleOf(ctx, id, tx)`) |
> | `deleteHousehold` and the `User` rows | it clears every `User.activeHouseholdId` that names the household BEFORE it takes the household lock, so the order "User rows, then households" (decision T16) still holds, and it retries once on `P2034`. It also checks the owner role EARLY, with the global client, before the transaction, so a manager or member never writes another person's `User` row. The check after the lock is still the one that counts |
> | live events (decision T57) | `deleteAllLocations` publishes household-level `LOCATION`. `removeAllLocationItems` publishes `STOCK` and `CART` at that location, each only when it changed rows. `recordImport` and `deleteHousehold` publish nothing (in `publishesNothing`; after a household delete nobody is a member, so an event would reach nobody). The web's `HouseholdActivity` query refetches on `LOCATION`, `CATALOG`, `STOCK` and `CART` |
> | web (tasks J.5 to J.7) | the page `/settings/household/activity` (cloud only, owner and manager; `ActivityList`), an **Activity** item in the household sidebar and the mobile accordion, a danger zone on the household page (`HouseholdDangerZone`: **Clear household**, **Delete all locations**, **Delete household**, owner only) and one on the location people page (`LocationDangerZone`: **Remove all items**, organizer only). Every purge asks for the household or location name, typed exactly (the web only, T56; `DeleteButton`'s new typed-name mode). Hooks: `useHouseholdActivity`, `usePurges.ts`; `usePermissions().canReadActivity`, `.canPurgeHousehold`, `.canRemoveAllItems(locationId)`. See `apps/web/src/hooks/CLAUDE.md`, `apps/web/src/components/CLAUDE.md` and `apps/web/src/routes/settings/CLAUDE.md` |
> | E2E (task J.8) | `household-activity-purges.spec.ts` (7 cloud tests, up to two browsers), 2 more tests in `purge-two-households.spec.ts` (the new purges with two households, on real SQL), and an activity row read back in `cleanup-endpoint.spec.ts`. See `e2e/CLAUDE.md` |
>
> **Counts after H6a**, measured 2026-11-20 on `feature/households-h6a`. Count them again
> rather than quote them:
>
> | Count | Value | Command |
> |---|---|---|
> | live guard fields | **76**: 74 in `publishes`, 2 in `publishesNothing` (`recordImport`, `deleteHousehold`) | `awk '/^const publishes: /,/^}/' apps/server/src/resolvers/live-publish.guard.test.ts \| grep -cE '^  [a-zA-Z]+: \{'` |
> | models `/e2e/cleanup` deletes | **20** | `grep -o 'prisma\.[a-zA-Z]*\.deleteMany' apps/server/src/lib/e2eCleanup.ts \| sort -u \| wc -l` |
> | `await requireCatalogRole(ctx, 'manager')` in `import.resolver.ts` | **23**: the 22 bulk import mutations and `recordImport` | `grep -c "await requireCatalogRole(ctx, 'manager')" apps/server/src/resolvers/import.resolver.ts` |
> | `.graphql` schema files | **14** (`activity.graphql` is new) | `ls apps/server/src/schema/*.graphql \| wc -l` |
>
> **`removeItemFromLocation` needs `organizer`, not `participant`** (owner decision 2026-11-11, `f4d993db`). It deletes every log of the item at that location, including other members' logs.
>
> **`ItemStock` carries no `userId` column at all**, by design from before households. It is scoped *through* its location: `requireLocationRole` for one location, `locationIdsWithRole` for several. Do not add a `userId` column there.
>
> History: until H3a this section said households were "decided, not yet built", that cloud models were "scoped by a flat `userId`", and that `requireLocationRole` was "the one function body RBAC will fill in". All three were true then and are not now. `Location` and the six catalog models have no `userId` column since the `drop_user_scope` migration (H3a task 3.14).
>
> **Never write `row.userId === ctx.userId` or `row.householdId === …` as an authorization check.** It denies a legitimate `member` editing a shared location's data, which is the point of the feature. Every check goes through a helper in `lib/authz.ts`. A `where` filter on a read is fine. Local mode is single-user IndexedDB and is out of scope: no role check belongs in `apps/web/src/db/`.
>
> **There is a second seam: `requireOwnRowOrUnclaimed` in `apps/server/src/lib/authz.ts`.** Added 2026-10-28 (issue #327). It decides ownership for the **nine models an import writes by the id in the file**. `requireLocationRole` alone cannot decide these, because an import must tell a free id from a taken one. (This said "the nine models that belong to no location" until H4 task E.1. That was wrong: `Cart`, `CartItem`, through its cart, and `InventoryLog` all have a location.) The nine: `Item`, `Tag`, `TagType`, `Vendor`, `Recipe`, `InventoryLog`, `Cart`, `CartItem`, `Shelf`. One row id gets one of three answers — the caller's own row returns `'own'`, somebody else's row **throws** `FORBIDDEN`, an id no row holds returns `'unclaimed'`. The "somebody else's" case throws instead of returning, so a call site cannot ignore it. No call site compares a `userId`.
>
> **Its body is what changes when the scope changes**, and no call site moves. That is why the model is passed as a string literal (`OwnedModel`) rather than a delegate. It was `where: { id, userId }` for all nine until H3a.
>
> **Since households H3a task 3.7 the body has two scopes.** For the six catalog models (`Item`, `Tag`, `TagType`, `Vendor`, `Recipe`, `Shelf` — the `CatalogModel` type) "own" means **in the caller's household** (`where: { id, householdId: await requireHousehold(ctx) }`), so a row another member of the household made is `'own'`. `InventoryLog` used `where: { id, userId }` until H4. The helper checks no household ROLE; the catalog resolvers check it first, and since H4 task E.3 so do the 22 import mutations (see *The import role gate* below). No call site moved, including the 22 import mutations.
>
> **Since households H4 task E.1 the scope is the TARGET household, passed as a fourth argument** (decisions T4–T6 in `docs/global/permissions/2026-11-16-households-plan-h4.md`). The six tag / vendor call sites pass the id `requireCatalogRole` returned, and since task E.3 so do the 22 import mutations (`requireCatalogRole(ctx, 'manager')`). (Between E.1 and E.3 the import helper passed `requireHousehold(ctx)`.) With `writable` = the target household's locations where the caller is `participant` or higher: catalog rows `{ id, householdId: target }`; `InventoryLog` `{ id, locationId: { in: writable } }`; `CartItem` `{ id, cart: { locationId: { in: writable } } }`. `InventoryLog.userId` means "written by" and is never a scope. **`Cart` is checked in a fixed order (issue #361):** an id with no colon is `BAD_USER_INPUT`; a prefix not in `writable` is `FORBIDDEN` BEFORE the cart table is read; only then the unscoped "is it taken" read; and "own" means the stored cart is at the location its id names (`{ id, locationId: prefix }`). So a bare cart id, or a cart id naming a deleted location, no longer falls back to the caller's first location: the batch is refused. Since task E.3 the fallback itself (the import fallback location of decision H12) is deleted, for logs too.
>
> **Since households H3b task B.7, `Cart` and `CartItem` are scoped by location role, not by account.** A cart is `'own'` when the caller is `participant` or higher on its location; a cart item is `'own'` when its CART is. A row at a location where the caller is only `viewer`, has no role, or that belongs to another household throws `FORBIDDEN`. An unused id is `'unclaimed'`. `CartItem.userId` means "added by" and is never a scope, so a row another member added to a shared cart is `'own'`. Inside `requireOwnRowOrUnclaimed` the participant list is `locationIdsWithRole(ctx, 'participant', { householdId })`, the TARGET household's locations only, since H4 task E.1 (it was `locationIdsWithRole(ctx, 'participant')`, every household, until then). So a cart or cart item of the caller's OTHER household is refused too. With no role argument `locationIdsWithRole` still returns every location with any role.
>
> **The two cart item imports follow decision P3 of the H3b plan** (`docs/global/permissions/2026-11-14-households-plan-h3b.md`). Rows of one `(cartId, itemId)` pair are summed first. Every write is ONE `upsert` on `cartId_itemId`, never a write by the payload's id, so no path raises `P2002`. `bulkCreateCartItems` (`skip` and `clear`) skips a pair whose ids include one already in the cloud, and otherwise ADDS (`increment`). `bulkUpsertCartItems` (`replace`) SETS the pair's amount. Neither moves a row: a payload that names an existing id under another pair writes that pair and leaves the stored row where it is. A new row takes the lowest unused id of its pair. Since H3b task B.8 the web sends EVERY cart item to `bulkUpsertCartItems` on `replace`, so a new id whose pair already has a row SETS it (before B.8 it went to `bulkCreateCartItems` and ADDED). On `skip` the web drops a whole pair when any of its ids is already in the cloud, the same rule the server applies (`partitionPayload` in `apps/web/src/lib/importData.ts`). Local mode follows the same rules (`importLocalCartItems`, and Dexie versions 19 and 20; see `apps/web/src/db/CLAUDE.md`).
>
> **The catalog (task 3.7).** Every catalog resolver starts with `requireCatalogRole(ctx, role)` (`lib/authz.ts`), which returns the caller's household id: reads ask for `member`, writes for `manager` (design, *Household roles*). The one exception is marking a recipe as cooked (`updateRecipeLastCookedAt`, and the `lastCookedAt` write in `consumeRecipes`), which needs only `member`, because it is a cooking right. Every id a write ATTACHES — an item's `tagIds` / `vendorIds`, a recipe's item ids, a shelf's `itemIds` and `filterConfig` ids, a tag's `typeId` / `parentId`, `applyShelfFilterPicks`' picks — goes through `requireCatalogIds(ctx, householdId, model, ids)` (issue #273): another household's id is `FORBIDDEN`, an id no row holds is `BAD_USER_INPUT`, except on the shelf arrays (`{ missing: 'allow' }`), which are not foreign keys and may name a deleted item. The three `itemCountBy*` queries filter the junction row by `item: { householdId }`. Tested with three people in `apps/server/src/resolvers/catalog-household.resolver.test.ts`.
>
> **One thing it does NOT share with `requireLocationRole`: a free id is distinguishable from a stranger's id.** `requireLocationRole` refuses "not found" and "not yours" with the same error on purpose. `requireOwnRowOrUnclaimed` cannot: an import has to create new rows, so an unclaimed id must return `'unclaimed'` and let the write proceed. What protects the ids: an id made by the server (`cuid()`) or by local mode (`crypto.randomUUID()`) cannot be guessed, and the refusal names neither the model nor the owner. That is NOT true for `Cart.id`, which is derived from a location id and a vendor id, nor for an id a hand-edited file chooses. For carts the protection is the location check that runs before the cart table is read (since H4 task E.1). Do not copy `requireLocationRole`'s stated reason onto this helper — the first version of its comment and of the design doc both did, and both were wrong.
>
> **The import role gate (households H4 task E.3).** Every one of the 22 bulk import mutations starts with `requireCatalogRole(ctx, 'manager')`, right after `requireAuth` and before the empty-batch return. So only a household owner or manager may import, and a `member` is refused with `FORBIDDEN` before any other read, even a member who organizes a location (decision O7). `clearAllData`, which the `clear` strategy runs first, asks `owner`. The id `requireCatalogRole` returns is the TARGET household, and every check in the mutation gets it: the row-id guard, `resolveLogLocations`, `resolveCartLocations`, `requireOwnLocationIdsOrUnclaimed`, `requireOwnItemStockRefs` and `resolveCartItemParents`. So a location, a stored row and an item must all be in that one household (issue #381, gap 1). `createVendor` also checks its location with `requireLocationInHousehold` (gap 2). Nothing goes to a fallback location any more:
>
> | Import row | Answer |
> |---|---|
> | a log with no `locationId` | `BAD_USER_INPUT`, `extensions.reason` `IMPORT_NEEDS_LOCATION`, nothing in the batch written |
> | a cart id with no `:` | `BAD_USER_INPUT`, before any read |
> | a log, stock row or cart at a location that does not exist, where the caller is below `participant`, or of another household | `FORBIDDEN`, nothing written |
> | a location id `'local'` or containing `:` | `BAD_USER_INPUT`, before any read |
> | an existing location of another household | `FORBIDDEN` (it was skipped, or renamed by `bulkUpsertLocations`, when the caller held a role there) |
>
> Tested in `apps/server/src/resolvers/import-role-gate.resolver.test.ts`, with one person in two households and the target chosen by that person's `User.activeHouseholdId` (since H5b task G.2; a pin on `ctx.requestCache.householdId` is forgotten before every `Mutation` field, decision T15). **A test cannot yet tell "the target household" from "the caller's household"**: until H7's household switch both are `requireHousehold(ctx)`. What the tests do prove is that the location and the item must be in the SAME household as the target.
>
> **The `importCheck` query (households H4 task E.2, decision T1).** A refused import used to be refused per batch of 50, so the batches sent before it stayed written and "Nothing was imported" was not true. Now the web asks first. `importCheck(ids: ImportCheckInput!, forClear: Boolean): ImportCheck!` (`apps/server/src/resolvers/importCheck.resolver.ts`) is read-only. It starts with `requireCatalogRole(ctx, forClear ? 'owner' : 'manager')`, takes the file's ids per model plus `locationRefs` and `itemRefs` (the location and item ids that rows POINT at), at most **1000** ids per call (the web sends chunks and joins the answers, `checkImportIds` in `apps/web/src/lib/importData.ts`). It answers `anotherHousehold`, `blockedLocationIds` (below `participant`), `renameBlockedLocationIds`, `missingLocationIds`, `missingItemIds` and `blockedRows`. When `anotherHousehold` is true the web stops before `clearAllData` and before the first batch, so nothing is written. Otherwise the web leaves out the blocked and missing rows and names the skipped locations after the import (decision O5). **It is a convenience, not a guard** (decision T2): a client can skip it, and the 22 mutations still check every row. It compares households in SQL, inside the resolver; no call site compares a `householdId`. Like the cart guard, it reads a cart id only when its prefix is a location the caller may write (or one the file creates). The web also uses it to list the locations "Import into which location?" offers (`fetchImportTargetLocations`). It did this because the web did not know location roles in H4. Since H5 task F.1 `GetLocations` carries `myRole`, but the dialog still asks `importCheck`: its answer also leaves out a location deleted since the list was read. **A new web bundle against an older server cannot import at all**, because the query fails GraphQL validation; that is why H4 deploys the server first (decision T9).
>
> **22 bulk import mutations in `apps/server/src/resolvers/import.resolver.ts` are guarded.** Counted 2026-10-28, and the same on 2026-11-04 after households H3a task 3.9, on 2026-11-15 after households H3b tasks B.7 and B.10, and on 2026-11-17 after households H4: **18** through `requireOwnRowOrUnclaimed` (reached by the per-batch `requireOwnRowIdsOrUnclaimed` in that file), **2** through `requireOwnLocationIdsOrUnclaimed`, **2** through `requireOwnItemStockRefs`. Several task briefs said 18, which is only the first group. Count them rather than quoting this:
>
> ```bash
> grep -c 'requireOwnRowIdsOrUnclaimed(ctx' apps/server/src/resolvers/import.resolver.ts      # 18
> grep -c 'requireOwnLocationIdsOrUnclaimed(ctx' apps/server/src/resolvers/import.resolver.ts # 2
> grep -c 'requireOwnItemStockRefs(ctx' apps/server/src/resolvers/import.resolver.ts          # 2
> grep -c "await requireCatalogRole(ctx, 'manager')" apps/server/src/resolvers/import.resolver.ts  # 23 since H6a: the 22 above, plus recordImport
> ```
>
> **Six catalog mutations call it directly too — since 2026-11-04.** `updateVendor` and `deleteVendor` in `vendor.resolver.ts`; `updateTagType`, `deleteTagType`, `updateTag` and `deleteTag` in `tag.resolver.ts`. Before that date they wrote with `where: { id }` alone, so any signed-in user who knew another account's id could rename or delete the row. See `docs/global/bugs/2026-11-04-bug-unscoped-catalog-writes.md`. (This said seven until households H3a task 3.7, when `createTag` and `updateTag`'s `typeId` / `parentId` checks moved to `requireCatalogIds`, with the same three answers.) What each does with the three answers:
>
> | Answer | Update mutation | Delete mutation | `typeId` / `parentId` on `createTag` / `updateTag` (`requireCatalogIds`) |
> |---|---|---|---|
> | `'own'` | writes | deletes | accepted |
> | throws `FORBIDDEN` | nothing is written | nothing is deleted — the check runs BEFORE the scoped cart or tag cleanup | nothing is written |
> | `'unclaimed'` | `NOT_FOUND`, same message as before | the old result: `false`, or `true` for `deleteTag` with `deleteChildren` | `BAD_USER_INPUT` |
>
> `deleteTag`'s descendant walk and its orphaning `updateMany` carry a `householdId` **filter** (a `userId` one until H3a task 3.7), because before the fix `createTag` accepted another account's `parentId`, so another household's tag may sit under the caller's. Tested against `ownedRowFake` in `apps/server/src/resolvers/catalog-ownership.resolver.test.ts`.
>
> **Issue #359: both steps are done; the issue stays OPEN until H3a merges and deploys.** Six GraphQL types declared `userId: String!` (`Item`, `TagType`, `Tag`, `Vendor`, `Recipe`, `Shelf`). Step one (2026-10-31, #367) removed every web selection of them. Step two (H3a task 3.14, `2312707a`) removed the six fields from the schema. Check with:
>
> ```bash
> git grep -n userId -- apps/web/src/apollo/operations/          # must return nothing
> git grep -c "userId: String!" -- apps/server/src/schema/        # must return nothing since 2312707a
> ```
>
> Why the two steps were split: dropping a field a deployed bundle still selects fails GraphQL **validation**, so the whole query errors rather than one field going null. The Cloudflare deploy and the server deploy are separate steps, so there is always a window where the two disagree. Removing the selections first closed that window for `userId`. **`Location.isDefault` did NOT get a step one**: `main`'s web bundle still selects it. The H3a runbook first solved that by deploying the web before the server; since 2026-11-17 the server keeps the field instead (next paragraph).
>
> **Old-bundle shim — read this before you remove or change any GraphQL field or input field** (built 2026-11-17, H4 runbook section 8.3). Until every device has the households bundle, the server must accept everything `main`'s old web bundle sends. Five schema fields exist only for that, all `@deprecated(reason: "Old web bundles only. … Remove in the release after households.")`: `Location.isDefault` (`true` for the first location of the caller's list), `CheckoutItemInput.itemId` (with `cartItemId` made optional; the stored amount is bought), and `ConsumeRecipesItemInput.packedQuantity` / `.unpackedQuantity` / `.quantity` (ignored). `apps/server/src/test/oldBundleCompat.test.ts` guards it in four ways: (1) it validates a COPY of `main`'s documents (`apps/server/src/test/fixtures/main-web-operations/`) against the schema; (2) it checks the old `Checkout` and `ConsumeRecipes` variables; (3) it compares a COPY of `main`'s server schema (`apps/server/src/test/fixtures/main-server-schema.graphql`) with the current one, and `findBreakingChanges` must return exactly the six `userId` fields, `Mutation.purgeUserData` and `PurgeResult`, and `findDangerousChanges` only the optional `CheckoutItemInput.cartItemId`; (4) it fails if a current web document selects a deprecated field. Document validation alone does NOT look inside an input type sent as a variable, and the variable test covers only two operations. Check (3) is what catches a change to any other input type the old bundle sends, for example `ItemInput` or `TagInput` from `main`'s import (proved by mutation: `ItemInput.estimatedDueDays` made `Int!` and `TagInput.parentId` deleted turn it red). If you change a type on purpose, check that no old document or variable uses it before you add it to the list. The old checkout shape buys the STORED amount and SKIPS an `itemId` with no row being bought, as `main`'s server did; its amount rule of `CART_CHANGED` cannot fire. `isDefault` reads the first id once per household per request (`RequestCache.firstLocationIds`, cleared by `forgetLocationRoles`). Remove together, in the release after households: the five fields, `firstLocationIdOf` and the `firstLocationIds` cache entry, both fixtures and the test.
>
> **The `userId` still named in `exportData.ts` and `importData.ts` tests is deliberate.** Those mappers are allow-lists — each names the keys it forwards, so anything else is dropped by omission. The tests feed `userId` in by hand, so they now prove the general rule that an unexpected key never reaches a backup file, not that one real field is stripped. No live Apollo result carries it any more.

> Twelve of those 22 also check the **other** ids a payload attaches its own row to. Nine did since plan task 8 (13 references), and households H3a task 3.9 added three. Not every id is checked against the same thing:
>
> | Id | Mutations | Checked against | An id that does not pass |
> |---|---|---|---|
> | `tagIds`, `vendorIds` | both item mutations | the target household (the caller's household before H4 task E.3; the same household until H7) | that edge is skipped |
> | `typeId` | `bulkCreateTags`; `bulkUpsertTags` since 3.9 | the target household (the caller's household before H4 task E.3; the same household until H7) | the tag is skipped |
> | `parentId` | `bulkUpsertTags` since 3.9 | the target household (the caller's household before H4 task E.3), or a tag of the same payload written first | the tag is skipped |
> | recipe item ids | both recipe mutations | the target household (the caller's household before H4 task E.3; the same household until H7) | that ingredient is skipped |
> | `itemId` | both log mutations | the target household, which is also the log's location's household since H4 task E.3 (the caller's household, not the location's, before) | the log is skipped |
> | `cartId` | both cart item mutations | the cart must be at a location of the TARGET household where the caller is `participant` or higher (the target only since H4 task E.3, any household before; by location role since H3b task B.7; by `Cart.userId` before task B.3) | the row is skipped, a viewer's included (until task B.7 a viewer got `FORBIDDEN` for the whole batch) |
> | `itemId` | both cart item mutations | the target household, which is the cart's household since H4 task E.3 (the household of the CART's location since 3.9) | the row is skipped |
> | `itemIds` and the tag, vendor and recipe ids in `filterConfig` | both shelf mutations, since 3.9 | see below | that id is dropped; the shelf lands |
>
> **The shelf rule is different from the others.** Only an id that is a row of ANOTHER household is dropped. An id no row holds is KEPT, the same as `createShelf`'s `missing: 'allow'`. The reason: on `replace` the web client writes new shelves in its first pass, and rows that conflict with a cloud row by name only in its second pass, so a shelf names rows that do not exist yet. Task 3.9 first dropped those ids too; `03e32094` fixed it. So for shelves a stranger's id and a free id give different answers, which `requireOwnRowOrUnclaimed` also does; the ids are `cuid()` or `crypto.randomUUID()`, unless a hand-edited file chose them.
>
> For every other row above, an id that does not resolve is SKIPPED, not refused: a partial backup legitimately names a parent the user has since deleted, and "not yours" looks the same as "not there". See `docs/features/settings/2026-10-28-design-import-ownership-guard.md`.
>
> **Three things in the import helpers changed in households H3a task 3.9.**
>
> - `requireOwnLocationIdsOrUnclaimed(ctx, locations, role)` now takes the location role to ask for and returns the ids that already exist. (Since H4 task E.3 it also takes the target household, refuses `'local'` and ids with `:`, and refuses an existing location of another household.) `bulkCreateLocations` asks `participant` (it only skips an existing row); `bulkUpsertLocations` asks `organizer` (it renames one, and `updateLocation` asks `organizer` for a rename). Membership is read by `requireLocationRole`, so a location the caller holds no counted role on is refused, never "unclaimed", even in the caller's own household.
> - A created location gets `householdId` and an `organizer` row for the caller, in one transaction (`createImportedLocation`). An update writes and changes no role row. `order` is the payload's own value, not `max + 1`.
> - The cart item imports check the item against the household of the **cart's location** (`resolveCartItemParents`: the cart by `userId`, then `requireLocationRole` on its location, then `householdOfLocation`), not the caller's household. Since H3b task B.7 the cart is found by `locationIdsWithRole(ctx, 'participant')`, and `householdOfLocation` follows. Since H4 task E.3 the cart is found among the TARGET household's writable locations only (`{ householdId }`), so the item is checked against the target and `householdOfLocation` is not read.

> **The `User` row — households H2, built 2026-10-31.** `model User` (`apps/server/prisma/schema.prisma`) is one row per Clerk account: `id` is the Clerk user id, plus `displayName`, an optional `email`, `lastSeenAt` and `deletedAt`. Since H3a it also has `householdSetupAt` (the first sign-in claim, decision H1), and `HouseholdMember` and `LocationMember` point at it. (This said "Nothing relates to it yet" until H3a.) Two paths write it:
>
> | Path | Where | What it does |
> |---|---|---|
> | Clerk webhook | `POST /webhooks/clerk` → `clerkWebhookHandler` in `apps/server/src/lib/clerkWebhook.ts` | checks the Svix signature with `verifyWebhook` and `CLERK_WEBHOOK_SIGNING_SECRET` (unset → 500, bad signature → 400, nothing written). `user.created` / `user.updated` upsert the name and email; `user.deleted` sets `deletedAt` once and keeps the name, then, in the same transaction, runs the household hand-over (`handOverDeletedAccount` in `lib/handover.ts`, households H6b task K.4): the person leaves every household, and a household they owned is handed over to the live people left, or deleted with its data when none is left |
> | request-path safety net | `ensureUserOrLog` in `apps/server/src/lib/userRow.ts`, called from the GraphQL context in `index.ts`, in both the Clerk branch and the E2E branch | creates a missing row (name from Clerk, with fallback values if Clerk fails or takes over 3 s) and sets `lastSeenAt` once per UTC day |
>
> **The webhook route is mounted ABOVE `app.use(express.json(…))`, with `express.raw`.** The signature covers the raw bytes Clerk sent. Below the JSON parser the body is already an object, and the check runs on re-serialized JSON. `apps/server/src/webhookRouteOrder.test.ts` reads `index.ts` as text and fails if the order changes.
>
> **`ensureUser` is built so it cannot hurt a request:**
>
> - **0 queries** for a user this process already saw today. A per-process memory (`seenToday`) holds them for one UTC day. A user not yet seen today costs one `updateMany`, or up to three queries and one Clerk call when the row is missing.
> - **It never fails a request.** `ensureUserOrLog` catches every error and logs only its name and code, never its message, because a Prisma message prints the email.
> - **It never un-deletes and never renames.** On an existing row the only column it writes is `lastSeenAt`, so a `deletedAt` set by `user.deleted` stays set.
>
> **Deploying it needs two steps outside the code:** set `CLERK_WEBHOOK_SIGNING_SECRET` on the server, and add the endpoint in the Clerk dashboard with the events `user.created`, `user.updated` and `user.deleted`. Until the secret is set, the webhook answers 500. Until the endpoint is added, Clerk sends nothing. In both cases the safety net still creates every row on the user's next request.

## Live updates (cloud)

> Design: `docs/global/permissions/2026-11-16-households-h3c-design.md`. Plans:
> `docs/global/permissions/2026-11-16-households-plan-h3c-1.md` (carts) and
> `2026-11-16-households-plan-h3c-2.md` (stock, logs, locations, catalog). Deploy:
> `docs/global/backend/2026-11-16-deploy-runbook-households-h3c-1.md` (section 9 is H3c-2).
>
> **Built in households H3c-1 and H3c-2 (2026-11-16).** H3c-1 is merged into `develop`
> (#379), and so is H3c-2 (#380). Neither is deployed. A change in one
> tab reaches the other open tabs of the same household within about a second. The event
> says only "this changed" (`kind`, `locationId`); the web refetches.
>
> **Five kinds** (`enum ChangeKind` in `apps/server/src/schema/live.graphql`):
>
> | Kind | Level | Sent by (examples) | The web refetches |
> |---|---|---|---|
> | `CART` | location | cart mutations, `checkout`, `removeItemFromLocation`, `deleteItem`, `createVendor`, `deleteVendor`, `removeAllLocationItems` (H6a) | the 5 cart queries |
> | `STOCK` | location | `upsertItemStock`, `addItemToLocation`, `checkout`, `consumeRecipes`, `applyUnitSwitch`, stock imports, `deleteItem`, `removeAllLocationItems` (H6a) | `PantryData`, `ItemStocksForItem` |
> | `LOG` | location | `addInventoryLog`, `checkout`, `consumeRecipes`, log imports, `deleteItem` | `ItemLogs`, `InventoryLogCountByItem`, `LastPurchaseDates` |
> | `LOCATION` | household (`locationId: null`) | the location mutations and imports, `clearAllData`, `deleteAllLocations` (H6a), the household and member mutations (H5b, H5c) | **every active query** (`'all'`) |
> | `CATALOG` | household (`locationId: null`) | every catalog mutation and import, `renameHousehold`, `clearAllData` | `PantryData` and the 15 catalog queries |
>
> **Why `LOCATION` and `CATALOG` are household-level:** a deleted location cannot pass
> `requireLocationRole`, so a location-level event about a delete would never be delivered.
> A household-level event is checked against household membership instead. **Why
> `LOCATION` refetches everything:** a location change touches the switcher, the pantry,
> carts and stock pages, and it is rare. A location deleted with its rows sends no
> `CART`/`STOCK`/`LOG` for that location; the `LOCATION` event covers them.
>
> **One call per mutation, with all its kinds**, after the write has committed. A mutation
> publishes every kind it changed, including side effects: a delete that cascades into
> carts sends `CART` too. The exception is when the kinds sit at different locations:
> `deleteItem` reads, BEFORE the delete, where it has stock, logs and cart rows, and makes
> one `publishChange` call per kind with its own list of locations. A write that changes
> nothing (a refusal, a missing row, an empty reorder, an import that skips every row)
> sends nothing. Imports publish in `finally`, because they are not one transaction
> (`withCatalogEvent` in `import.resolver.ts` for the catalog imports).
>
> | Part | Where | Rule |
> |---|---|---|
> | Event bus | `apps/server/src/lib/liveEvents.ts` | in memory, **one process only**. Before a second Railway instance, the bus must move to a shared service (Redis or similar); Neon's pooled connection has no `LISTEN/NOTIFY`. A listener that throws does not stop the others (a `Set`, not `EventEmitter`) |
> | Publishing | `publishChange(ctx, kinds, locations)` and `publishHouseholdChange(ctx, kinds, householdId)` in `lib/publishChange.ts` | call it AFTER the write or the `$transaction` has resolved, never inside the callback. It never throws. One event per (kind, location), no duplicates. `publishChange` uses the LOCATION's household; both send `ctx.clientId` |
> | Tab id | `Context.clientId`, from `x-client-id` (HTTP) or `connectionParams.clientId` (socket) | the server never sends a tab its own change. A socket without one is refused |
> | Delivery | `shouldDeliver` in `resolvers/live.resolver.ts` | checks the role again for EVERY event: `viewer` on the location through `requireLocationRole`, or `member` of the household for a household-level event (`locationId: null`, any kind) |
> | Socket | `lib/wsServer.ts`, same port and path as HTTP (`/graphql`) | sign-in through `identifyCaller`, shared with HTTP |
> | Web runner | `LiveUpdatesRunner` (`apps/web/src/apollo/`), in cloud mode when signed in | 300 ms batch, then refetches the ACTIVE queries named in `QUERIES_BY_KIND` (`liveUpdates.ts`). A reconnect refetches every active query once. A kind the bundle does not know refetches every active query |
>
> **`QUERIES_BY_KIND` is kept by hand, and nothing catches a query missing from it.** It is
> a `Record<ChangeKind, …>`, so `tsc` fails when a KIND has no entry. Its tests check that
> every name it lists is a real query. No test checks the other direction: a new query that
> shows catalog, stock or log data, and is not added to the map, simply does not update
> live. The comment table above the map lists which kinds each query depends on; add a row
> there when you add a query. Export queries (`InventoryLogs`, `ShoppingCarts`,
> `AllItemStocks`) are left out on purpose: no mounted component watches them.
>
> **Every `Mutation` field must be in one of two lists** in
> `apps/server/src/resolvers/live-publish.guard.test.ts`: `publishes` (with its kinds) or
> `publishesNothing` (with a reason). A new mutation in no list fails the test. Today: 76
> fields, 74 in `publishes` and 2 in `publishesNothing` (measured 2026-11-20 after
> households H6a; count with the command in the H6a *Counts* table above). H6a added
> `deleteAllLocations` and `removeAllLocationItems` to `publishes`, and `recordImport` and
> `deleteHousehold` to `publishesNothing`, each with its reason. Before H6a: 72, all in
> `publishes` (62 until households H5b task
> G.3 added `createInvite` and `revokeInvite`, 64 until task G.4 added `joinHousehold`, 65
> until task G.5 added `setHouseholdRole`, `removeMember`, `leaveHousehold` and
> `createHousehold`, all seven household-level `LOCATION`; 69 until households H5c task H.3
> added `setLocationRole`, `removeLocationRole` and `leaveLocation`, also household-level
> `LOCATION`, tested in `location-people.resolver.test.ts`). H3c-1 had a third list,
> `waitingForH3c2` (51 fields); H3c-2 task D.4 emptied it and deleted it.
> The guard cannot see whether a resolver really calls `publishChange` or
> `publishHouseholdChange`; the per-mutation tests in `cart-live-publish.resolver.test.ts`,
> `stock-live-publish.resolver.test.ts`, `location-live-publish.resolver.test.ts` and
> `catalog-live-publish.resolver.test.ts` do. It does not see queries either:
> `vendorCart` creates a missing, EMPTY cart and publishes nothing (the guard file's
> "queries that write" note).
>
> **Close codes** (`lib/wsServer.ts`, `lib/tokenCheckError.ts`):
>
> | Code | When | The `graphql-ws` client |
> |---|---|---|
> | `4401` | no user, a token Clerk rejects, no valid `clientId` | does not retry. The runner subscribes again on `online` or when the tab becomes visible |
> | `1013` | the token check failed for another reason (Clerk not reached) | retries, up to 5 times in a row |
> | `1001` | the socket is 60 minutes old | retries after about 1.3 to 4 s with a fresh token |
>
> **E2E.** The E2E web client has its own socket with `{ e2eUserId, clientId }`, and the
> E2E build puts `window.__p1iLiveUpdates` (`connects`, `terminate`) on the page. Two specs,
> both `cloud` only (in the `local` project's `testIgnore`):
>
> | Spec | Tests | What it proves |
> |---|---|---|
> | `e2e/tests/live-cart.spec.ts` | 3 | a cart change shows; another household's change never arrives; a change made while the socket was closed shows after the reconnect |
> | `e2e/tests/live-pantry.spec.ts` | 5 | on the pantry, with no reload: a quantity (`STOCK`), a rename (`CATALOG`), a new location in the switcher (`LOCATION`), a checkout's quantity, a deleted item leaving (it also checks the kinds on the socket) |
>
> Both use `e2e/helpers/liveSocket.ts`: `routeLiveSocket` puts `page.routeWebSocket` between
> page and server to count events by kind and to refuse sockets; `warmUpLiveSocket` makes a
> first change and waits for its own refetch; `markDocument` / `stillSameDocument` prove
> there was no reload.
>
> **A new location shows only to people with a role on it.** `visibleLocations`
> (`location.resolver.ts`) lists only locations where the caller holds a role, and
> `createLocation` gives a role only to its creator. So `live-pantry.spec.ts` test 3 uses the
> browser's own user on "another device", not a second member. That is location scoping,
> not a live update bug. Test 2 and test 5 need the second person to be a household
> `manager`: renaming and deleting an item need `requireCatalogRole`.
>
> Two traps `live-cart.spec.ts` found, both about absence:
>
> - **A wrongly delivered event changes nothing on screen.** It only makes the tab refetch
>   its own cart. So "another household's change does not show" must count socket messages,
>   not look at the page.
> - **A warm-up refetch can show a later step.** Test 1 passed with `publishChange` removed
>   from `addToCart`, because the warm-up's own refetch was still in flight and showed the
>   item. The warm-up now waits for its own `CartItems` refetch.
>
> Test 2 uses an ORDER check, not a fixed wait: events for one socket are queued and checked
> in order, so once a later event has arrived, an earlier one would have arrived first.

## Project Structure

```
src/
  components/       # React components
    ui/             # shadcn/ui components
  hooks/            # TanStack Query hooks
  db/               # Dexie.js database and operations
  routes/           # TanStack Router file-based routes
  lib/              # Utilities (cn helper)
  types/            # TypeScript types
  test/             # Test setup
```

## Key Patterns

- **Data types** defined in `src/types/index.ts`
- **Database operations** in `src/db/operations.ts` with tests in `src/db/operations.test.ts`
- **Query hooks** wrap database operations and handle cache invalidation
- **Routes** auto-generate `src/routeTree.gen.ts` on dev server start
- **Component file naming:** each component directory contains `ComponentName.tsx` (the implementation) and a thin barrel `index.ts` (`export * from './ComponentName'`). Import via the directory: `@/components/item/ItemCard`. Do **not** use `index.tsx` for components — it breaks VS Code Cmd+P discoverability.

## Shared Components

> See `apps/web/src/components/CLAUDE.md`

## Custom Hooks

> See `apps/web/src/hooks/CLAUDE.md`

## Features

> Feature documentation lives in sub-directory CLAUDE.md files co-located with the routes:
> - `apps/web/src/routes/CLAUDE.md` — active-location scoping, filter pipeline, shopping, cooking
> - `apps/web/src/routes/items/CLAUDE.md` — item form, Stock-tab location pager, manual quantity input
> - `apps/web/src/routes/settings/CLAUDE.md` — settings layout (`/settings`, `/settings/household`), the global Items tabs, cascade deletion
> - `apps/web/src/routes/settings/household/locations/CLAUDE.md` — location management
> - `apps/web/src/routes/settings/household/tags/CLAUDE.md` — tag management
> - `apps/web/src/routes/settings/household/vendors/CLAUDE.md` — vendor management
> - `apps/web/src/routes/settings/household/recipes/CLAUDE.md` — recipe management

## Design Tokens & Theme System

> See `apps/web/src/design-tokens/CLAUDE.md`

## Name Display Convention

Entity names are displayed in title case using Tailwind's `capitalize` class (`text-transform: capitalize`). This is purely visual — stored values are unchanged, so search and comparison logic is unaffected.

**Applies to:** item names, tag names, recipe names — in list cards, detail page headers, name input fields, and tag type dropdowns.

**Vendor, location and household names are excluded** — all three are user-specified and may use intentional casing (e.g. "iHerb", "7-Eleven", "my Garage", "the Lin home"). Their displays render names as stored. Vendor badges (in `ItemCard` and the item vendors tab) explicitly add `normal-case` to override the Badge component's built-in `capitalize`. Location names carry no `capitalize` anywhere — `LocationSwitcher` (both variants and its dropdown) and `LocationList` (row label and drag overlay) all render them as stored. Household names (cloud only, since households H3a task 3.13) carry none either: `HouseholdLabel` (the sidebar 🏠 link, the household sidebar heading, the household page title, the mobile settings accordion trigger) and `HouseholdNameCard` render them as stored. Three tests check that no ancestor has `capitalize` (`Sidebar.cloud.test.tsx`, `routes/settings/household/index.cloud.test.tsx`).

**Already covered by Badge base class:** tag badges and recipe badges. Vendor badges override with `normal-case`.

## Internationalization (i18n)

> See `apps/web/src/i18n/CLAUDE.md`

## AI Agent SOP

### Coding Tasks

For any **non-trivial** coding task (feature, bug fix, refactoring, test, etc.), always use a subagent — never implement directly in the main conversation. Trivial edits (rename a variable, fix a typo, add one line) may be done in the main session. See global `~/.claude/CLAUDE.md` for the full subagent policy.

**Pass the report structure down.** Every subagent brief must tell the subagent to
report in the shape described under *Pull Requests and Agent Reports* below. A
subagent's report is what the main session repeats to the user, and what later
becomes the PR description — so a report missing its traps or its known gaps loses
them for good. The brief should also ask, explicitly, what the plan got wrong: an
agent that silently works around a bad instruction leaves the next one to hit it.

### Documentation Updates

Before creating a PR, update all relevant documentation:

1. **CLAUDE.md** - Update if architecture, commands, or patterns change
2. **Design docs** (`docs/global/<area>/` or `docs/features/<area>/`) - Update if implementation diverges from plan
3. **Inline comments** - Ensure code comments reflect the changes
4. **Brainstorming logs** (same folder as the design doc for that topic) - Create when brainstorming leads to decisions
5. **`docs/INDEX.md`** - Update the status column when creating new plans (🔲 Pending) or completing implementations (✅)

### Component Development

**Always create Storybook stories for new components:**
- Every new component should have a corresponding `.stories.tsx` file
- Include multiple stories showing different states and variants
- Use realistic data that demonstrates the component's purpose

**Smoke tests:** every `.stories.tsx` has a matching `.stories.test.tsx` using `composeStories` + React Testing Library. Assert a key UI element (role, text, heading) — not `container.firstChild` or `'Loading...'`.

**A story that renders its own static markup instead of the component satisfies that
rule and proves nothing.** `ImportCard`'s `index.stories.tsx` carried three such stories
until 2026-10-13 — `ImportingProgress`, `ImportError` and `ImportDone`, each a
hand-written `<div>` with a `render:` function that never mounted `ImportCard`. Their
smoke tests asserted text inside those fixtures, so they passed against any version of
the component. Measured: deleting the whole 23-line `phase === 'error'` branch from
`ImportCard.tsx` left the story test **4 of 4 green**, "ImportError renders Retry
button" included.

Two tells, both visible by reading the file:

| Tell | What it means |
|---|---|
| the story has a `render:` returning markup, not the component | the smoke test is testing the story |
| the markup's classes differ from the component's | the fake has drifted, so it is not a visual reference either |

Those three had drifted: `text-sm` where the component uses `text-xs`, and `bg-muted`
on the progress track where the component uses `bg-background-elevated`. `bg-muted`
matched no token in `design-tokens/theme.css` and was the only one in `apps/web/src`,
so the track rendered with no background at all.

**A component phase reachable only through a module it imports gets a `.test.tsx`, not a
story.** A story cannot `vi.mock`. Storybook 10.2.6 does support `sb.mock`, but it is
declared repo-wide in `.storybook/preview.tsx` and still needs a `play` function to drive
the component into the phase. For `ImportCard`'s error phase that was judged too much
machinery, so the three fakes were deleted and the coverage lives in `index.test.tsx`.

**Never `export` a fixture from a `.stories.tsx`.** CSF treats **every** named export as a story, so an exported plain object becomes a sidebar entry that fails to render when opened. Keep fixtures module-local (`const`, no `export`). `stock.stories.tsx` exported three (`CLOUD_ITEM`, `CLOUD_LOCATIONS`, `CLOUD_STOCKS`) and produced three broken entries — `pages-item-stock--cloud-item`, `--cloud-locations`, `--cloud-stocks`. If a fixture really must be shared, put it in a separate module (like `@/test/cloudFixtures.ts`) or list it in the meta's `excludeStories`.

`pnpm build-storybook` compiles such a file without complaint, so it proves nothing here. The sidebar is built from `apps/web/storybook-static/index.json`; check that file for the story ids:

```bash
node -e "console.log(Object.keys(require('./apps/web/storybook-static/index.json').entries).filter(k=>k.startsWith('pages-item-stock')))"
```

**Apollo context in route stories:** stories that render routes calling Apollo hooks with `skip:true` (e.g. local-mode guards) need `<ApolloProvider client={noopApolloClient}>` around the `RouterProvider`. Tests pass without it because `setup.ts` stubs all Apollo hooks via `vi.mock`. Import the shared stub:
```ts
import { noopApolloClient } from '@/test/apolloStub'
import { ApolloProvider } from '@apollo/client/react'
```

**Before committing feature code:**
1. **Check Storybook** - Update existing stories if component API changed
2. **Check Tests** - Update or add tests for new functionality
3. **Verify both pass** - Run `pnpm storybook` and `pnpm test` to ensure no breakage

**Commit together:**
- Commit feature code, Storybook stories, and tests in the same commit when possible
- This keeps the codebase in a consistent state where stories and tests match the code
- Exception: Large refactors may need separate commits, but stories/tests should follow immediately

### Bug Fixes

When the user reports a bug (post-implementation or otherwise), treat it as **substantive** unless it is clearly a typo or cosmetic-only change. Required sequence — no shortcuts:

1. **Create a branch** (`fix/<slug>`) — unless already inside a feature branch/worktree, in which case the bug fix belongs to that branch
2. **Dispatch an `Explore` subagent** to investigate — it returns a concise summary: symptom, root cause, affected files
3. **Write a bug doc stub** before starting the fix:
   - Single feature area → `docs/features/<area>/YYYY-MM-DD-bug-<slug>.md`
   - Multiple feature areas → `docs/global/bugs/YYYY-MM-DD-bug-<slug>.md`
   - Fields: bug description, root cause, fix applied (*TBD*), test added (*TBD*), PR/commit (*TBD*)
4. **Dispatch an implementation subagent** — given the root cause summary and bug doc stub as context; it writes a failing test and implements the fix (TDD)
5. **Fill in the bug doc** — update fix applied, test added, and PR/commit reference
6. **Commit in order:**
   - Commit 1: fix code + tests
   - Commit 2: completed bug doc
7. **Create a PR** — only if this is a standalone fix branch; skip if already inside a feature worktree/branch

This applies even when the fix seems obvious. The test serves as a regression guard and the doc enables future tracing. Confirm the test actually *is* a guard — see **Proving a Test Works (Mutation Check)** below.

### Verification Gate

After each implementation phase (each numbered step in an implementation plan), run the full quality gate. **Each command must be run with an explicit path** — do not rely on `cd` persisting between Bash tool calls:

```bash
pnpm lint                                  # ROOT, not apps/web: web src + e2e/ (see below)
pnpm build 2>&1 | tee /tmp/p1i-build.log   # FULL build from repo root: codegen + web (tsc -b && vite) + server (tsc + esbuild bundle + start check) + e2e/ type-check
(cd apps/web && pnpm build-storybook)
pnpm check                                 # ROOT, not apps/web: web src + e2e/ (see below)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
pnpm test                                        # BOTH suites — web + server, run from the repo root
```

**The first line is the ROOT `pnpm lint`, not `(cd apps/web && pnpm lint)`.** Since
2026-10-11 the root script is `pnpm --filter web lint && pnpm lint:e2e`, so it lints
`apps/web/src` and `e2e/`. The web-only form skips `e2e/` entirely.

**`pnpm check` is the ROOT one too, since 2026-10-30 (issue #346).** The root script is
`pnpm --filter web check && pnpm check:e2e`, so it checks lint, formatting and import order
in both `apps/web/src` and `e2e/`. This line was `(cd apps/web && pnpm check)` until that
date, which was correct while `e2e/` had no formatter — it does now, so the web-only form
skips half the work. Nothing else in the gate checks `e2e/` formatting: `pnpm lint` runs
`biome lint`, not `biome check`, and `pnpm build` only type-checks.

**`pnpm build` now type-checks `e2e/` as well.** Its last step is `pnpm typecheck:e2e`
(`tsc -p e2e/tsconfig.json`). There is no extra command to remember — the same way
`apps/server`'s build already carries a second pass for `scripts/`.

**`pnpm test` runs both workspaces.** The root script is `pnpm -r test`, which recurses into
every workspace package that defines a `test` script — today `apps/web` (**3607 tests**
across 360 files) and `apps/server` (**2563** across 83). Measured 2026-11-20 on
`feature/households-h6a`, after households H6a task J.9 (it said 3454 / 347 and 2401 / 78 on
2026-11-19 on `feature/households-h5c`, after households H5c task H.9, 3319 / 337 and 2111 / 76
at `develop` `712f76f6`, before H5c, 3102 / 325 and 2104 / 76 on 2026-11-18 on
`feature/households-h5b`, after households H5b task G.10, 2922 / 305 and 1820 / 70
on 2026-11-17 on `feature/households-h5`, after households H5a task F.9, 2678 / 283 and 1765 / 67
earlier that day on `feature/households-h4`, after households H4, 2586 / 281 and 1566 / 64 on
2026-11-16 after households H3c-2, 2577 / 281 and 1412 / 61
after H3c-1 the same day, 2543 / 276 and 1274 / 52 on
2026-11-15 on `feature/households-h3b`, 2549 / 277 and 1244 / 51 earlier that
day, 2529 / 275 and 1161 / 47 on 2026-11-11, on H3a, and
2321 / 251 and 522 / 32 on 2026-10-28, before households H3a), plus **70** in `scripts/spec` from `pnpm test:spec`.

A short history of these numbers, because they move almost every week and briefs keep
quoting them: they said ~1700 and ~100 until 2026-09-29; `apps/server` said 259 across 20
until cloud locations PR 4a added 87 tests (69 in 4 new files, 18 in 3 existing ones), and
**340** for a few hours on 2026-10-02 between 4a's task 7 and its task 8. `apps/web` stood
at 2259 across 249 through the whole of 4a, which is server-only. PR 4b moved it to **2285
across 248** — more tests in fewer files, because it deleted `flattenPayloadForCloud` and
`MigrationLocationWarningDialog` and the files that tested them, and it said that until
2026-10-28. The import ownership guard (issue #327) then moved `apps/server` from **391 / 27**
to **522 / 32** — **131** new tests, 125 of them in 5 new files and 6 added to
`src/lib/authz.test.ts`, almost all two-user ownership fixtures — and `apps/web` from
2313 / 251 to **2321 / 251**. **Re-measure rather than
quote any of this.** Both are
`vitest run`, so the root command is non-interactive and
never drops into watch mode. Packages without a `test` script (`apps/design`, `packages/types`)
are skipped silently.

After the two workspaces, `pnpm test` also runs `pnpm test:spec` — the `node --test`
suite for `scripts/spec/`, the living spec site build. `pnpm -r` never runs the root
package's own scripts, so without this chain those tests would run nowhere.

There is **no separate server command to remember** — that was the bug. Narrower scripts
still exist for the fast path when you know what you touched:

| Script | Scope |
|---|---|
| `pnpm test` | both suites — **use this in the gate** |
| `pnpm test:web` | `apps/web` only (~50s) |
| `pnpm test:server` | `apps/server` only (~2s) |

Run the whole thing from the repo root, not `(cd apps/web && …)` — a web-only run cannot
fail on a broken resolver. The root `pnpm build` type-checks `apps/server` but never
executes its tests, and lint / Biome / build-storybook do not touch it at all, so before
this was wired up a resolver could be logically broken and still pass every other command
in the gate. That is exactly how three failing purge tests sat on `main` unnoticed (issue
#250 — see `docs/global/bugs/2026-08-24-bug-purge-mocks-missing-shelf.md`).

`.husky/pre-push` also runs `pnpm test`, so pushing now exercises both suites too.

**Run the root `pnpm build`, not `(cd apps/web && pnpm build)`.** The root build is the *full* build — it runs `pnpm codegen` (regenerating GraphQL types from the current schema + operations, catching codegen drift) and type-checks **both** `apps/web` and `apps/server` via `tsc`. The web-only build skips codegen and the server, and `pnpm test` (vitest/esbuild), `pnpm check` (Biome), and `pnpm build-storybook` all skip a full type-check — so type-flow errors (e.g. `possibly null` from `.filter(Boolean)`) and codegen mismatches slip through every other check and only fail in the Cloudflare production build. The root `pnpm build` mirrors that production build and catches them locally.

**EVERY web test and story file IS type-checked — since 2026-10-30 (issue #340).**
`apps/web/tsconfig.app.json:37` still excludes `**/*.test.ts`, `**/*.test.tsx` and
`**/*.stories.tsx`, so that config checks source files only. A second config,
`apps/web/tsconfig.test.json`, checks those files in a pass of its own. `apps/web`'s two
scripts now read:

```
build:     tsc -b && tsc -p tsconfig.test.json && vite build
typecheck: tsc -b && tsc -p tsconfig.test.json
```

**What this pass does NOT catch: an extra key in an untyped mock payload.** Measured
2026-10-31, and it matters because it is easy to assume otherwise.

| Mock shape | A key the result type does not have is |
|---|---|
| `vi.mocked(typedThing).mockReturnValue({ … })` | **caught** — the generated type is applied |
| bare `const m = vi.fn()`, then `m.mockReturnValue({ … })` | **not caught** — `vi.fn()` with no type parameter accepts anything |
| a plain object literal passed to `MockedProvider` | **not caught** — not excess-property-checked |

Proved both ways in `src/routes/cooking.cloud.test.tsx`: `zzzBogus: 1` inside
`mockUseGetItemsQuery.mockReturnValue({ … })` gives **0** errors, while the same key
inside a `vi.mocked(...)` return gives **1**. A genuinely wrong type in the same file
(`const zzzProbe: number = "x"`) is caught either way, so the pass itself is working.

**The consequence, measured on issue #359 step one:** removing the `userId` selection from
every GraphQL document regenerated the types and **17 files still referenced the field**,
yet `pnpm build` was clean on the first run. Nothing failed. The cleanup of those 17 was
tidying, not forced repair — do not read it as "the type-check caught these".

So when a selection set or a required field changes, **grep the test files yourself.** The
type-check narrows what you have to check; it does not remove the need to check.

**All 358 of them, with no exclusions.** The config's `exclude` list was a backlog and it
is now empty. Issue #340 step 3 emptied it in three waves:

| Wave | Files taken off | Errors they held |
|---|---|---|
| start (steps 1 and 2) | — | 115 files on the list, **726** errors |
| 1 | 6 | **405** — `lib/quantityUtils` 148, `ItemCard` 95, `lib/importData` 64, `lib/sortUtils` 46, `db/operations` 30, `lib/filterUtils` 22 |
| 2 | 14 | **149**, incl. `hooks/useShoppingCart.test.ts` — the file the issue was filed for |
| 3 | **95** | **174** in 73 files, plus 22 clean smoke tests that were on the list only because their story was |

**Re-measure rather than quote any of these**, and measure the FILE COUNT, not the error
count — see the four traps in that file's header comment. Two of them are what makes the
error count untrustworthy:

- **`"exclude": []` must stay, and deleting the key is NOT the same thing.** `exclude` is
  inherited through `extends`, and `tsconfig.app.json:38` excludes exactly the three
  patterns this config exists to check. Measured 2026-10-30: with the key deleted,
  `tsc --listFiles` finds **1** test or story file instead of 358 and reports **1** error
  instead of 0. A near-zero error count here means a broken config, not a clean tree.
- **Do not strip the comments with a regex on `//`** to build a probe. It eats the `/**/`
  inside `src/**/*.test.ts` and leaves an `include` of `src*.test.ts`, which checks **0**
  files and reports **1** error. Same shape of lie, different cause.
- A probe config written to `/tmp` resolves `typeRoots` from `/tmp/node_modules/@types`
  and reports a single misleading `TS2688` before checking any file. Put it in the repo.
- **`exclude` removes a file only from the ROOT set.** A file an included file imports is
  still pulled in and still checked. That is why 22 clean `*.stories.test.tsx` smoke
  tests sat on the old list: each calls `composeStories` on an excluded story, so
  excluding the story alone left its errors reported against the smoke test. A pair moves
  together, in both directions.

**One file needs a `files` entry, and would be silently unchecked without it.**
`src/hooks/useItems.test.ts` and `src/hooks/useItems.test.tsx` share a path minus
extension. TypeScript's include GLOB EXPANSION keeps one file per such path and `.ts`
wins, so the `.tsx` was in no program at all — it reported 0 errors because nothing
checked it. **Emptying `exclude` does not fix that**; the dedup is in the expansion. A
`files` entry is not glob-expanded, so `"files": ["src/hooks/useItems.test.tsx"]` puts it
in the root set. Measured: `tsc --listFiles` goes from 0 matches to 1, and the file then
reported its own 2 errors (`TS2550 Object.hasOwn`, `TS2532`). It is the only collision
today. List them with:

```bash
git ls-files apps/web/src | grep -E '\.(test|stories)\.tsx?$' \
  | sed -E 's/\.(ts|tsx)$//' | sort | uniq -d
```

Proved by mutation on 2026-10-30, in both directions while the list still had entries.
The same line, `export const __mutationProbe: number = 'not a number'`, appended to one
file at a time:

| File it was appended to | Root `pnpm build` |
|---|---|
| `apps/web/src/hooks/useVendors.test.ts` (checked) | **exit 2**, `src/hooks/useVendors.test.ts(250,14): error TS2322: Type 'string' is not assignable to type 'number'.` |
| `apps/web/src/hooks/useShoppingCart.test.ts` (excluded at the time) | **exit 0**, no error reported |

The second row is what made the first one mean something. **Both files behave like the
first row now**, so to repeat this you need a new probe: there is no excluded file left.

**A shared helper for the biggest cause.** `noUncheckedIndexedAccess` turns every
`rows[0]`, `mock.calls[0]` and `.find()` result into a possibly-undefined value, and that
was 51 of wave 2's 149 errors and about 40 of wave 3's 174. `apps/web/src/test/narrow.ts`
holds `elementAt`, `defined` and `callArgs`, which narrow AND fail with a message naming
the array and the index. Use them instead of `!`. `?.` is fine for a POSITIVE assertion
but wrong for a negative one: on an empty array `expect(row?.name).toBeUndefined()`
passes. (`lib/importData.test.ts` and `db/operations.test.ts` still carry wave 1's
private copies of `defined`. `src/stories/Colors.stories.tsx` deliberately does NOT
import this module — that file ships in the Storybook build.)

**Two ES2022 methods are off limits, and Biome pushes you onto one of them.** `lib` is
`ES2020`, so `Array.prototype.at` and `Object.hasOwn` are both `TS2550`. Use
`elementAt(arr, arr.length - 1)` for the first. For the second, use
`Object.keys(obj)` with `not.toContain` — **not**
`Object.prototype.hasOwnProperty.call`: Biome's `noPrototypeBuiltins` rejects that form
and offers `Object.hasOwn` as a **safe** fix, which `lint-staged`'s
`biome check --write --unsafe` applies, putting the type error back inside the commit
meant to remove it. `Object.keys` is the one form both tools accept, and it still lists a
key whose value is `undefined`. Hit on 2026-10-30 in `hooks/useItems.test.tsx`.

**The old rule is now true everywhere.** "The argument is required, so `tsc` catches a
call site that forgets it" holds for source files AND for test and story files. The hole
this issue was filed for — three `useCheckout()` calls in
`apps/web/src/hooks/useShoppingCart.test.ts` omitting a required `items` while the whole
gate stayed green — is closed, and so is every other instance of it.

**What `tsc` on test files actually caught, as evidence it earns its 3.9 seconds.** None
of these could be seen by `pnpm test`, `pnpm check` or `pnpm build-storybook`:

- **a real Storybook defect.** `src/stories/Colors.stories.tsx` read
  `colors[name].tint`; the token has only `inverse` and `default`, so ten swatches on the
  "Colors by Hue" page rendered with NO background. Its smoke test has one assertion, on
  static text, and stayed green when the swatch was pointed at the wrong token on purpose.
- **three dead props passed for months.** `addTypename` on `MockedProvider` (removed in
  `@apollo/client` 4; the repo is on 4.1.6), `onReorder` on `ShelfList` (never existed —
  the component's first commit, `4c36bf85` on 2026-04-19, already had four props), and
  `createdAt` on `TagType`. React drops an unknown prop silently, so nothing failed.
- **stale Dexie seed keys**: `status` and `createdAt` written to `shoppingCarts`, which
  is `{ id, lastPurchasedAt? }`.
- **23 casts deleted**, net, across the three waves' files — most of them
  `as ReturnType<typeof someHook>` on a mutation-result stub that was missing a field.
  The cast was the reason the missing field was invisible.

**It does not catch everything, and two gaps are worth naming.** Writing a mutation check
for every reshaped fixture in wave 3 found **nine pre-existing vacuous tests** — tests
that stay green when the behaviour they name is deleted — and `tsc` had nothing to say
about any of them. See issue #364 for the list and the measured mutation for each. A
type-correct fixture is not an asserted fixture.

**`pnpm --filter web typecheck` used to check NOTHING, and that is now fixed.** It was
`tsc --noEmit` against `apps/web/tsconfig.json`, which is a solution file: `files: []` plus
two `references`. Outside build mode `tsc` honours `files: []` and checks zero files.
Measured 2026-10-30: `tsc --noEmit --listFiles` printed **0** lines and the command took
**0.06s**. So the root `pnpm typecheck` never type-checked `apps/web` at all, and only
`pnpm build`'s `tsc -b` did. Both scripts now start with `tsc -b`.

**The two passes OVERLAP, unlike `apps/server`'s.** Test files import from `src`, so
TypeScript pulls those source files into the second program and checks them twice. Measured
2026-10-30 with `--listFiles`, after the exclude list was emptied: **1391** files in the
`tsconfig.app.json` pass and **1845** in the `tsconfig.test.json` pass, of which **358** are
test and story files, the rest source files checked a second time. The second number grew
from 1728 as the three waves of step 3 added files back: 1728 → 1734 → … → **1845**.

**That costs about 3.9 seconds, and it is a real cost.** Measured 2026-10-30, three runs of
each form, interleaved so load drift hits both equally, `rm -rf apps/web/node_modules/.tmp`
and `rm -rf apps/web/dist` before every run, load average between 3.98 and 5.27 throughout:

| Command | Three runs | Mean |
|---|---|---|
| `tsc -b` alone (what `build` used to type-check) | 3.35s, 3.38s, 3.68s | 3.47s |
| `tsc -p tsconfig.test.json` alone | 3.92s, 4.32s, 4.86s | 4.37s |
| `pnpm --filter web build` **before** | 7.34s, 6.92s, 6.90s | **7.05s** |
| `pnpm --filter web build` **after** | 11.00s, 11.09s, 10.74s | **10.94s** |
| `pnpm --filter web typecheck` before (checked 0 files) | 0.07s, 0.05s, 0.06s | 0.06s |
| `pnpm --filter web typecheck` after | 7.15s, 9.14s, 8.16s | 8.15s |

So `pnpm --filter web build` is about **56% slower**, and the whole root `pnpm build` grows
by the same ~3.9s. Re-measured on 2026-10-30 with all 358 files in the second program and
nothing excluded, three runs, load average 2.90–4.27: **11.82s, 11.28s, 11.29s**. So
emptying the exclude list cost about **0.5s** on top of the 10.94s that adding the config
already cost — the 95 files were being pulled in as imports and checked anyway (see trap
(c) in `tsconfig.test.json`); what changed is that their errors are now REPORTED. The second pass writes no build info — it is run with `tsc -p`, not
`tsc -b`, and sets neither `incremental` nor `tsBuildInfoFile` — so it re-checks everything
every time and will not get cheaper on a warm tree.

**`e2e/` IS type-checked and linted — since 2026-10-11 (issue #322).** Before that date
nothing checked it: Playwright transpiles each spec with esbuild, which strips types without
checking them, and both root Biome scripts were `pnpm --filter web …`. A type error in a
spec was reported nowhere, which is how 63 `TS2559` errors sat in `a11y.spec.ts` while every
gate command passed.

| Command | What it does | In the gate via |
|---|---|---|
| `pnpm typecheck:e2e` | `tsc -p e2e/tsconfig.json` — every `.ts` under `e2e/`, no exclusions | the last step of root `pnpm build` |
| `pnpm lint:e2e` | `biome lint ./e2e`, using the root `biome.jsonc` | the second half of root `pnpm lint` |
| `pnpm check:e2e` | `biome check ./e2e` — lint **and** format **and** import order | the second half of root `pnpm check` |
| `pnpm format:e2e` | `biome format ./e2e --write` | the second half of root `pnpm format` |

For a few hours on 2026-10-11, `e2e/tests/a11y.spec.ts` was excluded from that tsconfig,
with a second config `e2e/tsconfig.a11y.json` and a `typecheck:e2e:a11y` script as the
removal condition. Issue #322 task 3 fixed the 63 `TS2559` errors, so all three are gone.
**`pnpm typecheck:e2e` now covers every `.ts` under `e2e/`.** Proved by mutation the same
day: flattening `AXE_OPTIONS` back to a bare `RunOptions` makes it exit 2 with 63 ×
`TS2559` in that file.

**Three traps when measuring `e2e/` type errors yourself.** All three were hit before this
was wired up, and the first two look like success:

- With `types: ["node"]` but `@types/node` unresolvable, `tsc` reports exactly **one**
  error — `TS2688` — and bails before checking any file. `@types/node` is now a ROOT
  devDependency for this reason; pnpm does not hoist, so a root-level program cannot see
  `apps/web`'s copy. Check with `ls node_modules/@types/node`.
- A probe tsconfig written to `/tmp` resolves `typeRoots` from `/tmp/node_modules/@types`,
  which gives the same `TS2688`. Put the config inside the repo.
- Leaving `DOM` out of `lib` inflates the count badly. Spec bodies run in Node, but their
  `page.evaluate` and `addInitScript` callbacks run in the browser. Measured 2026-10-11:
  `lib: ["ES2023"]` reports **210** errors, of which 147 are artefacts (121 × `TS2304`
  `Cannot find name 'indexedDB'`, 23 × `TS7031`, and more). With `DOM` and `DOM.Iterable`
  the count is **63**. The old figures of 74 and 78 came from probes with no node types.

**`e2e/` IS formatted, and its imports ARE sorted — since 2026-10-30 (issue #346).**
`formatter` and `assist` are both on in `biome.jsonc`, with the same settings as
`apps/web/biome.json` (`indentStyle: space`, `indentWidth: 2`, single quotes, semicolons
`asNeeded`, the default 80-column width). So one style now covers the whole repo, and
`pnpm format` and `pnpm check` cover `e2e/` as well as `apps/web/src`.

They were off for 19 days, from the day the root config was created (issue #322) to the day
`e2e/` was swept, because the sweep is large and would have buried that PR. Measured
2026-10-30 on the unmodified tree, immediately before the sweep:

| Quantity | Before the sweep |
|---|---|
| `biome check ./e2e` errors | **65** — 45 `format`, 20 `assist/source/organizeImports` |
| `biome check ./e2e --write` diff | **1699 insertions, 684 deletions, 46 of 54 files** |
| `pnpm lint:e2e` warnings | 13 — 6 `noExplicitAny`, 7 `noNonNullAssertion` |

**Re-measure; do not quote.** This paragraph said 64 errors (44 `format`, 20
`organizeImports`) and a 1632/646 diff across 44 files, measured on 2026-10-11. Both were
right then. One spec file was added in the 19 days between, which moved every number.

After the sweep `biome check ./e2e` reports **0 errors** and the same **13** warnings — 6
`noExplicitAny`, 7 `noNonNullAssertion`. Those do not fail the command, the same way
`apps/web`'s 4 warnings do not fail `pnpm check`. Fixing them is still open; see issue #346.

**The sweep changed no behaviour, and that was checked rather than assumed.** A reordered
import really can change behaviour, and no type check would see it. Three checks, all on the
46 changed files:

| Check | Result |
|---|---|
| AST compared before/after, ignoring positions, quote style and trailing commas | all 46 identical outside the import block |
| import **bindings** compared — module specifier plus every local and imported name | **0** changed anywhere |
| import **statement order** | changed in 11 files |

The reorder in those 11 is safe because no `e2e/` module runs code when it is imported. The
only top-level statements in `e2e/` that are not declarations are the `test(...)` and
`test.describe(...)` registrations inside spec files, and no spec file is imported by
anything — there is no bare `import 'x'` and no `require()` under `e2e/` at all. The 11
reordered lists hold only `@playwright/test`, `node:*` builtins, and `e2e/helpers`,
`e2e/pages`, `e2e/utils` and `e2e/constants` modules, which only declare.

`pnpm test:e2e --project=local` was run after the sweep to confirm it: **174 passed, 5
skipped** in 3.9m, exit 0, no flakes — unchanged from the baseline. Load average was 4.94
when it started and between 3.2 and 4.3 during the run, so the result is trustworthy.

**`lint-staged` still does not cover `e2e/`.** It is scoped to `apps/web/src/**`, so nothing
reformats an `e2e/` file at commit time and the drift can return. Whether to add an entry is
the open half of issue #346 — note the hazard recorded under *`lint-staged` Can Silently
Revert Your Fix Inside Its Own Commit* before doing it.

**The root config MUST stay `biome.jsonc`.** Biome reads comments in a `.jsonc` file and
**silently ignores** a `biome.json` that contains any — no error, no warning — falling back
to its own built-in defaults. Found 2026-10-11: as `biome.json` with comments,
`biome lint ./e2e` checked **59** files instead of 54 and `biome check ./e2e` reported 79
formatting errors in tabs and double quotes, which is Biome's default style and not this
repo's. The warning count was unchanged at 13, so the lint output alone does not reveal it.
**Check the file count.**

The repo now has **nine** tsconfigs: `apps/web/tsconfig.json`, `tsconfig.app.json`,
`tsconfig.node.json`, `tsconfig.test.json`, `apps/server/tsconfig.json`,
`tsconfig.scripts.json`, `apps/design/tsconfig.json`, `packages/types/tsconfig.json` and
`e2e/tsconfig.json`.

**Take your own baseline before quoting any count above.**

**`pnpm codegen` is all-or-nothing, and its success line can mislead.** `codegen.ts` has one
`generates` block with two outputs: `apps/server/src/generated/graphql.ts` (schema and
resolver types) and `apps/web/src/generated/graphql.ts` (the same schema plus the documents in
`apps/web/src/apollo/operations/*.graphql`). **If one web document fails to validate against
the schema, NEITHER file is written.**

Add a required argument to a server `.graphql` file while a web document still omits it, and
the run prints this (measured during cloud-parity PR A task 1, and reproduced in a sandbox on
2026-10-08):

```
✔ Generate to apps/server/src/generated/graphql.ts
✖ Generate [FAILED: GraphQL Document Validation failed with 1 errors;
  Error 0: Field "checkout" argument "items" of type "[CheckoutItemInput!]!" is required, but it was not provided.
    at .../apps/web/src/apollo/operations/shopping.graphql:60:3]
✔ Generate outputs
  ✖ One or more errors occurred, no files were generated. To allow output on errors, set config.allowPartialOutputs=true
```

The `✔ Generate to apps/server/…` line prints **before** the failure and means nothing. In the
sandbox run the output directory was empty afterwards. `graphql-codegen` exits **1**, so the
gate does catch the failure — what misleads is the log, not the exit code.

Check the output rather than the log:

```bash
grep -c CheckoutItemInput apps/server/src/generated/graphql.ts
```

**Planning consequence: a server schema change and the web documents that use it cannot be
split into separate tasks or commits.** At the commit in between, codegen writes nothing. On
your machine the previous generated files survive, so `tsc` silently compares your code
against stale types. On a fresh checkout both files are missing — they are gitignored — so
neither `apps/web` nor `apps/server` builds at all. Change the schema and its documents in one
commit.

**The gate regenerates the Prisma client** — since 2026-10-07. `apps/server`'s `build` and
`typecheck` both start with `prisma generate`, so the root `pnpm build` catches a dangling
Prisma field reference.

**Before that it did not, and the failure was silent.** Root `pnpm codegen` is
`graphql-codegen` alone; `prisma generate` was wired only to `postinstall` and `predev`. So
`tsc` compared your code against whatever client was generated last — possibly the pre-edit
one. Measured 2026-10-04: a throwaway file reading a dropped column failed `TS2551` with the
client regenerated and reported **zero errors** with a stale one.

Proved by mutation 2026-10-07: renaming `Item.targetUnit` in `schema.prisma` and running the
root `pnpm build` with **no** manual generate now exits 2 with
`src/resolvers/import.resolver.ts(439,13): error TS2353: … 'targetUnit' does not exist in type
'(Without<ItemCreateInput, …`.

It costs **94ms** of generation, about 0.7s wall including startup.

**`apps/server`'s build type-checks `scripts/`** — since 2026-10-07. Before that nothing ran
it, so a type error in `apps/server/scripts/verify-migration.ts` — the one script that proves a
migration against real SQL — passed the whole gate. Proved by mutation: a deliberate
`const x: number = "s"` gives `scripts/verify-migration.ts(698,7): error TS2322` and pnpm
exits 2.

```
build:     prisma generate && tsc --noEmit && tsc -p tsconfig.scripts.json && node scripts/build.mjs && node scripts/check-start.mjs
typecheck: prisma generate && tsc --noEmit && tsc -p tsconfig.scripts.json
```

**The two passes do not overlap**, which is why this costs little: `tsc --noEmit` checks the
files under `src`, the second pass checks the **3** `.ts` files under `scripts`, and nothing is
checked twice. (`src` was **53** files when this was written; on 2026-11-13
`tsc --noEmit --listFiles` listed **86**. The two `.mjs` build scripts in `scripts/` are not
type-checked, because `allowJs` is off.) The first version of this fix reused the whole-project `typecheck` and so
checked `src` twice — 105 files instead of 53, and 3.4s. **`apps/web`'s own second pass,
added 2026-10-30, does overlap** — see *Web test and story files ARE type-checked* above for
what that costs.

**The server build is about 3.5s, and the `scripts` pass is no longer free.** Measured
2026-10-08 on the same machine and commit, with and without the two files issue #333 added:

| `scripts/` holds | Own files in the pass | Files incl. `.d.ts` | Server build |
|---|---|---|---|
| `verify-migration.ts` only | 1 | 188 | 3.04s, 2.89s, 3.09s, 3.08s |
| plus `databaseIsolation.ts` and its `.test.ts` | 3 | 234 | 3.45s, 3.63s |

Re-measured 2026-11-13 on `chore/build-shared-types`, when the build gained the esbuild
bundle and the start check (see below): the old steps took **3.70–3.92s**, and the whole
server build **3.84–4.43s**. The start check alone costs about 0.2–0.5s.

The 46 extra declaration files are **vitest's types**, pulled in by the test file's
`import … from 'vitest'`. That is the whole cost: about **0.5s** on every server build, in
exchange for the destructive-database guard being type-checked and unit-tested. Stated as a
cost on purpose. (This paragraph used to end "a test file under `scripts/` is not free the
way a test file under `src/` is, because nothing type-checks `src` test files at all". That
was never true for `apps/server`. Its `tsconfig.json` includes all of `src` and excludes no
test file, so `tsc` checks every `apps/server/src/**/*.test.ts`: measured 2026-10-31,
`tsc --noEmit --listFiles` lists **32** of them. Proved by mutation the same day: a
`const __probe: number = 'x'` in `src/test/userFake.test.ts` made
`pnpm --filter server exec tsc --noEmit` exit 2 with `TS2322`. `apps/web`'s test files have
been checked since 2026-10-30.)

Why two tsconfigs rather than one: until 2026-11-13 `tsconfig.json` **emitted** `dist/`,
with `rootDir: "src"`, and adding `scripts` to it would have moved the output to `dist/src/…`.
That reason is gone. `tsconfig.json` now sets `noEmit: true` and has no `outDir` or
`rootDir`; esbuild writes `dist/` (see below). The configs stay separate for the no-overlap
reason only: `tsconfig.scripts.json` extends `tsconfig.json` with `include: ["scripts"]`, so
each file is checked once.

**`apps/server`'s build bundles the server with esbuild, then starts it once** — since
2026-11-13 (`chore/build-shared-types`). Design:
`docs/global/backend/2026-11-13-build-shared-types-design.md`.

- **Why:** `@p1i/types` exports raw TypeScript. A plain `tsc` emit kept the bare import, and
  `node dist/index.js` failed with `ERR_UNKNOWN_FILE_EXTENSION`. `tsc`, `tsx` and Vitest all
  read the source, so none of them saw it. Now the server imports `cartIdFor`, `parseCartId`
  and `isBeingBought` from `@p1i/types`, and its own copies are deleted.
- **`scripts/build.mjs`** bundles `src/index.ts` into `dist/index.js` (about 129 KiB when this was written, 236.0 KiB on
  2026-11-20 after households H6a, plus a source map). It bundles `workspace:` packages and keeps every other dependency external.
  It copies the `.graphql` files (14 since H6a; 12 when this was written) **flat** into `dist/`, not `dist/schema/`, because
  `src/schema/index.ts` reads them from the folder of the running file. `dist/` no longer
  holds the 46 `*.test.js` files the old `tsc` emit shipped.
- **`scripts/check-start.mjs`** runs `node --enable-source-maps dist/index.js` with
  `PORT=0`, a database URL that points at a closed local port, `E2E_TEST_MODE=false`, in an
  empty temp folder. It waits for `Server ready at` within 20s, reads the real port from
  that line, then opens a WebSocket to `/graphql` with no `clientId` and passes only when the
  server closes it with **4401** (since households H3c-1 task C.3, `lib/wsServer.ts`). It
  always stops the server. It needs no secrets and makes no Clerk call.
- **Proved by mutation:** leaving `@p1i/types` external fails it with
  `ERR_UNKNOWN_FILE_EXTENSION`, exit 1; copying the `.graphql` files into `dist/schema/`
  fails it with `ENOENT … dist/schema.graphql`; removing the `attachWsServer(…)` call from
  `index.ts` fails it with `WebSocket error at /graphql: Unexpected server response: 400`.
- **It runs inside `pnpm --filter server build`**, so the root `pnpm build`, the gate and
  Railway's build all run it. The `cloud` E2E project starts the server from source with
  `tsx`, so E2E does not prove the bundle; this check does.
- **Not yet proved on Railway.** Nobody has run the start check there. If it fails there,
  the deploy build fails and the old server keeps running. Read the build log.

**The no-overlap trick depends on a fact that could change.** `scripts/` imports nothing from
`src` today — only `@prisma/client`, `vitest`, node builtins, and its own sibling modules. If
a script ever imports from `src`, TypeScript pulls those files into the scripts program and
checks them again, and the saving goes away. Correct either way, but measure before adding
such an import.

**Final phase only** — after all steps are complete, run the **whole** E2E suite with one
command:

```bash
pnpm test:e2e:all
```

`e2e/run-all.sh` runs the three projects — `local`, `cloud`, `pwa` — as three separate
Playwright invocations, one after another. It does **not** stop at the first failing
project: all three run, and a summary table at the end gives each project's result, elapsed
time and test counts. It exits non-zero if any project failed. Each project writes its own
HTML report (`playwright-report/local`, `/cloud`, `/pwa`), and the reporter never opens a
browser, so the command is safe to run non-interactively.

**Do not run the bare `pnpm test:e2e` as your gate on this machine.** One invocation runs
all three projects together and keeps every server alive for the whole run — three web
servers plus the API server. The machine starves, and the run reports failures nobody
caused.

Measured 2026-09-23 at `main` `b22b53ec`, same commit, same machine:

| How it was run | Failed | Real bugs among them |
|---|---|---|
| `pnpm test:e2e` (all three projects at once) | **36** | 8 |
| `--project=local` alone | 4 | 4 |
| `--project=cloud` alone | 4 | 4 |
| `--project=pwa` alone | 0 | 0 |

**28 of the 36 were phantom.** Three things prove it rather than suggest it: the failing
set **moved between runs on the same commit**; `item-management.spec.ts` failed 8 tests in
the full run and passed **21 of 21** when run alone; and the errors were starvation
symptoms — `Test timeout of 30000ms exceeded`, `element is not stable`, `element was
detached from the DOM, retrying` — not assertion failures. The 8 real ones were all issue
#280, fixed on 2026-09-23. Separate runs are now fully green: **172 + 76 + 69 = 317**.

Separate invocations used to cost about **14 minutes** against roughly 11 for the combined
run, and they tell the truth. A gate that reports failures nobody caused gets ignored, which
is worse than having no gate.

**Copy `test-results/` aside BEFORE you re-run anything.** The third of those three proofs
— what the error actually said — is the one you lose first, and losing it costs you the
ability to tell a real failure from a phantom at all.

The error text does **not** live in `playwright-report/`. That directory's `index.html`
carries no readable error (no embedded base64 zip in this setup), so copying it is not
enough. The failure artefacts — `error-context.md`, the trace, the screenshot — live in
`test-results/`, and **the next Playwright run deletes that directory.**

So the order is: see a failure, copy `test-results/` somewhere outside the repo, and only
then re-run.

This was got wrong twice, two branches apart, by the same session. On PR #351 a
`settings/vendors.spec.ts` failure was re-run before being captured. On
`chore/pre-households` a `cart-id-cross-user-leak.spec.ts` failure was captured — but only
`playwright-report/` was copied, not `test-results/`, which is the one that mattered. Both
times the conclusion rested on two proofs instead of three:

| Proof | Survives a re-run? |
|---|---|
| the spec passes when run alone | yes — re-runnable any time |
| the failing set moves between runs on the same commit | yes — that IS a re-run |
| the error was a connection error or a timeout, not an assertion | **no — gone the moment you re-run** |

Two of three is usually enough to merge, and both times it was. Say which one is missing
and why, rather than implying all three were checked.

**A filtered run used to start all four servers. Since 2026-09-24 it does not.** Playwright
starts every `webServer` entry whatever `--project` says — there is no per-project
`webServer` — so `--project=local` also started the cloud web app, the API server, and a
full `pnpm --filter web build` for a PWA preview it never opened.
`e2e/playwright.config.ts` now builds `webServer` from the projects named on the command
line:

| Command | Servers started |
|---|---|
| `--project=local` | `5175` |
| `--project=cloud` | `5174` + `4001` |
| `--project=pwa` | `5176`, after the production build |
| no `--project`, or `--ui` / `--debug`, or an unrecognised value such as a glob | all four |

The fallback is to start everything, so a parsing mistake costs a slow run and never a
missing server.

Startup cost removed, measured 2026-09-24 on this machine. Same commit, same three tests
per row, four servers forced by passing a glob instead of an exact project name:

| Command | Before (4 servers) | After |
|---|---|---|
| `--project=local e2e/tests/onboarding.spec.ts` | 19s, 20s, 19s | **6s, 7s, 7s** |
| `--project=cloud e2e/tests/item-logs.spec.ts` | 41s | **32s** |
| `--project=pwa e2e/tests/pwa-offline.spec.ts` | 16s | **11s** |

The whole gate, `pnpm test:e2e:all`, measured 2026-09-24 after five specs joined the
`cloud` project (issue #284): **13m49s**, all three green — local 170 passed / 5 skipped in
3m16s, cloud **90 passed / 7 skipped** in 9m08s, pwa 69 passed in 1m25s. Cloud gained 13
passing tests and one skip that run only there. Earlier the same day, before those five
specs, it was 12m39s with cloud at 76 passed / 6 skipped.

The two `offline banner a11y` tests moved from "runs in both `local` and `pwa`" to "runs in
`pwa` only", which is why local now passes 170 where it passed 172 before — see
**A11y Testing** below. This is issue #302.

Measured again on 2026-10-04, on `feature/cloud-locations-pr4b` (cloud locations PR 4b),
**all three green**: **15m33s** of Playwright time — local **171 passed / 5 skipped** in
3m18s, cloud **96 passed / 7 skipped** in 10m51s, pwa **69 passed** in 1m24s. Load average
stayed between 1.6 and 2.5. Cloud is the project that grows: 90 → 96 passing, and
`settings/import-export-cloud.spec.ts` alone now takes about **2.0 minutes** where it took
about 40 seconds, because PR 4b's round-trip tests read every location's quantities back.

The first run of that gate was **red on one test**, and fixing it is where the 15m33s figure
comes from. `cloud → cloud` needs **36.5s** against Playwright's default **30s** budget, so
it now carries `test.setTimeout(60000)` — on that one test, not on the `cloud` project, so
the other five tests in the file keep the 30s signal.

**That run is also a worked example of telling a real failure from a phantom.** The one
failing test repeated when its spec file ran **alone** at load 1.65, so it was not
starvation; the page snapshot captured at the failure showed the element it was waiting for
already present, so it was not a data bug; and re-run with `--timeout=90000` it passed in
**36.5s**. The test needed more than the default 30s `timeout`. A test over its time budget
fails with the same `Test timeout of 30000ms exceeded` text as a starved machine, so the
text alone settles nothing — the repeat at low load and the timing measurement do.

`workers: 1` and `fullyParallel: false` are already set in `e2e/playwright.config.ts`, so
the contention is between the concurrent **servers**, not concurrent tests. Passing
`--workers=N` on the command line does nothing.

No `--grep`. Playwright's `webServer` config starts the servers for you. This runs **three** projects — **348 tests in 27 spec files** (measured 2026-10-04): **176 in `local`** across 22 spec files, **103 in `cloud`** across 20, and **69 in `pwa`** across 2. It said 341 in 26 files on 2026-09-29. The `pwa` project arrived with the PWA work and uses a fourth port, `PWA_WEB_PORT 5176`, so four ports must be free before a run, not three.

**Do not narrow the final run with `--grep`.** `--grep` matches a single joined string made of the project name, the spec file's path **relative to `e2e/tests/`**, every `describe` title, and the test title. An area word selects a test only if that exact word appears somewhere in that string. So a list of feature areas silently drops whole spec files whose names happen to use a different word form.

Measured on 2026-09-16 with the example grep this section used to recommend — `items|shopping|cooking|settings|shelves|vendors-group|recipes-group|a11y`:

| Project | Spec files selected | Tests selected |
|---|---|---|
| `local` | 19 of 22 | 136 of 173 |
| `cloud` | 10 of 12 | 53 of 78 |

| Spec file it skips entirely | Why | In the `cloud` `testMatch`? |
|---|---|---|
| `item-management.spec.ts` | name says `item`, the area word says `items` | yes |
| `item-list-state-restore.spec.ts` | same singular/plural mismatch | yes |
| `unified-item-search.spec.ts` | same singular/plural mismatch | no (local only) |

It also keeps only **part** of three more files, because a stray word in one test title matched while the file name did not: `item-logs.spec.ts` (1 of 3 — one title contains "cooking"), `location-switcher.spec.ts` (6 of 14), `onboarding.spec.ts` (1 of 3 — one title contains "items").

Two of the three skipped files run in cloud, so the old gate never ran them in **either** project. That is how `item-list-state-restore.spec.ts` sat with **8 failing tests on `main`** — 4 local and 4 cloud — for weeks (issue #280). **Fixed 2026-09-23**: its `seedItems` wrote a catalog item and no stock row, so the pantry, which lists stocked items, showed nothing. See `docs/global/bugs/2026-09-23-bug-state-restore-seed-no-itemstock.md`. The lesson about `--grep` stands. The spec was last edited on 2026-06-12 (`5d3ad0a6`); the pantry moved onto `getStockedItems` two days later, on 2026-06-14 (`7ae21ebb`). So these four tests were broken from that commit onward and no gate run reported it.

**If you must narrow the run, pass spec paths as positional arguments — never `--grep`.** Playwright matches positional arguments against the file path, so you select whole files and cannot lose one to a word-form mismatch:

```bash
pnpm test:e2e e2e/tests/shopping.spec.ts e2e/tests/a11y.spec.ts   # full paths
pnpm test:e2e shopping a11y                                       # path substrings
```

Always include `a11y.spec.ts` — it is the axe-playwright accessibility scan, and it should run on every branch finish. Confirm the selection with `--list` before you trust it:

```bash
pnpm test:e2e <your filters> --list | sed -nE 's/.*› ([^:]+):.*/\1/p' | sort | uniq -c
```

A narrowed run is for the fast loop while you work. The final phase runs everything.

**Pick the spec FILES from what you touched, not from route names** — `ls e2e/tests/ e2e/tests/settings/` and choose. Route names alone miss specs whose filename does not contain them: `shelves.spec.ts`, `vendors-group.spec.ts` and `recipes-group.spec.ts` all cover the pantry page (`/`) yet none of them is named after a route, which is how two broken tests in `shelves.spec.ts` sat undetected across several branches. **When pantry group views are touched, the list must include `shelves`, `vendors-group` and `recipes-group`.**

**Rules:**
- If any command fails → stop and fix all errors before proceeding to the next step
- The root `pnpm build` must pass its `tsc` type-check for **both** `apps/web` and `apps/server` — a clean `pnpm test` / `pnpm check` / `pnpm build-storybook` is **not** a substitute and does not catch type errors
- After `pnpm build`, run `grep 'TS6385' /tmp/p1i-build.log` to check for `@deprecated` warnings — any match is a failure even if the build exit code is 0
- Every command above must pass and `grep` must return no matches before moving on
- **A very slow `vitest` run is an environment failure, not a code failure.** The web suite
  normally finishes in well under a minute. If it takes many minutes, reports "Unhandled
  Errors", or collects fewer test files than usual (e.g. 200 of 206 — files that failed to
  *load*, not to assert), the machine is starved: check `uptime` for load average before
  investigating a single failure. The tell is that consecutive runs produce **disjoint**
  failure sets and each named test passes when run on its own. Do not run the suite
  concurrently with `pnpm build` or E2E; re-run it alone, and only then believe it.
- **`localStorage.setItem is not a function` in every test file means the wrong Node.**
  The symptom is `TypeError: localStorage.setItem is not a function` at
  `apps/web/src/test/setup.ts`, repeated across all 251 web test files, so the whole
  suite fails at once. The cause is the Node version, not the code: Node 25 enables the
  Web Storage API by default and defines a method-less `localStorage` global, and
  vitest's jsdom environment does not overwrite a global that already exists, so Node's
  placeholder shadows jsdom's working `Storage`. Node 22 defines no such global.
  Check it:

  ```bash
  node -v                                        # which Node is really on PATH
  node -e "console.log(typeof localStorage)"     # "object" = Node 25, "undefined" = Node 22
  ```

  `object` outside a browser means the wrong Node. Use the version in `.node-version`
  at the repo root. A non-interactive shell often puts Homebrew's Node first even when
  `mise current` reports the pinned one, so check `node -v` inside the same shell that
  runs the tests.

  `apps/web/src/test/nodeWebStorage.ts` repoints both storage globals at jsdom's own
  objects, so the suite passes on **both** Node 22.17.1 and Node 25.8.0 (measured
  2026-10-27: 2313 tests / 251 files green on each). If that fix ever breaks, the suite
  throws one named error from that file instead of the cryptic `setItem` failure. It is
  the first entry in `setupFiles` and must stay first, because `setup.ts` imports
  `../i18n`, whose language detector reads `localStorage` at import time.
- E2E failures on the final phase are a hard stop — fix before finishing the branch; the branch must not be pushed until all E2E tests pass
- **Measure your own baseline. Never subtract a count written in a doc or a brief.**
  Counts in this file, in `e2e/CLAUDE.md` and in task briefs were all true when
  written and go stale on their own. Two examples from one week: `e2e/CLAUDE.md`
  said `a11y.spec.ts` carries **39** pre-existing `TS2559` errors — it carries
  **63**, so a before/after subtraction would have reported 24 new type errors
  that did not exist. A task brief gave a web-suite baseline of **2219**; the real
  number was **2259**, because another PR had merged in between. Both mistakes
  produce the same thing: invented failures that send the next person hunting a
  bug nobody wrote. Run the check on the unmodified tree first — `git stash push
  -u -m "<tag>"`, or a second worktree — and diff the two outputs rather than the
  two numbers.

**Applies to:** all implementation workflows and any session where code changes are made, regardless of whether a formal plan exists.

### Always Commit Before Done

Before responding to a completed task, step, or session wrap-up, **all changes must be committed** — no exceptions:

- Code files (including any updated inline comments)
- Storybook stories
- Tests
- CLAUDE.md updates
- Design docs and brainstorming logs (`docs/global/<area>/` or `docs/features/<area>/`)
- `docs/INDEX.md` status update

Run `git status` to confirm the working tree is clean. If any uncommitted changes remain, commit them first.

See also: **Before Finishing a Branch** (in the Workflow section below) for branch-level wrap-up steps.

### Commit Splitting

Every time the agent commits — whether triggered by "commit my changes", at the end of a task, or any other moment — split the diff into logical groups and make **one commit per group**.

**Grouping algorithm:**

1. Run `git diff HEAD` to survey all pending changes (staged and unstaged combined)
2. Identify distinct logical concerns — each purpose becomes one commit:
   - Bug fix → one commit
   - New feature (code + its tests + its stories) → one commit
   - Config or docs update → one commit
   - Refactor → one commit
3. Tests and stories for a feature travel in the **same commit** as the feature code — do not split by file type or layer
4. **Best-effort when inseparable:** if changes genuinely span concerns (e.g. a refactor that also fixes an incidental bug in a touched file), combine them into one commit whose message explains the mix — e.g. `refactor(items): extract helper — also fixes off-by-one in quantity calc`

**When uncertain:** lean toward more commits rather than fewer. A commit that does one thing is always better than one that does several.

**Large refactors:** size alone is not a reason to split. A refactor touching 30 files for one purpose is still one commit.

**Mid-task atomicity:** Do not apply this rule within a TDD red/green cycle — those commits are intentionally atomic and should not be split.

### Human Code Changes

When the user asks the AI agent to commit code they wrote manually (e.g. "commit my changes", "commit this"):

1. Run `git diff HEAD` to review exactly what changed (staged and unstaged combined)
2. For each modified component or behavior: check if tests exist and are up to date — add or update tests as needed
3. For each modified component: check if Storybook stories exist and are up to date — add or update stories as needed
4. Update `CLAUDE.md` and inline comments if architecture or patterns changed
5. Apply the **Commit Splitting** rule — survey all staged changes and split into one commit per logical concern. Tests and stories for a feature go in the same commit as the feature code.

Human code changes receive the same completeness audit as agent-authored changes. There is no "just commit it" shortcut.

**Exceptions:** Changes to non-code files only (docs, config, assets) do not require a test/Storybook audit.

### CSS Variable Renames

When you detect or perform a CSS variable rename:

1. **Search the entire project** for all occurrences of the obsolete CSS variable
2. **Replace all instances** with the new variable name
3. **Check all file types**:
   - CSS files (`.css`)
   - TypeScript/TSX files (`.ts`, `.tsx`)
   - Test files (`.test.ts`, `.test.tsx`)
   - Storybook files (`.stories.tsx`)
   - Current documentation (`.md`) - CLAUDE.md, README.md, etc.
   - **Do NOT update** historical docs in `docs/global/` or `docs/features/`

Use Grep to find all references:
```bash
# Example: search for old variable name
grep --pattern="--old-var-name" --glob="**/*.{css,ts,tsx,md}"
```

This ensures the design token system remains consistent across the entire codebase.

### Brainstorming Logs

Create a brainstorming log when brainstorming leads to implementation/design decisions. Location: same folder as the design doc (`docs/global/<area>/` or `docs/features/<area>/`). Naming: `YYYY-MM-DD-brainstorming-<topic>.md`. Content: questions asked, user answers, final decision, rationale.

### Implementation Plans

Plans live in the **same folder as their design doc** — `docs/features/<area>/` or `docs/global/<area>/`. Naming: `YYYY-MM-DD-<topic>-plan.md` (e.g. `2026-04-02-expiration-mode-plan.md`).

**Never `docs/superpowers/plans/`.** The `writing-plans` skill defaults there; override it every time. This project keeps all artifacts for a feature — brainstorming log, design doc, plan — together by feature area.

### Workflow

**Branch Management:**

After completing a brainstorming session and before writing the design document, create a new branch and worktree, then enter the worktree. All feature work happens inside the worktree from this point on:
- The design document
- The brainstorming log
- Implementation plans
- The actual code implementation

The timing is important: create the branch and worktree after brainstorming is complete but before writing the design document. This keeps all related work in one place and ensures the entire feature history (docs + code) lives in the worktree.

**Default Workflow: Git Worktrees**

Use git worktrees by default for feature work. Create isolated workspaces in `.worktrees/` directory. See "Advanced: Git Worktrees" section below for setup details.

**Worktree before implementation (mandatory):** After brainstorming is complete and the branch name is derived, before writing the design doc, always create a git worktree using `superpowers:using-git-worktrees` (or follow the manual steps in "Advanced: Git Worktrees" below if the skill is unavailable). All subsequent work — design doc, implementation plan, and code — happens inside the worktree. Branch name is derived from the brainstorming topic: choose `feature/`, `fix/`, `refactor/`, or `docs/` prefix based on context, then add a short kebab-case topic (e.g. brainstorming about cooking expand/collapse → `feature/cooking-expand`).

**Households work targets `develop`, not `main` (since 2026-11-12).** A merge to `main`
deploys to production: Cloudflare Pages builds the web, and Railway deploys the server. So
until the households feature is done, households phase PRs (H3a onward) use `develop` as their
base, and `develop` is merged into `main` only at planned **checkpoint releases**. Each
checkpoint has its own deploy runbook and a fresh rehearsal on a Neon branch of production.
Base a households branch on `origin/develop` and rebase onto it. **No changes go to `main`
until households is done.** The owner decided this on 2026-11-13 ("I'll not touch branch main
before the household feature is done"). So the question of how a `main` hotfix reaches
`develop` is closed. If that ever changes, ask the owner first: rebasing `develop` onto `main`
rewrites a shared branch and needs a force-push, and merging `main` into `develop` breaks the
rebase rule below. See `docs/global/permissions/2026-10-31-households-plan.md`, *How this plan
is split*.

**Absorbing upstream changes: always rebase, never merge**

When a feature branch needs to incorporate changes from `main`, use rebase:
```bash
git rebase origin/main
```
Never use `git merge origin/main` on a feature branch. Rebase keeps history linear and avoids merge commits.

**Alternative: Regular Branches**

For GUI tool users (GitHub Desktop, VS Code) or when worktrees are not suitable, use standard git branches instead.

**Branch Naming:**

Choose the branch prefix based on the primary purpose of the work:
- `docs/` - for documentation-heavy changes
- `feature/` - for new functionality
- `refactor/` - for code restructuring
- `chore/` - for maintenance tasks
- `fix/` - for bug fixes
- Other prefixes as appropriate to the mission

Use descriptive names: `docs/design-tokens`, `feature/dark-mode`, `refactor/component-extraction`

**Branch Cleanup:**

Always delete branches after their PR is merged. This keeps the repository clean and prevents confusion about which branches are active.

Recommended approach using GitHub CLI:
```bash
gh pr merge <number> --merge --delete-branch
```

This automatically deletes the remote branch after merging. Alternative approaches are fine as long as the branch gets deleted.

**Never use `--delete-branch` when another open PR is stacked on that branch.** Deleting
the base branch does not retarget the child PR. GitHub **closes** it, and a closed PR
cannot have its base changed either, so the usual recovery fails twice:

```
Cannot change the base branch of a closed pull request. (updatePullRequest)
Could not open the pull request. (reopenPullRequest)
```

This happened on 2026-09-22 with #304 and #306.

**For a stacked PR, merge the base without deleting its branch, retarget the child, then
delete:**

```bash
gh pr merge <base-pr> --merge            # no --delete-branch
gh pr edit <child-pr> --base main
git push origin --delete <base-branch>
```

**If it has already happened**, push the deleted branch back at its old tip so the child
can be reopened. The tip is the merge commit's second parent:

```bash
git rev-parse <merge-sha>^2                                   # the old branch tip
git push --no-verify origin "<tip-sha>:refs/heads/<base-branch>"
gh pr reopen <child-pr>
gh pr edit <child-pr> --base main
git push origin --delete <base-branch>
```

`--no-verify` is right **only** here: the ref points at a commit already merged into `main`,
so `pre-push` would re-run the whole suite to prove nothing. Do not reach for it otherwise.

**Two more things `gh pr merge` gets wrong in this repo:**

- **`--delete-branch` fails when the target branch is checked out somewhere else**, including
  another worktree: `fatal: 'main' is already checked out at …`. **The merge itself still
  succeeds** — only the local cleanup step fails, so check `gh pr view <n> --json state`
  before retrying. Delete the remote branch by hand with
  `git push origin --delete <branch>`.
- **After merging, `main` in the shared checkout is still behind.** `git branch -d` then
  refuses with "not fully merged", because it cannot see the commits as merged. Run
  `git merge --ff-only origin/main` first.

Local cleanup after the remote branch is deleted:
```bash
git branch -d <branch-name>
```

If using git worktrees, also remove the worktree:
```bash
git worktree remove <worktree-path>
```

**Exceptions:**

For minor changes that don't require brainstorming, ask the user whether to create a branch or commit directly to main. This applies to:
- Small bug fixes
- Typo corrections
- Simple configuration changes
- Other trivial updates

Quick documentation fixes (like fixing a typo in CLAUDE.md) can go directly to main without asking.

**Design docs and brainstorming logs must always go through a branch — never committed directly to `main`:**
- `docs/global/` — always requires a branch or worktree
- `docs/features/` — always requires a branch or worktree

This applies even for minor additions. The CLAUDE.md typo exception does not extend to these directories.

**General Rule:** If the work involves brainstorming, design decisions, or implementation planning, it should go through the full branch workflow. If it's a quick fix or minor adjustment, check with the user about their preference.

**Before Finishing a Branch:**

Always check for uncommitted changes before completing work:

```bash
git status
```

**If there are uncommitted changes:**
1. Review what's uncommitted - common culprits:
   - Design documents in `docs/global/<area>/` or `docs/features/<area>/`
   - Brainstorming logs (same folders as design docs)
   - Implementation plans
   - Test files or Storybook stories
2. Commit all relevant changes with appropriate commit messages
3. Verify `git status` shows a clean working tree
4. Only then proceed with merge/PR/cleanup

**Why this matters:**
- Uncommitted work can be lost during branch cleanup
- Design docs and plans are part of the feature and should be in the PR
- A clean working tree ensures nothing is left behind

**Completeness audit (mandatory):** When the `finishing-a-development-branch` skill is invoked, it automatically audits 6 areas using the branch diff: (1) CLAUDE.md — architecture/pattern updates; (2) Storybook stories — `.stories.tsx` for new/modified components and page-level routes (`.tsx` files in `src/routes/` that render visible UI, excluding layout wrappers and generated files); (3) Tests — `.test.ts`/`.test.tsx` for new/modified behaviors; (4) Design docs — whether implementation matches the plan (N/A if no plan file); (5) Inline comments — no stale references; (6) E2E tests — audit `e2e/tests/*.spec.ts` for changed routes/pages (add or update specs as needed), then run the whole suite with `pnpm test:e2e:all` (**not** the bare `pnpm test:e2e`, and no `--grep` — see the Verification Gate for both reasons) — any failure is a hard stop and the branch must not be pushed until fixed. Gaps must be fixed or explicitly skipped (type "skip") before merge/PR/cleanup options are presented.

**Advanced: Git Worktrees**

For CLI users who want to work on multiple branches simultaneously without switching, git worktrees provide isolated workspaces.

**Setup:**
```bash
# Create worktree in .worktrees/ directory
# Use dashes instead of slashes in the directory name (e.g. feature-xxx, not feature/xxx)
git worktree add .worktrees/<feature-xxx> -b <branch-name>
```
(The EnterWorktree tool runs `pnpm install` and `pnpm codegen` automatically via the WorktreeCreate hook, in addition to copying `.env` files)

**Verify the base ref before trusting anything you test there.** Immediately after creating a worktree, run `git log --oneline -1` and confirm it matches the merge you expect. `EnterWorktree` resolves the base ref at creation time, and the `git fetch` that updated `origin/main` may have happened in a *different* worktree — on 2026-08-23 a new worktree landed on the previous release minutes after a newer PR had merged, and four Playwright runs silently exercised code that no longer existed. If it is behind: `git fetch origin main && git rebase origin/main` before doing any work. The risk is highest right after merging a PR, which is exactly when "my change isn't taking effect" gets misread as a code problem.

**Copy both env files when creating a worktree manually.** `git worktree add` skips the `WorktreeCreate` hook, and so does `EnterWorktree path:` on an already-existing worktree (the hook only fires on creation):

```bash
cp apps/web/.env.local .worktrees/<name>/apps/web/.env.local
cp apps/server/.env    .worktrees/<name>/apps/server/.env
```

Without them the dev server throws `VITE_CLERK_PUBLISHABLE_KEY is not set` and the backend won't connect. Prefer `EnterWorktree name:` (creation mode) to get the copy automatically.

**Exclude `.worktrees/` from every repo-wide file walk.** Each worktree is a *separate branch's* working tree holding a full copy of the source, so `Path('.').rglob('*')`, `find .`, and bulk sed/grep-replace will silently modify files belonging to other branches — it happened on 2026-08-18 during a bulk comment fix, modifying 12 files on another branch. Prefer `git ls-files`, which is scoped to the current worktree automatically; otherwise exclude `.worktrees/`, `node_modules`, `storybook-static` and `.git` explicitly. Afterwards check `git status` in each worktree and verify with `git diff -U0` that every changed line is yours before reverting anything.

**Only one E2E suite can run per machine** — the ports are shared across all worktrees. See `e2e/CLAUDE.md`.

**Directory Convention:**
Use `.worktrees/` directory for git worktrees (project-local, hidden). Ensure it's in `.gitignore`. Use dashes instead of slashes in directory names (e.g. `feature-xxx`, not `feature/xxx`) to avoid creating subfolders.

**Cleanup:**
```bash
# After branch is merged and deleted
git worktree remove .worktrees/<feature-xxx>
```

**Note:** Git worktrees are not supported in GitHub Desktop. If you use GUI tools, stick with regular branches.

### Test Format

**Feature/integration tests** - Use "user can ..." naming with Given-When-Then comments:

```ts
it('user can create an item', async () => {
  // Given valid item data
  const itemData = { name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 }

  // When user creates the item
  const item = await createItem(itemData)

  // Then item is persisted with id and timestamps
  expect(item.id).toBeDefined()
  expect(item.createdAt).toBeInstanceOf(Date)
})
```

**Unit tests** - Keep simple naming (existing style is fine)

### Proving a Test Works (Mutation Check)

A green test proves the test passes. It does **not** prove the test would catch a
regression — and that is the only reason the test exists. Before claiming a behaviour
is covered:

1. Delete or invert that behaviour in the **source**
2. Re-run the test — it must go **RED**
3. Restore, and confirm green again

If the test stays green, the test is wrong, not the mutation. Fix the test.

**The failure is almost always the fixture, not the assertion.** A fixture that cannot
distinguish the right implementation from a wrong one passes against both. Location
scoping is the canonical example in this repo:

```ts
// VACUOUS — passes against code that ignores location entirely
// Given 3 items, all stocked in the active location
expect(card).toHaveTextContent('3 in vendor')
```

With one location, "count items stocked here" and "count every item" return the same
number. **Every location-scoped test needs a fixture stocked only at *another*
location** — see the `stockId` trap in `apps/web/src/lib/quantityUtils.ts`.

**An EMPTY destination is the same failure.** Cloud-parity PR C's first version of
`e2e/tests/settings/data-mode-migration.spec.ts` could not tell the `clear` import strategy
from `replace`. The mutation check — press "Overwrite conflicts" instead of "Clear & import" —
passed in 17.5s. The cause was the fixture: the cloud account was empty before the migration,
so `clear` deleted nothing, `replace` collided with nothing, and both left the same account
behind. The fix was to seed one item and one location in cloud that the local payload never
names. `clear` deletes them; `replace` keeps them. **A strategy that deletes needs something
to delete.**

**An absence or a zero count can be satisfied by the loading state.** Two E2E specs, two
different assertions, one hole. Measured 2026-10-12 (issue #323):

| Spec | Assertion | Mutation | Result |
|---|---|---|---|
| `e2e/tests/settings/shelves.spec.ts` | `expect(getByText('My Test Shelf')).not.toBeVisible()` | cloud `deleteShelf` made a no-op returning `true` | **passed** in 11.1s |
| the same spec before that work, running in `local` only | the same assertion | local `deleteShelf` in `apps/web/src/db/operations.ts` made a no-op | **passed** |
| `e2e/tests/settings-global-pages.spec.ts` | two `toHaveCount(0)` checks | — | same shape, caught by reading it |

The page renders an empty list while its refetch is still in flight. The first paint
satisfies the absence check, and the test is over before the real data arrives.

**The fix: assert something PRESENT first, then assert the absence.** That proves the list is
rendered. Better still, read the state back from the backend — `readShelves` in that spec,
`e2e/helpers/stockReadback.ts` for `ItemStock`. A fixed `page.waitForTimeout` also works and
goes stale, so do not use it.

**This was not caused by moving the spec into cloud.** The local-only version had the same
hole and nobody had seen it. Writing the mutation check is what found it.

**The obvious locator is often the weak one.** `settings-global-pages.spec.ts` wanted
`getByRole('checkbox', { name: 'Remove Milk' })`. With the behaviour broken that element does
not exist, so the mutation failed as a locator timeout — which proves much less than a value
difference. The locator now matches either label, `/^(Add|Remove) Milk$/`, and the same
mutation fails as `Expected: checked / Received: unchecked`. **Prefer a locator that still
resolves when the behaviour is broken, so the assertion fails on the value.**

**`expect(plainValue)` has no auto-retry, and a click resolves before the mutation commits.**
`expect(locator)` retries; `expect(someArray)` does not. And `.click()` resolves when the
click is dispatched, not when the write it starts has landed. So a backend readback placed
right after a click **fails against correct code**: measured 2026-10-12 in `cloud` with the
resolver unmodified, test 6 of `unified-item-search.spec.ts` reported `Expected value:
"item-milk" / Received array: []`. **Use `expect.poll` for a backend readback that follows a
click.** A "before" readback, asserting an id is not there yet, stays a plain `expect` — it is
a negative control, and the state it reads holds from the seed onward.

**The branches of one transaction are not interchangeable.** A task brief for issue #323 said
to "drop one of its `createMany` calls" to prove the new spec covers `applyShelfFilterPicks`.
Measured 2026-10-12 in `cloud`:

| Line commented out | Result |
|---|---|
| `tx.itemTag.createMany` (`apps/server/src/resolvers/shelf.resolver.ts:116`) | **2 tests red** |
| `tx.itemVendor.createMany` (same file, line 123) | **all 10 pass** |

So "one of" can be satisfied by the choice that proves nothing. **Name the specific branch,
and check that the other branches are reached at all.** Here they are not — see the
`applyShelfFilterPicks` gaps listed later in this section.

**Negative controls legitimately stay green.** "No divider renders when every group is
stocked here" *should* pass when the partition is deleted — removing code does not add
a divider. Those are fine, but they are not evidence. Name them as such rather than
counting them toward coverage.

**Report which mutations you ran and that each went red.** "I added tests" and "I
verified these tests fail without the behaviour" are different claims; only the second
one means anything.

**Never undo a mutation with `git checkout -- <file>` while the branch has uncommitted
work.** That command restores the file to `HEAD`, which on a multi-task branch is a
*previous task's* commit — so it silently throws away every edit you have made since. It
happened on 2026-10-28, task 5 of issue #327: the restore reverted the task's own four
resolver edits mid-run and produced **14 failing tests** that looked catastrophic and were
an artefact of the restore, not of the code.

**The safe way: copy the finished, green files aside first, then restore from the copies.**

```bash
cp apps/server/src/resolvers/import.resolver.ts /tmp/green-import.resolver.ts   # before the mutation
# …break the line, run the test, see it red…
cp /tmp/green-import.resolver.ts apps/server/src/resolvers/import.resolver.ts   # restore
```

Committing before each mutation check also works. `git stash` does not: it stashes the
whole tree, including the mutation you are trying to isolate.

**`vi.clearAllMocks()` leaves a queued `mockImplementationOnce` in place.** It clears call
records only. So when a mutation stops the code that would have consumed that queued stub,
the stub survives into a **later** test and makes that test fail for an unrelated reason.
Measured in task 6 of issue #327: one extra red test that read as a second failure and was
an artefact of the first.

**Use `vi.resetAllMocks()` in any file whose helpers queue a `…Once` stub.** It drops the
queue, and since Vitest 2 `mockReset` restores the implementation handed to `vi.fn(impl)`,
so a wrapped fake delegate keeps its real behaviour. It is unsafe only in a file that arms a
`mockReturnValue` / `mockResolvedValue` at **module scope**, which `resetAllMocks` would
wipe — check for that before switching.

**Write test doubles to model the constraint, not the happy path.** A fake that cannot
distinguish the right implementation from a wrong one passes against both, exactly like a
weak fixture. The server suite has hit this six times:

- a `findFirst` fake hardcoding `i.userId === where.userId` leaves an ownership guard green
  even when `userId` is dropped from the resolver. The fix is to model Prisma's own
  semantics: `where.userId === undefined || i.userId === where.userId`
- a `createMany` fake that silently dedupes hides the `P2002` real Postgres would throw,
  leaving a read-then-union unpinned
- a `cartItem` fake that walks `where` key by key **ignores a key it does not know**. PR 3c
  moved two resolvers onto the relation filter `where: { itemId, userId, cart: { locationId } }`,
  and both fakes dropped `cart` on the floor — one was a plain `vi.fn()` told to resolve to a
  number. Every test would have passed against a resolver with no location scope at all. The
  fix is `src/test/cartItemFake.ts`, one shared matcher that resolves `cart` by following
  `CartItem.cartId` to its `Cart` row and reading that row's `locationId` column
- an `upsert` fake that **ignores its `update` payload**. `shoppingFake.cart.upsert`
  returned an existing row untouched, under a comment claiming `update: {}` was the only
  payload any resolver passes. `bulkUpsertShoppingCarts` passes a real one, so every
  column that upsert writes was unpinned — a wrong `locationId` in `update` was dropped
  on the floor and the test passed either way. Found in PR 4a task 4; it now applies the
  payload key by key, Prisma's own semantics
- a `create` fake that **invents an id and throws away columns it was handed**.
  `stockFake`'s `location` and `itemStock` stores and `inventoryLogFake` all did this. It
  is harmless for resolvers that generate their own ids, and wrong for the 22 bulk import
  mutations, which must preserve the payload's ids: no test could see an id being lost, a
  `P2002` on a primary key already taken, or an `upsert` whose `update` moved a row. Found
  in PR 4a tasks 3, 5 and 6. All three now honour `data.id`, enforce the primary key, and
  keep `create` and `update` apart
- **no fake at all.** Nine models' ownership was untestable. **Five of the nine —
  `Item`, `Tag`, `TagType`, `Recipe` and `Shelf` — had no Prisma double anywhere in
  `apps/server/src/test/`**, and `createMany({ skipDuplicates: true })` was modelled for one
  model only (`shoppingFake.cart.createMany`). The doubles that covered the other four could
  not be reused: `shoppingFake.vendor.create` ignores `data.id` and generates
  `vendor-${++seq}` (line 106), `cartItemFake` exports **no client at all** — only the
  `cartItemMatches` matcher (since 2026-11-04 the export is `filterCartItems`) — and `inventoryLogFake` has no `findFirst`. A missing fake does
  not report as missing. It reports as "no test for this model", which reads like a gap in
  coverage rather than a gap that cannot be closed. Fixed 2026-10-28 (issue #327) by
  `apps/server/src/test/ownedRowFake.ts`

**`ownedRowFake` is the shared double for the account-scoped models** — `Item`, `Tag`,
`TagType`, `Vendor`, `Recipe`, `InventoryLog` and `Shelf` (and it was for `Cart` and
`CartItem` until households H3b; see `cartFake` below). One generic
stateful store, `createOwnedRowFake<Row extends { id: string; userId: string }>`. Use it;
do not write a per-model double beside it. What it models, each for a failure listed above:

| It does | Because |
|---|---|
| applies `where` **key by key** (`where.x === undefined \|\| row.x === where.x`), with `id` and `userId` as a string or `{ in: [...] }` | a hardcoded `row.userId === where.userId` keeps a scoping test green after the resolver drops the scope |
| **throws** on a `where` key it does not understand | the `cartItemFake` failure above — a dropped relation filter was ignored silently |
| `create` and `createMany` honour `data.id` and raise `P2002` on a taken id | the 22 bulk import mutations must preserve the payload's ids |
| `createMany({ skipDuplicates: true })` skips a taken id; **without** the flag it raises `P2002` | four `bulkCreate*` write this way, and only `shoppingFake.cart.createMany` modelled it before |
| `create` and `createMany` require a `userId` | it is NOT NULL on all nine models |
| `upsert` keeps `create` and `update` apart and applies `update` key by key | this is what makes a `userId` left in `update` visible as a row that changed owner |
| `findUniqueOrThrow` raises `P2025` | four closing reads use it |
| `update` and `delete` act on one row and raise `P2025` when none matches; `updateMany` returns a count | the catalog writes in `tag.resolver.ts` / `vendor.resolver.ts` (added 2026-11-04) |
| an optional `columns` list of extra `where` keys (plain value, `null`, or `{ in }`); any other key still throws | `Tag` is filtered by `typeId` and `parentId`, `CartItem` by `cartId` |
| an optional `relations` hook | `Item`'s `include: { tags, vendors }` and `Recipe`'s `include: { items }` resolve out of junction stores the test file owns |

**It applies an `update` payload with `value !== undefined`, not `'key' in data`** — Prisma's
own rule, and the opposite of what the design doc for issue #327 specified. `'key' in data`
is wrong for this codebase: `bulkUpsertRecipes` passes
`lastCookedAt: … : undefined`, Prisma treats an explicit `undefined` as "not mentioned", and
`'key' in data` would write `undefined` over a stored column — making a **correct** resolver
fail its test. Decided in task 2 of that branch and confirmed by mutation in task 5.

`ownedRowFake.test.ts` pins each row of that table directly, because several are unreachable
from the resolvers and an unreachable guard invites deletion as dead code — the reasoning
`stockFake.test.ts` records.

**`cartFake` is the shared double for `Cart` and `CartItem`** — since households H3b task B.2
(`apps/server/src/test/cartFake.ts`, pinned by `cartFake.test.ts`). Use it for any cart test;
do not put carts back on `ownedRowFake`. Its header says why `ownedRowFake` does not fit:
`Cart` has no scope column any more, and `CartItem` needs a relation filter, a compound
unique key and `{ increment }`. What it models:

| It does | Because |
|---|---|
| raises `P2002` on a second `(cartId, itemId)` row, in `create`, `createMany`, `upsert`, `update` and `updateMany` | without it, a test of "two adds make one row with the sum" passes against code that never merges |
| `upsert` on `{ cartId_itemId }`, with `quantity: { increment }` or a plain number | `addToCart` and the two cart item imports write this way |
| **throws** on a `userId` `where` key, on both models | `CartItem.userId` means "added by" and is never a scope (H3b rule 13). `cartItemFake.ts`'s `filterCartItems` refuses it too |
| keeps both stores in one state object, registered with `runInTransaction` | a rollback restores carts and rows together |

**The Prisma fake models `$transaction` rollback, and only one of its two forms.**
`src/test/stockFake.ts` exports `runInTransaction`, which snapshots every registered store
with `structuredClone`, keeps the writes when the callback returns, and restores the
snapshot when it throws. Import it; do not write a second copy, because a second copy that
silently does nothing would leave every atomicity test reporting as covered.

**Every shared fake returns a COPY of the stored row, never the row itself** — since
2026-11-15 (commit "test(server): make the shared Prisma fakes return copies"). Prisma
returns a new object for every call. Before that date `stockFake`, `inventoryLogFake`,
`shoppingFake` and `ownedRowFake` returned the LIVE row, so "the row read before a write"
and "the row after it" could be one object, and a value computed from the wrong one still
came out right (found in households H3b task B.6). They now use `structuredClone`, so `Date`
fields are copied too. `cartFake`, `userFake` and `householdFake` already returned copies.
Pinned in `stockFake.test.ts`, `ownedRowFake.test.ts` and `fakeCopies.test.ts`. A test that
changes a returned row changes nothing in the store; to change the store, write to
`fake.state` directly.

Only the **interactive callback** form is modelled — `$transaction(async (tx) => …)`. The
array form, `$transaction([p1, p2])`, throws a clear error on purpose: JavaScript evaluates
the array before `$transaction` is called, so the fake's writes have already landed, and a
snapshot taken then would report a rollback that never happened. One place uses the array
form today: the `/e2e/cleanup` route, in `apps/server/src/lib/e2eCleanup.ts`. It is not
tested through this fake; `e2eCleanup.test.ts` has its own mock that models only the array
form. Check with `git grep -n '\$transaction(\[' -- apps/server/src` (measured 2026-11-04,
households H3a task 3.10; this line said "four resolvers: import, purge, location,
`index.ts`" before, which had gone stale).

Note also that **no *unit* test executes the resolvers against real SQL** — every server
test runs against a hand-written stateful Prisma fake. Cloud **E2E** does hit real
Postgres (`E2E_TEST_MODE=true` routes `prisma.ts` at `TEST_DATABASE_URL`, a dedicated Neon
branch), but only for the spec files listed in the `cloud` project's `testMatch` in
`e2e/playwright.config.ts` — that list is opt-in and covers **37 of the 41 spec files in
`e2e/tests/`** (measured 2026-11-20, after households H6a task J.8 added
`household-activity-purges.spec.ts`; 36 of 40 on 2026-11-19, after households H5c task H.8 added
`location-people.spec.ts`; 35 of 39 on 2026-11-18, after households H5b task G.10 added
`household-invites.spec.ts`; 34 of 38 on 2026-11-17, after households H5 task F.8 added
`shared-household.spec.ts`; 33 of 37 earlier that day, after households H4 task E.6 added
`settings/import-households.spec.ts`; 32 of 36 on 2026-11-16, after households H3c-2 task D.5 added
`live-pantry.spec.ts`; 31 of 35 after H3c-1 task C.6 added `live-cart.spec.ts`; 30 of 34 on 2026-11-15, after households H3b task B.9 added
`shared-cart.spec.ts`; it was 29 of 33 on 2026-11-04, after households H3a task 3.11 added
`cloud-roles.spec.ts` and `household-member-cleanup.spec.ts`).
**Count it rather than quote it.** This line said "20 files today (of 27 spec files)" until
2026-10-12, by which point both numbers were wrong by 3:

```bash
awk "/name: 'cloud'/,/name: 'pwa'/" e2e/playwright.config.ts \
  | grep -c "spec\.ts'"                                 # cloud's testMatch
find e2e/tests -name '*.spec.ts' | wc -l              # every spec file
```

**The command this block used to give printed 0, and had done so since 2026-10-30.** It
was `awk "/name: 'cloud'/,0" … | grep -m1 testMatch | grep -o "'\*\*/[^']*\.spec\.ts'" | wc -l`.
It only worked while the whole `testMatch` array sat on one line. The Biome sweep of `e2e/`
(issue #346, commit `e015378d`) put one entry per line, so the line holding `testMatch`
holds no spec name. Measured: the old command gives 25 on the commit before the sweep and 0
on the sweep itself.
The new command counts every spec name between the `cloud` and `pwa` project headers. Today
that range holds only `cloud`'s `testMatch`, because `cloud` has no `testIgnore`.

The 4 files outside the `cloud` project today are `a11y.spec.ts`, `pwa-offline.spec.ts`,
`settings/import-export-local.spec.ts` and `onboarding.spec.ts`. The first three cannot run
there. **`onboarding.spec.ts` could be listed and must not be** — see issue #347:
`useOnboardingSetup` writes to Dexie in both modes, so a cloud run of its template test
would reach zero resolvers and still pass its URL assertion.

**A resolver exercised by no cloud spec has never touched SQL at all**, and a manual smoke
test is owed for anything transactional.

Nine of the 26 counted on 2026-10-31 cover location or stock surfaces. Three were added 2026-09-14 (issue #284):
`settings/locations.spec.ts`, `location-switcher.spec.ts` and
`location-not-stocked-here.spec.ts` — 22 cloud test cases. They give the first real-SQL
coverage of `createLocation`, `updateLocation`, `deleteLocation`, `reorderLocations`, the
`locations` query with `ensureDefaultLocation` (replaced by `requireHousehold` and first
sign-in, `apps/server/src/lib/household.ts`, in households H3a task 3.5), `upsertItemStock`,
`addItemToLocation` and the `itemStocks` / `PantryData` read.

The fourth is `location-scoped-writes.spec.ts`, added 2026-09-23 — 4 cloud test cases, and
the first real-SQL coverage of the four location-scoped WRITE resolvers PRs 3b and 3c
shipped: `checkout` (cart.resolver.ts), `consumeRecipes` (recipe.resolver.ts), and
`removeItemFromLocation` + `applyUnitSwitch` (itemStock.resolver.ts). It replaces the three
manual smoke tests those PRs owed. It is the only cloud spec with no browser at all — it
calls GraphQL through `makeGql` and asserts server state the same way, because what it
tests is which `locationId` a row is written to. It is therefore in the `local` project's
`testIgnore` as well as the `cloud` project's `testMatch`.

> This paragraph used to end "and `InventoryLog` exposes no `locationId` field to read
> back". That was true until cloud-locations PR 4a task 2, which added `locationId: ID!` to
> the `InventoryLog` GraphQL type. The spec still needs no change, and its reason for
> having no browser still stands — but a new test may now assert a log's location through
> GraphQL instead of through server state.

Five more joined on 2026-09-24, also issue #284 — `recipes-group.spec.ts`,
`vendors-group.spec.ts`, `shelves.spec.ts` (2 cloud test cases each),
`item-stock-input.spec.ts` (3) and `item-stock-pager.spec.ts` (4 of its 5). They give the
first real-SQL coverage of the group views' badge and total maths — `getOutOfStockCount`,
`getLowStockCount` and the packed totals in `RecipeGroupView`, `VendorGroupView` and
`ShelfGroupView` — and of the Stock-tab number inputs and all-locations pager against real
per-location `ItemStock` rows. **The three group specs seed one location, so they are not
location coverage**: with one location "count stock here" and "count all stock" give the
same answer. `item-stock-pager.spec.ts` seeds several and is.

`cleanup-endpoint.spec.ts` joined on 2026-09-25 (issue #319) — 1 cloud test case, no
browser, like `location-scoped-writes.spec.ts`. It is not resolver coverage: its subject is
the `DELETE /e2e/cleanup` route, whose handler is in `apps/server/src/lib/e2eCleanup.ts`
(`index.ts` only mounts it). It seeds one row of all 20 models that route deletes (14
before households task 2.6 added the `User` row, 15 before households H3a task 3.10 added
the three household tables, 18 before households H5b task G.6 added `HouseholdInvite`, 19
before households H6 task J.1 added `HouseholdActivity`), calls it, and asserts every returned deleted count is at least
1. `purge-coverage.test.ts` guards the same route but only as SOURCE TEXT. Since issue #320
it checks the filter's TEXT against one allowed form per model, but it still cannot see a
value, so a filter whose variable is wrong or `undefined` passes it. See `e2e/CLAUDE.md`
for the measured before/after.

`cart-id-cross-user-leak.spec.ts` joined on 2026-10-03 (cloud locations PR 4b task 1) — 1
cloud test case, no browser, like the two above. **It is a labelled negative control, not
coverage.** It reproduces issue #327 against real Postgres: two users each create a cart
with the bare id `'no-vendor'`, and the second user's cart items end up in the first user's
cart row. `Cart.id` is a global primary key, so that collision is real with or without 4b
and the spec is green either way — the proof of 4b's client-side fix is a unit test in
`apps/web/src/lib/importData.test.ts`. It is the **first cloud spec to use two users**:
`makeGql(request, userId)` and `cleanupCloudData(request, userId)` now take an optional user
id, defaulting to `E2E_USER_ID`, so the 18 existing call sites are untouched.
**That paragraph is history.** The import ownership guard (#327) made the spec real coverage,
and since households H4 task E.6 it holds 3 tests: a bare cart id is refused with
`BAD_USER_INPUT` for both households (#361), another household's location-prefixed cart id
is refused with `FORBIDDEN` and its cart items are skipped, and each household's own
prefixed id is written. See the header of the spec.

`settings/import-export-cloud.spec.ts` grew from **2 to 6** cloud test cases in PR 4b task
8, and `settings/import-export-local.spec.ts` from 3 to 4. Before that, **neither
`verifyRelations` copy asserted a location or a quantity**, so every imported item could
land in the wrong location and both specs still passed. They now read each location's
quantities back through `e2e/helpers/stockReadback.ts` and assert them in one shared module,
`e2e/helpers/backupAssertions.ts`. Their fixtures seed **three** locations with three
different quantities, which is what lets those assertions fail. This is the first real-SQL
coverage of the four bulk mutations 4a added — `bulkCreate`/`bulkUpsertLocations` and
`bulkCreate`/`bulkUpsertItemStocks`. A cart row's `locationId` **column** is read through
`cartItemCountByItem(itemId, locationId:)`, because the `Cart` GraphQL type exposes no
`locationId` field.

Three more joined on 2026-10-12 (issue #323) — `settings/shelves.spec.ts` (1 cloud test
case), `settings-global-pages.spec.ts` (2 collected, 1 run until households H3a task 3.15 —
its second test skipped cloud because the sidebar was the same markup in both modes; since
task 3.13 the 🏠 label shows the household name in cloud, so both run there now) and `unified-item-search.spec.ts` (10). The `cloud` project
went 108 → **121** collected and 22 → **25** files. They give the first real-SQL coverage of
four resolvers in `apps/server/src/resolvers/shelf.resolver.ts`: `shelf(id:)` (line 17),
`updateShelf(itemIds:)` (38), `deleteShelf` (50) and **`applyShelfFilterPicks`** (85).

`applyShelfFilterPicks` is the one that mattered. It is a `prisma.$transaction` doing
`deleteMany` plus `createMany` on the composite-key `ItemTag` and `ItemVendor` join tables, a
`recipeItem.create` and a `findUniqueOrThrow`, and its own comment describes a Postgres
`READ COMMITTED` deadlock it skips the delete+recreate to avoid. The Prisma fake models only
the interactive-callback form of `$transaction`, so real SQL was the only way to run it.
**It passed first contact with Postgres** — 2 tests in 29.9s, with no adjustment to the spec
or the resolver.

**Only its tag branch is covered. Write the claim that way.** Three gaps, all measured on
2026-10-12:

| Gap | Evidence |
|---|---|
| `tx.itemVendor.createMany` (line 123) is reached by no test | commenting it out leaves all 10 cloud tests passing — every filter shelf in the spec uses tag axes only, so `addVendorIds` is always empty |
| `tx.recipeItem.create` (line 137) is reached by no test | no filter shelf in the spec has a recipe axis |
| the `READ COMMITTED` deadlock its comment guards against is unproven | `workers: 1` and `fullyParallel: false` make the run a serial single writer, so nothing races a concurrent `updateItem` on the same item |

`settings-global-pages.spec.ts` reaches no new resolver. What its cloud run adds is the path
the stock takes: in local the quantities come out of Dexie on the item's own row, in cloud
they arrive in a separate `itemStocks(locationId:)` field and are joined in the browser, and
`showStock={false}` has to suppress both. A narrow gain, said plainly.

`cloud-user-row.spec.ts` joined on 2026-10-31 (households H2, task 2.7) — 3 cloud test
cases, no browser. The `cloud` project went 121 → **124** collected and 25 → **26** files;
`local` stayed at 183 in 23 files. It is the first real-SQL coverage of the `User` row: a
first GraphQL request creates it (`ensureUser`), the `user.deleted` event sets `deletedAt`
(`handleClerkEvent`), and a later request does not clear it. GraphQL has no `User` type yet,
so it reads the row back through `GET /e2e/users/:id`, an E2E-only route
(`apps/server/src/lib/e2eUsers.ts`). Each test uses its own user id, so the server's
"seen today" memory cannot turn a request into a no-op. **Its "later request" test marks
the user deleted BEFORE the first request, on purpose:** in the order request, delete,
request, the second request makes 0 queries and could not clear `deletedAt` even if the
code tried. The test checks `lastSeenAt` went from `null` to set, which proves the request
reached the row.

`purge-two-households.spec.ts` joined on 2026-11-04 (households H3a, task 3.10, decision
H10) — 1 cloud test case, no browser. The `cloud` project went 124 → **125** collected and
26 → **27** files; `local` stayed at 183 in 23 files. It is the first real-SQL coverage of
`clearAllData` (`import.resolver.ts`): two users each get their own household and one row
of every model it deletes, one clears, and every row of the other's must survive, read
back through the other's GraphQL. Proved by mutation: `tx.shelf.deleteMany({})` makes it
fail. Both users are alone in their household, so it says nothing about a shared one.
Households H6a task J.8 added 2 tests to it: `deleteAllLocations` and
`removeAllLocationItems`, each with two households of two locations each, and a tag with
a tag type. The other household, and the other location for `removeAllLocationItems`,
must keep every row. These are the first real-SQL runs of the two purges and of
`deleteHouseholdData`'s `tag` before `tagType` order. The mutation table is in the H6
plan, task J.8.

**A second E2E-only route puts two people in one household:** `POST /e2e/household-members`
(`apps/server/src/lib/e2eHouseholds.ts`, households H3a task 3.11, decision H9). Invites
are H5, so until then it is the only way a cloud spec can share a household. Like
`GET /e2e/users/:id`, `index.ts` mounts it inside `if (E2E_TEST_MODE)`, and
`apps/server/src/webhookRouteOrder.test.ts` fails if it is moved outside that block. **It
checks no signature and no session: it adds anybody to anybody's household, with no check
of who asks.** That is why it must only exist in E2E mode. It refuses a member who is
already in a household, so a spec must add the member BEFORE the member sends any GraphQL
request (otherwise it answers 409). The helper is `addHouseholdMember` in
`e2e/helpers/cloudUsers.ts`.

Two specs use it, both joined on 2026-11-04 (task 3.11), both cloud only with no browser.
The `cloud` project went 125 → **130** collected and 27 → **29** files; `local` stayed at
183 in 23 files.

- `cloud-roles.spec.ts`, 3 tests: the first real-SQL check of roles with two people. A
  household `member` cannot create a tag and a `manager` can; a location `viewer` can read
  stock but not change it and a `participant` can; a location with no role is refused for
  both read and write. Proved by mutation: `requireLocationRole` ignoring `role` turns the
  viewer test red.
- `household-member-cleanup.spec.ts`, 2 tests: `/e2e/cleanup` run by the owner and by the
  member, in both orders. The member's cleanup leaves the owner's household alone; the
  owner's cleanup removes the member's role rows too. After that the member gets
  `NO_HOUSEHOLD`, the first real-SQL test that reaches it.

`live-cart.spec.ts` joined on 2026-11-16 (households H3c-1, task C.6) — 3 cloud test
cases, with a browser, a real WebSocket and real Postgres. The `cloud` project now collects
**146** tests in **31** files; `local` **184** in 23, `pwa` **73** in 2 (measured with
`--list` on 2026-11-16). It is the first E2E test of a socket: a member's `addToCart`
reaches the open cart page without a reload, another household's change never reaches the
tab, and a change made while the socket is closed shows after the reconnect. It is in the
`local` project's `testIgnore`. It does **not** use a real Clerk token on the socket; that
is a manual check in the H3c-1 deploy runbook. See *Live updates (cloud)* above.

`live-pantry.spec.ts` joined on 2026-11-16 (households H3c-2, task D.5) — 5 cloud test
cases, with a browser, a real WebSocket and real Postgres. The `cloud` project now collects
**151** tests in **32** files; `local` **184** in 23, `pwa` **73** in 2 (measured with
`--list` on 2026-11-16). It checks that the pantry shows a change to stock, an item name, the
location list, a checkout and an item delete without a reload. Test 5 is the first real-SQL
run of `deleteItem`'s `inventoryLog.findMany({ distinct: ['locationId'] })` read, which finds
the locations to send `LOG` to before the cascade deletes the rows. See *Live updates
(cloud)* above.

`settings/import-households.spec.ts` joined on 2026-11-16 (households H4 task E.6) — cloud
only, with a browser. The `cloud` project now collects **160** tests in **33** files; `local`
**184** in 23, `pwa` **73** in 2 (measured with `--list` on 2026-11-17). It is the first real-SQL
coverage of `importCheck`, the import role gate, "Import into which location?" and the
skipped-location message, and the first spec where the BROWSER is a second person in someone
else's household. One person in TWO households is still impossible there, so issue #381 has no
real-SQL test until H5. See `e2e/CLAUDE.md` for its tests.

`shared-household.spec.ts` joined on 2026-11-17 (households H5 task F.8) — 3 cloud test
cases, with a browser, cloud only (in `local`'s `testIgnore`). The `cloud` project now
collects **168** tests in **34** files; `local` **189** in 23, `pwa` **73** in 2 (measured
with `--list` on 2026-11-17, task F.9). **It is the first spec with two BROWSERS that are
two different people.** The project's own `page` is still `E2E_USER_ID`, because
`VITE_E2E_TEST_USER_ID` is one value in the web build. Since F.8 the E2E build also reads
`localStorage['e2e-user-id']` (`getE2ETestUserId` in `apps/web/src/lib/e2eUser.ts`; a
production build never reads it), and `newUserContext(browser, userId, extraLocalStorage?)`
in `e2e/helpers/userContext.ts` makes a context that sets it. Its three tests: a household
`member` sees the catalog read-only; a location `viewer` sees a cart row the owner adds in the
owner's browser, live, and gets no Done; a location a member creates shows to the owner as
**No access** and never in the switcher. The 409 order of `addHouseholdMember` still
applies: add a person to the household BEFORE their context opens a page. See
`e2e/CLAUDE.md` for the mutation table.

`household-invites.spec.ts` joined on 2026-11-18 (households H5b task G.10) — 8 cloud test
cases, with up to three browsers, cloud only (in `local`'s `testIgnore`). The `cloud` project
now collects **177** tests in **35** files; `local` **189** in 23, `pwa` **73** in 2 (measured
with `--list` on 2026-11-18, task G.11). It is the first real-SQL run of `createInvite`,
`revokeInvite`, `invitePreview`, `joinHousehold`, `setHouseholdRole`, `removeMember`,
`leaveHousehold` and `createHousehold`, and the first real-SQL test of one person in two
households (the issue #381 test H4 owed). A person joins through the real flow, starting
as a brand-new visitor in LOCAL mode (`newUserContext(…, { cloudMode: false,
skipOnboarding: false })`). Nothing failed on real SQL that the fakes had accepted. Tests
7 and 8 are the axe scans of the join page, the Members page, its dialogs and the
no-household screen, light and dark: `a11y.spec.ts` does not run in cloud. Dialog scans
use `checkDialogA11y` (`e2e/helpers/axe.ts`), which leaves out only filled buttons, only
from `color-contrast`, because of the known `opacity-90` defect of `buttonVariants`. See
`e2e/CLAUDE.md` for the test table and the twelve mutation checks.

The warning above still holds for everything else — most resolvers are named by no cloud
spec.

> The former wording here — "cloud E2E is gated on `TEST_CLOUD_MODE` (issue #260), which is
> set nowhere" — was true until PR 0 of cloud locations replaced those guards with the
> `baseURL !== CLOUD_WEB_URL` convention. `grep -rn TEST_CLOUD_MODE` now returns nothing
> outside historical docs. It survived here long enough to be copied into several task
> briefs during PR 2, which is the failure mode the section directly below this one
> describes.

**"The item eventually lands" does not pin the path it took.** An assertion on the end
state passes just as well when a bypass short-circuits the flow. Assert the mechanism — the
dialog is visible *and* its radio pre-checked — not only the outcome.

**Watch for predicates that cannot tell rows apart.** `joinItemStock` gives an item not
stocked here `targetQuantity: 0` and no entry in any `useItemSortData` map, so such rows
**tie** under `stock` / `purchased` / `expiring` sorting (only `name` orders them) and all
render `0/0`. Two assertions were vacuous for exactly this reason.

**A per-file `vi.mock` factory REPLACES the one in `src/test/setup.ts`. It does not layer on
it.** 29 test files under `apps/web/src` define their own
`vi.mock('@/generated/graphql', …)`. Each returns a whole module object, so every key
`setup.ts` set is gone unless that file sets it again. A guard added to a `setup.ts` stub can
therefore look like a safeguard for the whole suite and be reached by no test that matters.

Measured on 2026-10-08 on the `useCheckoutMutation` stub in `setup.ts`, by making it throw and
running `pnpm test:web`:

| What was made to throw | Result |
|---|---|
| the **hook** itself | **30 tests fail** in 3 files — `routes/shopping/$vendorId.test.tsx` (24), `routes/shopping/$vendorId.stories.test.tsx` (5), `routes/shopping/index.test.tsx` (1) |
| the **mutate function it returns**, when called | **2289 passed / 249 files — fully green**, and the probe never fired |

So the hook is reached, because those three pages cannot render without it. The function it
hands back is called by **no test in the suite**. The tests that do run a cloud checkout live
in `apps/web/src/hooks/useShoppingCart.test.ts`, and that file's own factory supplies its own
`useCheckoutMutation`, so it never sees `setup.ts`'s stub.

**Before trusting a stub in `setup.ts`, make it throw and run the suite.** A stub nothing
reaches is not coverage. The two mutations above give opposite answers about the same stub, so
which layer you break decides what you learn.

**Why this is a rule here:** PR D shipped four tests that kept passing after the
behaviour they nominally covered was deleted. A vacuous test is worse than no test — it
is a no-test that reports as covered, so nobody looks there again.

### `lint-staged` Can Silently Revert Your Fix Inside Its Own Commit

`.husky` runs `lint-staged`, which runs `pnpm --filter web check --write --unsafe` on every
staged `.ts`/`.tsx` file. **That rewrites your code after you staged it and before it is
committed.**

It has already reverted a real fix. On 2026-09-19, during the PWA offline work, Biome
removed the `offline` dependency from a `useEffect` dependency array. That dependency was
the whole point of the fix — without it the offline banner never re-read its sync time.
The change was staged correctly, and the commit that claimed to make the fix did not
contain it. The full `pnpm test` caught it. Nothing else would have.

**After committing, verify with `git show`, not `git status`.** A clean working tree only
says the tree matches the commit. It does not say the commit contains what you wrote.

```bash
git show <sha> -- path/to/file.ts | grep 'the line you added'
```

The fix there was to make the value load-bearing in a way the rule cannot argue with: read
`offline` inside the effect body, so removing it from the dependency list is no longer
something Biome wants to do.

This failure looks exactly like an agent claiming a change it never made. It is not.

### Explanatory Comments Are Claims, Not Facts

**Treat any explanatory code comment or agent self-report as unverified until you run the
thing it describes.** Across the four unified-item-search PRs, **twelve false comments**
were caught — every one a plausible causal claim nobody checked against source (a barrel-mock
claim, a "defensive no-op", a `sortTail` rationale, "`mutate` is unaffected", "the dialog
recomputes which axes are met", a comment citing a test that could not fail for the reason it
named). One agent report also **fabricated a quote from its own requirements doc** to justify
a deviation.

When you write a comment asserting *why* something behaves as it does, verify it first. When
you read one, do not trust it as evidence.

### A11y Testing

**Biome lint (`pnpm lint`):** 37 a11y rules enabled in `apps/web/biome.json` — catches static violations (missing alt text, invalid ARIA, bad roles) at write time.

**axe-playwright (`e2e/tests/a11y.spec.ts`):** Runtime a11y checks via `axe-core` targeting WCAG AA (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`), set through `AXE_OPTIONS` in the spec file. **That filter only started working on 2026-10-11** — see *The WCAG filter had never applied* below. Covers **70 tests in `pwa`, and the same file collects 70 under `local` but runs 68** (counts measured 2026-10-31 with `--list`, after households H1 added the household and user settings scans; 66 / 64 before): 16 top-level page scans, 13 in `test.describe('detail page a11y')`, 28 in `test.describe('dark mode a11y')`, 11 mobile-viewport scans at 390×844 in `test.describe('mobile viewport a11y')`, and 2 in `test.describe('offline banner a11y')`. **Those last 2 run only in `pwa`** (since 2026-09-24, issue #302). They set `baseURL: PWA_WEB_URL`, so under `local` they ran against the same server with the same code — an exact duplicate — and they were the only reason a `--project=local` run needed the PWA preview server at all. A describe-level `test.skip` now skips them outside `pwa`. It has to be at describe level: the file's top-level `beforeEach` also calls `page.goto('/')`, so a body-level skip runs too late and the hook still hits port 5176. Run with `pnpm test:e2e a11y.spec.ts` — select it by path, not `--grep`. Dark mode is triggered by `page.addInitScript(() => localStorage.setItem('theme-preference', 'dark'))` in a `test.describe('dark mode a11y')` block.

When adding a new page/route, add a corresponding test to `e2e/tests/a11y.spec.ts` for both light and dark mode.

**The WCAG filter had never applied — found and fixed 2026-10-11 (issue #322 task 3).**
`AXE_OPTIONS` was passed at the TOP level of `checkA11y`'s third argument. That argument is
axe-playwright's own `AxeOptions` wrapper, and it forwards only `axeOptions.axeOptions` to
axe (`axe-playwright/dist/index.js:111`), so the object was dropped and **axe ran with its
own defaults**. The comment above the constant claimed the level was "explicitly set", and
this section repeated it. Both were wrong. The 63 `TS2559` errors that said so were
invisible because nothing type-checked `e2e/`.

**The scans had been STRICTER than documented, not laxer. No violation was missed.** Axe's
default set is a superset of the four tags: it also runs `best-practice` rules. So the fix
NARROWS the gate, which is why it was measured first rather than just applied.

Measured 2026-10-11 over **130 scans** — 64 in `local`, 66 in `pwa` — by running axe three
times per scanned page (defaults, the WCAG tags, and the delta rules alone) and taking the
union of `passes` + `violations` + `incomplete` + `inapplicable` rule ids:

| Quantity | Count |
|---|---|
| rule ids evaluated with axe defaults | **89** |
| rule ids evaluated with the four WCAG tags | **62** |
| stopped running | **28** |
| started running | **1** (`target-size`) |
| of the 28, how many report a violation or an incomplete on any scanned page | **0** |

The 28 that stopped are all tagged `best-practice` and none carries a WCAG tag:
`accesskeys`, `aria-allowed-role`, `aria-dialog-name`, `aria-text`, `aria-treeitem-name`,
`empty-heading`, `empty-table-header`, `frame-tested`, `heading-order`,
`image-redundant-alt`, `label-title-only`, `landmark-banner-is-top-level`,
`landmark-complementary-is-top-level`, `landmark-contentinfo-is-top-level`,
`landmark-main-is-top-level`, `landmark-no-duplicate-banner`,
`landmark-no-duplicate-contentinfo`, `landmark-no-duplicate-main`, `landmark-one-main`,
`landmark-unique`, `meta-viewport-large`, `page-has-heading-one`,
`presentation-role-conflict`, `region`, `scope-attr-valid`, `skip-link`, `tabindex`,
`table-duplicate-name`.

**One rule STARTED running: `target-size` (wcag22aa, SC 2.5.8).** Axe ships it
`enabled: false`, so the default run skipped it. A tag filter overrides `enabled` —
`matchTags` returns true on a tag match without consulting `rule.enabled` (axe.js:19848) —
so naming `wcag22aa` turns it on. It passed all 130 scans. A comment in the spec had claimed
`target-size` "still polices" the known-bad destructive confirm button; that was false until
this fix, because the rule was not running at all.

**To widen the gate again, add `'best-practice'` to `WCAG_AA_TAGS` in `e2e/helpers/axe.ts`.** (It sat in `a11y.spec.ts` until households H5 task F.4 moved it into that helper, so the cloud-only scans of the View only switcher in `location-switcher.spec.ts` use the same rules. `a11y.spec.ts` does not run in the `cloud` project.)
Nothing else needs to change. That is the one line to edit, recorded here so the narrowing
is reversible rather than forgotten.

Two shapes, one source of truth: `WCAG_AA_TAGS` feeds both `AXE_RUN_OPTIONS` (a bare axe
`RunOptions`, for `getViolations`) and `AXE_OPTIONS` (the same thing nested, for
`checkA11y`). The two dialog scans in `checkA11yExcludingContrastOn` use the first and now
run the same rule set as the other 63; before this fix they also ran axe's defaults, so all
65 agreed by accident.

### E2E Test Format

E2E tests use Playwright. The `e2e/` directory lives at the **monorepo root** (not inside `apps/web/`) because e2e tests cover the full stack. Test files live in `e2e/tests/`, page objects in `e2e/pages/`, config at `e2e/playwright.config.ts`.

> **Before running E2E, read `e2e/CLAUDE.md`** — port collisions across worktrees, a stale `generated/graphql.ts`, and the shared cloud dev database each produce failures that look like code regressions and are not.

**Page objects** — one class per page, encapsulating selectors and actions. Include a comment on each method citing the aria-label string and source file location:

```ts
// e2e/pages/CookingPage.ts
export class CookingPage {
  constructor(readonly page: Page) {}

  async navigateTo() { await this.page.goto('/cooking') }

  async checkRecipe(name: string) {
    // Recipe checkbox: aria-label={recipe.name}, role="checkbox" (src/routes/cooking.tsx:438)
    // Use getByRole to avoid strict-mode conflict with the "Expand {name}" button
    await this.page.getByRole('checkbox', { name }).click()
  }
}
```

**Test setup** — two strategies:

1. **UI-driven** (default): Navigate through the app to create test data. Use for simple setup (1–5 steps).
2. **`page.evaluate()` seeding**: Seed IndexedDB directly for complex multi-entity setup. Navigate to `/` first so Dexie initialises the schema, then open `indexedDB.open('Player1Inventory')` and use `readwrite` transactions. Use when UI setup would require 10+ steps (e.g. creating items + linking them to a recipe).

**Always resolve a seed write on `tx.oncomplete`, never on `request.onsuccess`.** `IDBRequest`'s success event fires while the transaction is still open, so a helper that resolves there reports success for a write that has not committed — and the navigation which follows every seed destroys the document, aborting the open transaction and silently discarding those rows. The page then renders an empty state and the test fails much later, as an unexplained locator timeout, only on slow runs. Reject on `tx.onerror` and `tx.onabort` too:

```ts
await new Promise<void>((resolve, reject) => {
  const tx = db.transaction(store, 'readwrite')
  for (const row of rows) tx.objectStore(store).put(row)
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error)
  tx.onabort = () => reject(tx.error)
})
```

**`afterEach` teardown** — always clear IndexedDB, localStorage, and sessionStorage. See the root `e2e/tests/shopping.spec.ts` or `e2e/tests/cooking.spec.ts` for the canonical teardown block.

**Test naming** — same "user can ..." convention with Given-When-Then comments as unit tests.

### Commits

Always include scope in commit messages:

- `feat(cart): add checkout confirmation`
- `fix(tags): prevent duplicate tag names`
- `docs(readme): update setup instructions`

Apply the **Commit Splitting** rule — one commit per logical concern. See `### Commit Splitting` (in AI Agent SOP, above).

### Pull Requests and Agent Reports

**One structure, two audiences.** The same shape applies to a PR description and to
what an agent reports back — a subagent to the main session, or the main session to
the user. Both are read by someone deciding whether to trust the work.

Use these sections, in this order. **Omit a section that would be empty.** An empty
heading is worse than no heading: it reads as "nothing went wrong" when it means
"nothing was written".

```
## Summary
Four things, in this order:
1. Where this sits in the bigger picture, and what problem it solves.
2. How it relates to other branches and PRs — what blocks it, what it blocks,
   what must merge or deploy first.
3. **What the user gets (UX)** once this is merged AND deployed.
4. **What the developer gets (DX)** — see below.

## Solutions
What was explored, what was adopted, what was abandoned — and why each.

## Bugs found and fixed
Defects that existed before this work, or that this work introduced and then fixed.

## Traps discovered and avoided
Things that would have been wrong, caught before they shipped.

## Other insights
Anything a future reader needs that fits nowhere above.

## Test Plan
- [ ] <verification steps, with real numbers>

## Known gaps
What is still missing, still owed, or still unproven.
```

**Why the Summary has those four parts.** A reader who was not in the session
cannot reconstruct any of them from a diff. "What changed" is visible in the files;
where it sits, what it depends on, and what the two audiences gain are not.

**Point 3 is the one most often skipped, and it is the honest test.** If a PR
gives the user nothing yet — groundwork, a column nothing reads, a fake that only
tests can see — say exactly that. "Nothing user-visible; it unblocks X" is a
complete and useful answer. Inventing a user benefit is worse than admitting there
is none.

**Point 4 — what the developer gets (DX) — is required, not optional.** The
developer is a stakeholder of this project too, and most work in this repo changes
their day more than it changes the end user's. A PR with "nothing user-visible" is
very often the PR with the largest DX gain, so stopping at point 3 makes the work
look empty when it is not.

Say which of these the change gives, with the specifics:

| DX gain | What to write |
|---|---|
| Less to remember | the rule or count that no longer has to be carried in someone's head |
| Fewer ways to get it wrong | the mistake that is now impossible, or now caught |
| Faster feedback | the command, and the before/after time |
| Less code to maintain | files, call sites or markers deleted, with counts |
| A failure that now has a name | the error text or test that replaces a silent wrong answer |
| Honest documentation | the stale claim that was corrected, and where it had been copied to |

The same honesty rule as point 3 applies in reverse: if a change **costs** DX —
one more hand-maintained list, one more thing to keep in sync, a slower gate —
say that too, and say why it was worth it. A section that only ever reports gains
stops being read.

**This applies to design docs and plans as well as PRs.** Both carry a *What the
user gets* section and a *What the developer gets* section, for the same reason.

**"Merged AND deployed" is deliberate.** A merged PR that has not been deployed
gives the user nothing. Say which of the two has happened.

**Distinguish Solutions from Traps.** A *solution* is a choice between workable
options — say what you picked, what you rejected, and why. A *trap* is something
that would have been wrong: a test that could not fail, a fixture that could not
tell two implementations apart, a comment asserting something untrue. Traps are
worth their own section because they are the part nobody can see in the diff.

**Test Plan carries real numbers**, not "tests pass". Counts before and after,
the exact command, the exact failure text. See *Proving a Test Works* above — "I
added tests" and "I verified these tests fail without the behaviour" are different
claims, and only the second one means anything.

**Known gaps is not optional when gaps exist.** A PR that says nothing is missing,
when something is, has made its reviewer's job harder rather than easier.

After creating the PR, attach it to the relevant milestone. **Use `gh api` — `gh milestone` is not a valid subcommand and `gh pr edit --milestone` does not work here:**

```bash
# List milestones (note the number, not the title)
gh api repos/OWNER/REPO/milestones | grep -E '"title"|"number"'

# Attach the PR, by milestone NUMBER
gh api repos/OWNER/REPO/issues/PR_NUMBER --method PATCH --field milestone=MILESTONE_NUMBER
```

Match the milestone to the feature area being worked on (e.g. `v0.2.0 — Cloud Foundation` for cloud work). If no milestone fits, skip this step.
