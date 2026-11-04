# Households — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> to carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-10-31
**Branch:** `feature/households` (worktree `.worktrees/feature-households`), based on `main` at `e82fced5`
**Design:** [2026-10-04-households-design.md](2026-10-04-households-design.md)
**Brainstorming log:** [2026-10-03-brainstorming-households.md](2026-10-03-brainstorming-households.md)

**Goal:** Let a family share locations through a household, with two levels of roles, and let
the household survive its owner's account being deleted.

**Architecture:** A `Household` owns the catalog and its locations. `HouseholdMember` and
`LocationMember` hold the roles. All server checks go through three helpers in
`apps/server/src/lib/authz.ts`: `requireHouseholdRole`, `requireLocationRole` and
`requireOwnRowOrUnclaimed`. The web app gets a new Settings layout in both modes. Local mode
keeps its data model and only gets the new screens.

**Tech stack:** React 19, TanStack Router and Query, Apollo, Dexie (web); Express 5, Apollo
Server 4, Prisma 6, Postgres on Neon, `@clerk/express` (server); Vitest, Playwright, Biome.

---

## How this plan is split

The design names seven phases, H1–H7. Each phase is **one PR**, merged and deployed before the
next one starts, because H3 changes the database and must ship alone.

| Phase | Detail in this file | PR |
|---|---|---|
| H1 Settings layout and route moves (both modes, no backend change) | **Full** — tasks 1.1–1.9 | 1 |
| H2 `User` model, Clerk webhook, `lastSeenAt`, E2E user support | **Full** — tasks 2.1–2.7 | 2 |
| H3 Households, roles, data migration, read scoping | Outline. Split into H3a and H3b; detailed plan for H3a: [2026-11-04-households-plan-h3a.md](2026-11-04-households-plan-h3a.md) | 3 (now H3a, `chore/build-shared-types`, H3b) |
| H4 Import and export | Outline | 4 |
| H5 Invites, join, members, read-only views | Outline | 5 |
| H6 Transfer, hand-over, purges, activity | Outline | 6 |
| H7 Personal location order, household switch and create | Outline | 7 |

**Why only H1 and H2 are detailed now.** H3–H7 will change code that H1 and H2 have not
written yet. A detailed task written today would name files, lines and test counts that are
wrong by the time it runs. CLAUDE.md warns about exactly this: counts and line numbers in a
brief go stale. Each later phase gets its own plan file in this folder, named
`YYYY-MM-DD-households-plan-hN.md`, written after the phase before it merges.

## Rules every task brief must pass down

Every subagent brief for this plan must include all of these:

1. **Plain English** (global `~/.claude/CLAUDE.md`). Short sentences, common words, no idioms,
   main point first, lists and tables. Keep exact names, numbers and warnings.
2. **Report structure** (root `CLAUDE.md`, *Pull Requests and Agent Reports*): Summary,
   Solutions, Bugs found and fixed, Traps discovered and avoided, Other insights, Test Plan,
   Known gaps. Omit empty sections. Ask the agent **what this plan got wrong**.
3. **Node 22.17.1** (`.node-version`). Check `node -v` in the same shell before running tests.
   Node 25 fails every web test file with `localStorage.setItem is not a function`.
4. **Work only in this worktree.** Never touch another folder under `.worktrees/`.
5. **Measure your own baseline** before quoting a test count. Do not copy counts from this plan.
6. **Mutation check** every new test that claims to cover a behaviour. Copy the green file aside
   before breaking it (never `git checkout -- <file>` on a branch with uncommitted work).
7. **After committing, check the commit with `git show`**, because `lint-staged` can rewrite a
   staged file.
8. **Run the verification gate** from root `CLAUDE.md` at the end of each task.

---

## Decisions made while writing this plan

The research for H1 and H2 found gaps in the design. These are the answers this plan uses. Each
is also written back into the design doc in task 1.0.

| # | Gap found | Decision | Reason |
|---|---|---|---|
| P1 | Today the **list** pages for tags, vendors, recipes and shelves are full-screen, not only the detail pages. The design assumed only detail pages were | On **desktop**, list pages show the household sidebar. Detail pages stay full-screen. On **mobile**, nothing changes: list pages and detail pages stay full-screen with their own Back button | The design's desktop layout needs the sidebar on list pages. Mobile was meant to look the same as today |
| P2 | `/settings` "redirects" on desktop but is an accordion on mobile. The code has no JavaScript breakpoint | New hook `useIsDesktop()` (`matchMedia('(min-width: 1024px)')`, the Tailwind `lg` value). `/settings` renders the accordion; on desktop it renders `<Navigate to="/settings/household" replace />` | The redirect depends on screen width, so it cannot be a `beforeLoad`. Tests mock `matchMedia` |
| P3 | H1 has no household name and no backend for one | The 🏠 item and the config page title say "My data" in **both** modes until H3 | Same as the local-mode label in the design. H3 replaces it in cloud |
| P4 | Members (H5), Activity (H6) and Switch to (H7) have no pages in H1 | Not shown in H1 in either mode. Each phase adds its own item | An item with no page is a broken link |
| P5 | The config page's "danger zone" has nothing to hold in H1 | Left out in H1. H6 adds it with the purges | No purge action exists yet |
| P6 | `/settings/household/locations/$id` does not exist; locations are renamed in a dialog | Not built in H1. H5 builds it with the people list | H1 is a move, not a new page |
| P7 | Sign-out moves into the user sidebar, so it can happen on pages with Apollo watch queries. `apps/web/src/apollo/persistence.ts:73-84` says removing `LAST_USER_ID_KEY` on sign-out is safe **only** because sign-out lives on `/settings` | `clearCache()` stops removing `LAST_USER_ID_KEY`. A different account signing in then always clears the cache | The other option the note gives (drop the `previous !== null` guard) would also clear on the very first sign-in, which is harmless but hides the reason. Keeping the key is one deleted line and is easy to test |
| P8 | `useUser()` throws in local mode and E2E cloud mode, which have no `ClerkProvider` | Copy the split already in `DataModeCard.tsx` (`CloudModeSectionWithUser` / `CloudModeSectionE2E`) | One pattern for one problem |
| P9 | "Back" from the household sidebar: the last Pantry, Shopping or Cooking page | Scan `app-navigation-history` (sessionStorage, 50 entries) backwards for the first path that is `/`, `/shopping…` or `/cooking`. Fall back to `/` | The history already exists and is capped, so a fallback is needed |
| P10 | `User.email` is required in the design, but a Clerk account may have no email, and `user.deleted` carries none | `email String?`. `displayName String` falls back to the part of the email before `@`, then to `"User"` | Matches *Default names* in the design |
| P11 | The request-path safety net cannot call Clerk in E2E mode, and the Clerk API can fail | In E2E mode, and when the Clerk API fails, create the row with fallback values. **Never fail the GraphQL request because of the safety net** | A failure there would fail all 87 `requireAuth` call sites |
| P12 | `lastSeenAt` on every request would add 1–2 queries to every GraphQL call | One `updateMany` with a "not today" condition, plus a per-process memory of the day already written. A hit on the memory costs none. A miss costs one query for a user not yet seen today, and two (`updateMany`, then `findUnique`) for one seen today by another process or before a restart | Keeps the common case at zero queries |
| P13 | `user.deleted` may arrive for a user with no row | Create the row with `deletedAt` set. The safety net never clears `deletedAt` and never overwrites a name the webhook wrote | Otherwise the next request would bring the user back as alive |
| P14 | `/e2e/cleanup` deletes by `userId`; `User` has `id` | Cleanup also deletes the caller's `User` row, last. Four places change together (task 2.6) | A fake `user.deleted` would otherwise leak `deletedAt` into every later spec |
| P15 | Nothing migrates the E2E test database | The main session runs `prisma migrate deploy` against `TEST_DIRECT_URL` after task 2.1, with the user's consent | A cloud E2E run fails with "table does not exist" until it is done |
| P16 | The design says "Svix" | No new package. `verifyWebhook` from `@clerk/express/webhooks` checks Svix-format signatures. Tests sign with `node:crypto` | `@clerk/express` 1.7.76 is installed and ships it |

---

## Phase H1 — Settings layout and route moves

**What the user gets (merged and deployed):** a new Settings layout in both modes. On desktop,
the bottom of the sidebar shows 🏠 "My data" and 👤 a user entry. Each one swaps the sidebar for
a sub-sidebar with a Back button. On mobile, `/settings` becomes a two-part accordion. Every
settings page moves under `/settings/household/…`. Old links stop working (the only production
user is the developer).

**What the developer gets:** one function decides which pages are full-screen, where today three
files copy the same six lines. Route links that were plain strings become typed `to` props where
the router allows it.

**No backend change.** `pnpm test:server` must report the same count before and after.

### File map

| File | Change |
|---|---|
| `apps/web/src/lib/layoutRules.ts` (new) | `isFullscreenPage(pathname)`, `isHouseholdSettingsPage(pathname)`, `lastAppPage(history)` |
| `apps/web/src/hooks/useIsDesktop.ts` (new) | `matchMedia` hook |
| `apps/web/src/components/ui/accordion.tsx` (new) | shadcn Accordion, adds `@radix-ui/react-accordion` |
| `apps/web/src/components/global/Sidebar/Sidebar.tsx` | three views: main, household, user |
| `apps/web/src/components/global/Sidebar/HouseholdSidebar.tsx` (new) | household items and Back |
| `apps/web/src/components/global/Sidebar/UserSidebar.tsx` (new) | user details, theme, language, data mode, Back |
| `apps/web/src/components/global/Layout/Layout.tsx`, `Navigation/Navigation.tsx` | use `isFullscreenPage` |
| `apps/web/src/routes/settings/index.tsx` | mobile accordion; desktop `Navigate` |
| `apps/web/src/routes/settings/household/…` (moved) | every route under `routes/settings/{locations,shelves,vendors,recipes,tags}` moves here, with its tests and stories |
| `apps/web/src/routes/settings/household/index.tsx` (new) | config page: title, Export, Import |
| `apps/web/src/hooks/useAppNavigation.ts` | `isSamePage` regexes |
| `apps/web/src/apollo/persistence.ts` | keep `LAST_USER_ID_KEY` on sign-out (P7) |
| `apps/web/src/i18n/locales/en.json`, `tw.json` | new keys |
| `apps/web/src/routeTree.gen.ts` | regenerated, committed |
| `e2e/pages/**`, `e2e/tests/**` | 76 code lines in 17 files move to the new routes |
| CLAUDE.md files listed in task 1.9 | route paths |

### Task 1.0 — Write the plan decisions back into the design

**Files:** `docs/global/permissions/2026-10-04-households-design.md`

- [ ] **Step 1:** In *Screens › Desktop*, add P1, P2, P4, P5 and P6 as short notes. In *Data
  model › New models*, make `email` optional (P10). In *Clerk integration*, add P11, P13, P14,
  P15 and P16.
- [ ] **Step 2:** In *Known gaps*, change "H1 touches about 48 route lines in 13 E2E files" to
  "76 code lines in 17 files (re-counted 2026-10-31)".
- [ ] **Step 3:** Commit: `docs(permissions): write the plan's decisions back into the households design`.

### Task 1.1 — One rule for full-screen pages

The same six-line check is copied in `Layout.tsx:14-20`, `Sidebar.tsx:27-33` and
`Navigation.tsx:18-24`. Move it into one function **before** the routes move, so the move
changes one place.

**Files:** create `apps/web/src/lib/layoutRules.ts` and `layoutRules.test.ts`; change the three
components.

- [ ] **Step 1: Write the failing test.** `layoutRules.test.ts`, with today's paths:

```ts
import { describe, expect, it } from 'vitest'
import { isFullscreenPage } from './layoutRules'

describe('isFullscreenPage', () => {
  it.each([
    '/onboarding',
    '/items/abc',
    '/settings/tags',
    '/settings/tags/t1/items',
    '/settings/vendors/',
    '/settings/recipes/r1',
    '/settings/shelves/s1/filters',
  ])('%s is full-screen', (path) => {
    expect(isFullscreenPage(path)).toBe(true)
  })

  it.each(['/', '/shopping', '/cooking', '/settings', '/settings/locations'])(
    '%s is not full-screen',
    (path) => {
      expect(isFullscreenPage(path)).toBe(false)
    },
  )
})
```

- [ ] **Step 2:** Run `pnpm --filter web exec vitest run src/lib/layoutRules.test.ts`. Expect a
  failure: the module does not exist.
- [ ] **Step 3: Implement** with the same rule as today, then replace the three copies with a
  call to it. No behaviour change.
- [ ] **Step 4:** Run the test and the three components' existing tests and story tests. All green.
- [ ] **Step 5: Mutation check.** Remove the `/settings/shelves` line from the function. The
  test for `/settings/shelves/s1/filters` must go red. Restore it.
- [ ] **Step 6:** Commit: `refactor(layout): one rule decides which pages are full-screen`.

### Task 1.2 — Move the routes under `/settings/household`

**Files:** move `apps/web/src/routes/settings/{locations,shelves,vendors,recipes,tags}` and
their layout files (`locations.tsx`, `shelves.tsx`, …) into
`apps/web/src/routes/settings/household/`. Move each folder's tests, stories and `CLAUDE.md`
with it. Use `git mv`, so history follows.

- [ ] **Step 1:** `git mv` each folder and layout file. Run `pnpm --filter web build` once, so
  the router plugin rewrites every `createFileRoute('/settings/…')` id and `routeTree.gen.ts`.
- [ ] **Step 2: Fix every link `tsc` reports.** These are typed `to` props (research list A,
  about 30 sites). Examples: `components/pantry/VendorGroupView.tsx:190`,
  `components/shared/LocationSwitcher/LocationSwitcher.tsx:111`, `routes/cooking.tsx:540`.
- [ ] **Step 3: Fix every plain string `tsc` cannot see.** Run
  `grep -rn "/settings/\(locations\|shelves\|vendors\|recipes\|tags\)" apps/web/src --include=*.ts --include=*.tsx | grep -v routeTree.gen`
  and fix each hit. This includes:
  - `useAppNavigation('/settings/…')` fallbacks (10 files)
  - `handleTabClick(e, \`/settings/…\`)` template strings (9 lines)
  - the `isSamePage` regexes in `hooks/useAppNavigation.ts:25-51`
  - `SettingsNavCard`'s `to: string` uses
  - `isFullscreenPage` in `lib/layoutRules.ts`, and the paths in `layoutRules.test.ts`
  - every test `initialEntries` and every seeded `app-navigation-history`
  - regex forms such as `\/settings\/tags`. Search for these separately:
    `grep -rn 'settings\\\\/' apps/web/src`.
- [ ] **Step 4:** The grep in step 3 must return nothing except comments you have checked.
- [ ] **Step 5:** Run `pnpm test:web`. Same count as the baseline (files moved, none added).
  Any "Not Found" render in a route test means a missed `initialEntries`.
- [ ] **Step 6: Mutation check on `isSamePage`.** Change the new tag regex back to the old path.
  `hooks/useAppNavigation.test.ts` must go red. Restore it.
- [ ] **Step 7:** Commit: `refactor(settings): move every settings page under /settings/household`.
  Include `routeTree.gen.ts`.

### Task 1.3 — List pages show the household sidebar on desktop

**Files:** `apps/web/src/lib/layoutRules.ts` and its test.

After the move, a household **list** page is not full-screen, and a **detail** page still is.

- [ ] **Step 1: Failing tests.** Add to `layoutRules.test.ts`:

```ts
it.each([
  '/settings/household',
  '/settings/household/locations',
  '/settings/household/tags',
  '/settings/household/tags/',
  '/settings/household/shelves',
])('%s is a household page with the sidebar', (path) => {
  expect(isFullscreenPage(path, { desktop: true })).toBe(false)
  expect(isHouseholdSettingsPage(path)).toBe(true)
})

it.each([
  '/settings/household/tags/t1',
  '/settings/household/tags/t1/',
  '/settings/household/vendors/v1/items',
  '/settings/household/shelves/s1/filters',
])('%s is a full-screen detail page', (path) => {
  expect(isFullscreenPage(path, { desktop: true })).toBe(true)
})

it('keeps every household list page full-screen on mobile, as today', () => {
  expect(isFullscreenPage('/settings/household/tags', { desktop: false })).toBe(true)
})
```

  Note the trailing slashes: TanStack renders `/…/tags/` and the detail Info tab at `/…/$id/`.
- [ ] **Step 2:** Run. Expect failures. The second argument is required, with no default, so a
  caller cannot forget the screen size. Update the task 1.1 tests to pass it.
- [ ] **Step 3: Implement.** A household list page is `/settings/household` or
  `/settings/household/<section>` with an optional trailing slash. Anything deeper is a detail
  page. Locations has no detail page in H1 (P6).
- [ ] **Step 4:** Pass `{ desktop: useIsDesktop() }` from the components (the hook comes in task
  1.4; until then pass `true` in the test only).
- [ ] **Step 5: Mutation check.** Make the list rule match one level deeper. The
  `/settings/household/tags/t1` case must go red.
- [ ] **Step 6:** Commit: `feat(layout): household list pages keep the sidebar on desktop`.

### Task 1.4 — `useIsDesktop` and the shadcn Accordion

**Files:** create `apps/web/src/hooks/useIsDesktop.ts` and test; add `components/ui/accordion.tsx`
with `pnpm --filter web dlx shadcn@latest add accordion` (check `apps/web/components.json`).

- [ ] **Step 1: Failing test.** Mock `window.matchMedia` to return `matches: true`, then fire a
  `change` event with `matches: false`. The hook must return `true`, then `false`.
  `apps/web/src/test/setup.ts:381-393` mocks `matchMedia` as always `false`; override it per test.
- [ ] **Step 2:** Implement with `useSyncExternalStore` over `matchMedia('(min-width: 1024px)')`.
  Return `false` when `matchMedia` is missing.
- [ ] **Step 3:** Add the accordion. Check the generated file passes `pnpm --filter web check`.
- [ ] **Step 4: Mutation check.** Make the hook ignore the `change` event. The test must go red.
- [ ] **Step 5:** Commit: `feat(web): add useIsDesktop and the accordion component`.

### Task 1.5 — The household config page and `/settings`

**Files:** create `apps/web/src/routes/settings/household/index.tsx`, its test, story and story
test; rewrite `apps/web/src/routes/settings/index.tsx` and its test and stories.

- [ ] **Step 1: Failing tests.**
  - `/settings/household` shows the title "My data" (P3), `ExportCard` and `ImportCard`. No
    danger zone (P5).
  - `/settings` with `useIsDesktop` mocked `true` lands on `/settings/household`
    (`router.state.location.pathname`).
  - `/settings` with it mocked `false` shows an accordion with two items: 🏠 "My data", open,
    and 👤 the user item, closed. The household item lists Locations, Shelves, Vendors, Recipes,
    Tags as links to the new routes. The user item holds the same content as the user sidebar
    (task 1.7).
- [ ] **Step 2:** Run. Expect failures.
- [ ] **Step 3: Implement.** On desktop render `<Navigate to="/settings/household" replace />`.
  Reuse `SettingsNavCard` for the five links, and type its `to` prop as a route path instead of
  `string` so `tsc` checks it.
- [ ] **Step 4:** i18n: add `settings.household.title` ("My data" / 「我的資料」) and
  `settings.user.title` ("Preferences" in local mode / the user's name in cloud) to `en.json`
  and `tw.json`. `locales.test.ts` must pass.
- [ ] **Step 5: Mutation check.** Remove the `Navigate`. The desktop test must go red.
- [ ] **Step 6:** Commit: `feat(settings): household config page and the mobile accordion`.

### Task 1.6 — The household sidebar

**Files:** create `Sidebar/HouseholdSidebar.tsx` with test, story and story test; change
`Sidebar.tsx`, its test and stories.

- [ ] **Step 1: Failing tests** (`Sidebar.test.tsx`, router at the given path, `useIsDesktop` true):
  - At `/`, the bottom block shows two buttons: 🏠 "My data" and 👤 the user item. The labels
    `['Pantry', 'Shopping', 'Cooking']` stay in the top block. **Replace** the old test at
    `Sidebar.test.tsx:107-133` that expects `'Settings'` and `mt-auto`; do not leave both.
  - At `/settings/household/tags`, the sidebar shows **Back** and six items: Config, Locations,
    Shelves, Vendors, Recipes, Tags (P4). Tags is marked active.
  - Back navigates to the last Pantry, Shopping or Cooking URL in `app-navigation-history`,
    including its search string (P9). With none, it goes to `/`.
  - At `/settings/household/tags/t1`, no sidebar renders.
- [ ] **Step 2:** Run. Expect failures.
- [ ] **Step 3: Implement.** The URL decides the household view (`isHouseholdSettingsPage`).
  Write `lastAppPage(history)` in `lib/layoutRules.ts` with its own unit tests. Keep the
  `w-56` width and the existing link styling.
- [ ] **Step 4:** Remove the per-page Back buttons from the five list pages **on desktop only**
  (`lg:hidden`), because the sidebar now has Back. Mobile keeps them (P1). Their fallback is now
  `/settings`.
- [ ] **Step 5: Mutation checks.** (a) Make `lastAppPage` return the newest entry of any kind.
  The Back test must go red. (b) Drop the household branch from `Sidebar`. The six-items test
  must go red.
- [ ] **Step 6:** Commit: `feat(sidebar): household sidebar with Back`.

### Task 1.7 — The user sidebar, and sign-out from any page

**Files:** create `Sidebar/UserSidebar.tsx` with test, story and story test; change
`apps/web/src/apollo/persistence.ts` and its test; adjust `ThemeCard`, `LanguageCard` and
`DataModeCard` only if they do not fit 224 px.

The user sidebar has no route. Its open state lives in `Sidebar` (`useState`), so a page reload
closes it. Its content renders inside the sidebar.

- [ ] **Step 1: Failing tests.**
  - Clicking 👤 replaces the main view with: Back, then (cloud only) name, email, last sign-in
    and account created date; then theme, language and data mode. Back returns to the main view.
  - In local mode, the 👤 label is "Preferences" and no name, email or date renders.
  - The cloud details come from Clerk `useUser()`, only inside a `…WithUser` child, as in
    `DataModeCard.tsx:53` and `:181`. In E2E cloud mode
    (`import.meta.env.VITE_E2E_TEST_USER_ID` set) render the E2E stand-in. Test both.
- [ ] **Step 2: Failing test for P7**, in `apollo/persistence.test.ts`: after `clearCache()`,
  `getLastSignedInUserId()` still returns the previous id. Then, in
  `ApolloWrapper` terms: a different user id signing in calls `clearCache()` again.
- [ ] **Step 3:** Run. Expect failures.
- [ ] **Step 4: Implement.** Delete the `localStorage.removeItem(LAST_USER_ID_KEY)` line in
  `clearCache()` and rewrite its comment: sign-out can now happen on any page, so a watch query
  may refill `cloudCache` before the next sign-in, and the key is what makes the next account
  clear it.
- [ ] **Step 5:** Check the three cards at 224 px in Storybook. If one overflows, add a
  `compact` prop rather than a second component.
- [ ] **Step 6: Mutation checks.** (a) Put the `removeItem` line back. The P7 test must go red.
  (b) Render the cloud details in local mode. The local test must go red.
- [ ] **Step 7:** Commit: `feat(sidebar): user sidebar, and keep the purge guard armed after sign-out`.

### Task 1.8 — E2E: move the routes and the sidebar tests

**Files:** 17 files under `e2e/` (76 code lines, 109 lines with comments). The biggest is
`e2e/tests/a11y.spec.ts` (26 code lines).

- [ ] **Step 1:** Re-count first:
  `grep -rn "settings" e2e --include=*.ts | grep -E "/settings|settings\\\\/" | wc -l`.
  Write the number in your report.
- [ ] **Step 2:** Update page objects first (`e2e/pages/SettingsPage.ts`,
  `e2e/pages/settings/*.ts`), then specs. Include regex forms and `startsWith` checks.
- [ ] **Step 3: Rewrite, do not re-point,** `e2e/tests/settings-global-pages.spec.ts:236-262`.
  It measures the old Settings link. It must now check that 🏠 and 👤 sit at the bottom of the
  sidebar, and that 🏠 opens the household sidebar.
- [ ] **Step 4:** Add to `e2e/tests/a11y.spec.ts`: light and dark scans of
  `/settings/household` and of the open user sidebar, desktop and mobile (root `CLAUDE.md`
  requires both themes for a new page).
- [ ] **Step 5:** Run the specs you touched in `local`, then in `cloud`, by path, never
  `--grep`. Include `a11y.spec.ts`. One project at a time.
- [ ] **Step 6:** Commit: `test(e2e): follow the settings pages to /settings/household`.

### Task 1.9 — Docs, then the final gate

- [ ] **Step 1:** Update the CLAUDE.md files that name old routes:
  `apps/web/src/routes/settings/CLAUDE.md`, the four moved folder `CLAUDE.md` files (shelves has none),
  `apps/web/src/routes/CLAUDE.md` (lines 75, 174, 302, 377), `apps/web/src/components/CLAUDE.md`
  (29, 31-33, 210), `apps/web/src/i18n/CLAUDE.md` (36), `apps/web/src/hooks/CLAUDE.md` (167),
  and root `CLAUDE.md` (the settings index, about 183-187). Two folder docs list `new.tsx` files
  that do not exist; delete those lines.
- [ ] **Step 2:** `docs/INDEX.md`: permissions row → "🔄 In Progress (H1 built)".
- [ ] **Step 3:** Full gate from root `CLAUDE.md`, then `pnpm test:e2e:all`. All three projects
  green. Server test count unchanged.
- [ ] **Step 4:** Commit the docs. `git status` clean.

---

## Phase H2 — `User` model, Clerk webhook, `lastSeenAt`, E2E support

**What the user gets:** nothing visible. It is groundwork for H3, which needs a `User` row to
name an owner.

**What the developer gets:** the server knows who a person is (name, email) without asking
Clerk on each request. Cloud E2E gets a second-user route, which H5 and H6 need.

**Cost, accepted:** one more model in `/e2e/cleanup`, so the list of models there grows from 14
to 15 and four places must change together (task 2.6).

### File map

| File | Change |
|---|---|
| `apps/server/prisma/schema.prisma` | `model User` |
| `apps/server/prisma/migrations/20261101000000_add_user/migration.sql` (new; pick the real date when written) | create table |
| `apps/server/scripts/verify-migration.ts` | new entry and assertions |
| `apps/server/src/lib/userRow.ts` (new) | `userRowFromClerk(json)`, `ensureUser(ctx…)`, `touchLastSeen(userId)` |
| `apps/server/src/lib/clerkWebhook.ts` (new) | `handleClerkEvent(evt)` — a `switch` on `evt.type` |
| `apps/server/src/test/userFake.ts` (new) | Prisma double for `User` |
| `apps/server/src/index.ts` | webhook route above `express.json`; context calls `ensureUser`; E2E routes |
| `apps/server/.env.example` | `CLERK_WEBHOOK_SIGNING_SECRET` |
| `e2e/helpers/cloudTeardown.ts`, `e2e/tests/cleanup-endpoint.spec.ts`, `e2e/CLAUDE.md` | 15th model |
| `e2e/helpers/cloudUsers.ts` (new) | `createCloudUser`, `sendFakeUserDeleted` |

### Task 2.1 — The `User` model and migration

- [ ] **Step 1:** Add to `schema.prisma`:

```prisma
model User {
  // The Clerk user id. Also the race guard for first sign-in in H3: two
  // concurrent first requests cannot both create this row.
  id          String    @id
  displayName String
  // Optional: a Clerk account may sign in by phone or username, and the
  // user.deleted event carries no email.
  email       String?
  lastSeenAt  DateTime?
  deletedAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

  No relation to other models yet. H3 adds them.
- [ ] **Step 2:** Write the migration by hand, `YYYYMMDD000000_add_user`, following
  `apps/server/prisma/CLAUDE.md`: a `--` comment saying why, then `CREATE TABLE "User"`. Quote
  `"User"`; `user` is a reserved word in Postgres. Check it with a diff that needs no database: save the old schema from
  `HEAD:apps/server/prisma/schema.prisma` to a file, then run
  `prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel prisma/schema.prisma --script`
  and compare its SQL with the migration. **Never pass `TEST_DIRECT_URL` as
  `--shadow-database-url`:** Prisma resets a shadow database, so that wipes the test database.
  This plan said to, until task 2.1 found it.
- [ ] **Step 3:** `verify-migration.ts`: add the folder to `MIGRATIONS` (about lines 259-265)
  and the header comment (about 5-24). Assert: the table exists; `email`, `lastSeenAt`, `deletedAt` are
  nullable; `displayName` is not; a second insert with the same `id` fails with `P2002`, as the
  block at about 418-429 does. Do **not** touch the `isDefault` assertions; H3 owns them.
- [ ] **Step 4:** Root `pnpm build` (it runs `prisma generate`). Server tests unchanged.
- [ ] **Step 5:** Commit: `feat(server): add the User model`.
- [ ] **Step 6 (main session, not a subagent):** ask the user for consent, then run
  `verify:migration` against the test database, then `prisma migrate deploy` against
  `TEST_DIRECT_URL` (P15). `verify:migration` runs `migrate reset`; it must only ever point at
  `TEST_*`. Run the root `pnpm build` first, so the Prisma client knows `prisma.user`. After the
  deploy, compare the real database with the schema, read-only:
  `prisma migrate diff --from-url "$TEST_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script`
  must print an empty script. Record the output in the task report.

### Task 2.2 — `userFake`

**Files:** `apps/server/src/test/userFake.ts` and `userFake.test.ts`.

`ownedRowFake` needs a `userId` on every row, so it does not fit. Follow its rules:

| The fake | Because |
|---|---|
| applies `where` key by key, and **throws** on a key it does not know | a dropped condition must not pass silently |
| `create` honours `data.id` and raises `P2002` on a taken id | the primary key is the race guard |
| `upsert` keeps `create` and `update` apart and applies `update` with `value !== undefined` | Prisma's rule, see root `CLAUDE.md` |
| `updateMany` supports `id`, `lastSeenAt: null`, `lastSeenAt: { lt }` and `OR`, and returns `{ count }` | task 2.4's one-query update |
| never invents timestamps except `createdAt` / `updatedAt` | so a test can see a missing `lastSeenAt` write |

- [ ] **Step 1:** Write `userFake.test.ts` with one test per row above. Run; expect failures.
- [ ] **Step 2:** Implement.
- [ ] **Step 3: Mutation check.** Make `updateMany` ignore `OR`. Its test must go red.
- [ ] **Step 4:** Commit: `test(server): add userFake, a Prisma double for User`.

### Task 2.3 — The webhook

**Files:** `apps/server/src/lib/clerkWebhook.ts` and test; `apps/server/src/lib/userRow.ts`
(`userRowFromClerk`) and test; `apps/server/src/index.ts`; `apps/server/.env.example`.

- [ ] **Step 1: Failing tests for `userRowFromClerk`** (pure function, like `lib/cors.test.ts`):
  - first and last name → `displayName` "ET Blue"; primary email chosen by
    `primary_email_address_id`
  - no name → the part of the email before `@`; no name and no email → `"User"` (P10)
- [ ] **Step 2: Failing tests for `handleClerkEvent`**, using `userFake`:
  - `user.created` and `user.updated` **upsert**. `user.updated` before `user.created` works.
    A repeated event (Svix retries) leaves one row.
  - `user.updated` never clears `deletedAt`.
  - `user.deleted` sets `deletedAt`. For an unknown id it creates the row with `deletedAt` set
    and `displayName` `"Deleted user"` (P13). Nothing else changes in H2; H6 adds the hand-over
    branch here.
  - An unknown event type does nothing and does not throw.
- [ ] **Step 3: Failing test for the route's verify step.** Put the Express handler in
  `clerkWebhook.ts` as `clerkWebhookHandler(req, res)` so it can be tested without importing
  `index.ts` (which starts a server at load). Sign test payloads with `node:crypto`: base64
  HMAC-SHA256 of `${svixId}.${svixTimestamp}.${body}`, keyed with the base64 part after
  `whsec_`, header `svix-signature: v1,<sig>`, timestamp within 5 minutes. Cases:
  - good signature → 200 and the row is written
  - bad signature → 400 and **nothing** is written
  - old timestamp with a good signature → 400
  - `CLERK_WEBHOOK_SIGNING_SECRET` unset → 500 and nothing is written
- [ ] **Step 4:** Run. Expect failures.
- [ ] **Step 5: Implement.** Use `verifyWebhook` from `@clerk/express/webhooks`. Mount
  `app.post('/webhooks/clerk', express.raw({ type: 'application/json' }), clerkWebhookHandler)`
  **above** `app.use(express.json(…))` at `index.ts:32`. If it is mounted below, the body is
  already parsed and the signature check compares re-serialized JSON with the signed bytes.
- [ ] **Step 6:** Add a source-text test (like `purge-coverage.test.ts`) that reads `index.ts`
  and checks the webhook route appears **before** `express.json(`. `index.ts` cannot be
  imported in a test, so this is the only guard on the order.
- [ ] **Step 7: Mutation checks.** (a) Skip the verify call. The bad-signature test must go red.
  (b) Move the route below `express.json`. The source-text test must go red.
- [ ] **Step 8:** Add `CLERK_WEBHOOK_SIGNING_SECRET=` to `.env.example` with a comment.
- [ ] **Step 9:** Commit: `feat(server): verify and handle Clerk user webhooks`.

### Task 2.4 — The request-path safety net and `lastSeenAt`

**Files:** `apps/server/src/lib/userRow.ts` (`ensureUser`, `touchLastSeen`) and test;
`apps/server/src/index.ts` (context, lines 135-144).

- [ ] **Step 1: Failing tests**, with `userFake` methods wrapped in `vi.fn` to count queries (as
  `lib/defaultLocation.test.ts:7-18` does):
  - A user with a row seen today: **0** queries on the second call in the same process (P12).
  - A user with a row seen yesterday: **1** query (`updateMany`), and `lastSeenAt` moves to now.
  - A user with no row: the row is created with values from Clerk. Clerk is called once.
  - The Clerk lookup throws: the row is created with fallback values, and `ensureUser` does
    **not** throw (P11).
  - E2E mode: no Clerk call; `displayName` is the user id.
  - Ten parallel calls for a new user give one row, one Clerk call and no error: parallel calls
    for one user share one run (an `inFlight` map, added after review). A separate test covers
    `P2002` from another process (`P2002` is caught. Built without a re-read: `id` is the only unique column, so `P2002`
    already proves the row exists, and no caller needs the row back. If H3 needs the row back,
    or a second unique column is added, this changes).
  - Each `lastSeenAt` state (never seen, yesterday, earlier today by another process) takes a
    different path. The P13 test runs over all three.
  - A row with `deletedAt` set is never changed back, and its name is not overwritten (P13).
- [ ] **Step 2:** Run. Expect failures.
- [ ] **Step 3: Implement.** Pass the Clerk lookup in as an argument
  (`async (id) => (await clerkClient.users.getUser(id)).raw`; `getUser` returns a class with
  camelCase fields, and `.raw` is the `UserJSON`, which can be `null`), so tests do not mock the module. Call `ensureUser`
  in the context function after the user id is known, **in both branches**: the E2E branch
  returns early at line 140, so code placed after line 141 would never run in E2E. Wrap the call
  so any error is logged and the request continues.
- [ ] **Step 4: Mutation checks.** (a) Remove the per-process memory. The 0-queries test must go
  red. (b) Remove the `try`/`catch` around the Clerk call. The Clerk-fails test must go red.
- [ ] **Step 5:** Commit: `feat(server): create a missing User row and record lastSeenAt`.

### Task 2.5 — E2E-only user routes

**Files:** `apps/server/src/index.ts` (inside the `if (E2E_TEST_MODE)` block, lines 37-127);
`e2e/helpers/cloudUsers.ts`; a source-text server test.

- [ ] **Step 1:** Add `POST /e2e/users` (body `{ id, displayName, email? }`, upsert) and
  `POST /e2e/users/:id/deleted`, which calls `handleClerkEvent` with a `user.deleted` event
  at the point the real webhook reaches after its verify step, with no verify of its own. Never add a test secret, so no test signing key can reach
  production.
- [ ] **Step 2:** Extend the source-text test from task 2.3: both routes appear only inside the
  `if (E2E_TEST_MODE)` block.
- [ ] **Step 3:** `e2e/helpers/cloudUsers.ts`: `createCloudUser(request, id, name, email?)` and
  `sendFakeUserDeleted(request, id)`. The id is required: task 2.6 seeds `E2E_USER_ID` with it,
  and later phases use `E2E_SECOND_USER_ID` (`e2e/constants.ts:38`).
- [ ] **Step 4: Mutation check.** Move one route outside the block. The source-text test must go red.
- [ ] **Step 5:** Commit: `test(e2e): add test-mode routes to create users and fake a deletion`.

### Task 2.6 — Cleanup deletes the `User` row (15 models)

Four places change together (`e2e/CLAUDE.md` lines 194-285):

> **As built:** the cleanup handler moved out of `index.ts` into
> `apps/server/src/lib/e2eCleanup.ts` (`e2eCleanupHandler`), so a unit test can call it.
> `index.ts` starts a server when it loads, so no test can import it.
> `lib/e2eCleanup.test.ts` pins the order of the deletes and that `forgetSeenToday` runs
> after they commit. `index.ts` only mounts the route, inside the `if (E2E_TEST_MODE)` block.

- [ ] **Step 1:** `index.ts`: add `prisma.user.deleteMany({ where: { id: userId } })` **last** in
  the cleanup transaction; update the `deleted` object and the "14" comment at line 102.
  **Then call `forgetSeenToday(userId)`** (`lib/userRow.ts`, task 2.4). Without it the
  per-process memory still says "seen today", so the next request skips `ensureUser` and the
  row is never created again that day.
  **`forgetSeenToday` alone is not enough** (found in review). A run already in progress can
  find the row, lose it to the cleanup, and then write "seen today" back. `forgetSeenToday`
  must also drop the run from `inFlight` and bump a generation counter, and a run may only
  remember a user if the generation has not changed since it started.
- [ ] **Step 2:** `e2e/helpers/cloudTeardown.ts`: add `users` (plural, like every other key) to `CLEANUP_MODEL_KEYS`.
- [ ] **Step 3:** `e2e/tests/cleanup-endpoint.spec.ts`: seed a `User` row with
  `createCloudUser`, so the at-least-1 check at line 274 covers it.
- [ ] **Step 4:** `e2e/CLAUDE.md`: 14 → 15, and say why `purge-coverage.test.ts` does not list
  `User` (it has `id`, not `userId`).
- [ ] **Step 5: Mutation check.** Change the new `deleteMany`'s `where` to `{ id: 'nobody' }`.
  `cleanup-endpoint.spec.ts` must go red in `cloud`, on the `users` count. **Do not remove the
  line instead:** the transaction then returns 14 results, the handler throws reading
  `users.count`, and the route answers 500. `cleanupCloudData` fails in `beforeEach`, before
  the count check runs. That is red, but for the wrong reason.
- [ ] **Step 6:** Commit: `test(e2e): clean up the User row between specs`.

### Task 2.7 — One real-SQL spec, docs, final gate

- [ ] **Step 1:** New cloud-only spec `e2e/tests/cloud-user-row.spec.ts`, no browser (like
  `location-scoped-writes.spec.ts`): a GraphQL request as a new user creates exactly one `User`
  row; `sendFakeUserDeleted` sets `deletedAt`; a later request does not clear it. Add it to the
  `cloud` project's `testMatch` **and** the `local` project's `testIgnore`.

  > **As built:** GraphQL has no `User` type, so the spec reads the row through a new
  > E2E-only route, `GET /e2e/users/:id` (`e2eReadUserHandler` in `lib/e2eUsers.ts`, helper
  > `readCloudUser`), inside the `if (E2E_TEST_MODE)` block and covered by
  > `webhookRouteOrder.test.ts`. Each test uses its own user id. **The "later request" case
  > marks the user deleted BEFORE the first request.** In the order this step names
  > (request, delete, request), the second request hits the per-process "seen today" memory
  > and makes 0 queries, so it could not clear `deletedAt` even if the code tried. The test
  > instead checks that `lastSeenAt` went from `null` to set, which proves the request
  > reached the row.
- [ ] **Step 2:** Docs: root `CLAUDE.md` *Authorization (cloud)* gets one paragraph on the
  `User` row and the webhook. `docs/INDEX.md` → "H2 built". A deploy note in the PR: set
  `CLERK_WEBHOOK_SIGNING_SECRET` in Railway and add the endpoint in the Clerk dashboard
  (events `user.created`, `user.updated`, `user.deleted`) **before** merging.
- [ ] **Step 3:** Full gate, then `pnpm test:e2e:all`.
- [ ] **Step 4:** Commit; `git status` clean.

---

## Phases H3–H7 — outline

Each gets its own detailed plan. These lists are what that plan must cover. They come from the
design and from the issues filed on `main`.

### H3 — Households, roles, migration, read scoping

**H3 is now three PRs, plus one fix that came first** (agreed with the owner on 2026-11-04).
The detailed plan is [2026-11-04-households-plan-h3a.md](2026-11-04-households-plan-h3a.md).
Its decisions H1–H16 are written back into the design. (Decision numbers H1–H16 are not the
phases H1–H7.)

| Order | PR | Contents |
|---|---|---|
| 1 | `fix/catalog-write-scope` | ✅ Merged 2026-11-04 (#371). Seven tag, tag type and vendor writes check ownership through `requireOwnRowOrUnclaimed` |
| 2 | **H3a** | Households, roles, the data migration, first sign-in, scoping for every resolver, `isDefault` removed, the household name in the 🏠 label, rename |
| 3 | `chore/build-shared-types` | A build step for `@p1i/types`, so the server can import shared code at runtime |
| 4 | **H3b** | Shared carts. Must merge before H5 starts |

The outline below is the first version. Each bullet is marked with where it went: **[H3a]**,
**[H3b]**, **[H7]**, or a mix. Where the H3a plan changed the bullet, the change follows it.

- Models `Household`, `HouseholdMember`, `LocationMember`, `LocationPreference`,
  `UserPreference` (decide here whether it merges into `User`). `householdId` on `Location` and
  the six catalog models. `Location.order`, `isDefault` and its partial index dropped.
  `dataUpdatedAt` and its writers. One migration with a deploy runbook and a check against a
  branch of production data.
  - **[H3a]** `Household`, `HouseholdMember`, `LocationMember`, `householdId`, `isDefault` and
    its index dropped, the runbook and the production-branch check. **Two** migrations, not
    one (decision H16).
  - **[H7]** `LocationPreference`, `UserPreference` and `dataUpdatedAt` with its writers
    (decision H6). `Location.order` is **kept** until H7 (decision H5).
- First sign-in in one transaction, guarded by the `User` primary key. Delete
  `ensureDefaultLocation` and the four places that argue from its index (#360).
  - **[H3a]** The `User` primary key cannot be the guard any more: phase H2 creates the `User`
    row first. The guard is a claim column, `User.householdSetupAt` (decision H1).
- Real role checks in `requireLocationRole` (rename roles to `viewer | participant | organizer`)
  and the new `requireHouseholdRole`. Read scoping for every query. Fixes #273. **[H3a]**
- Re-derive all nine `CartItem.userId` filters; one row per item per cart; drop `Cart.userId`
  (#358). Shared-cart checkout in one transaction, with the server computing the log total;
  move `buildCheckoutLogQuantities` to shared code; the same for `consumeRecipes`. **[H3b]**
  (decisions H7 and H8)
  - **There are 15 `CartItem.userId` filters, not nine** (research 2026-11-03, measured at
    `e48bbe2f`; line numbers drift):
    - `apps/server/src/resolvers/cart.resolver.ts` 137, 159, 161, 166, 174, 190, 201, 228,
      375, 454
    - `apps/server/src/resolvers/itemStock.resolver.ts` 199
    - `apps/server/src/resolvers/import.resolver.ts` 1577
    - `apps/server/src/resolvers/purge.resolver.ts` 26
    - `apps/server/src/lib/e2eCleanup.ts` 83
    - `apps/server/src/lib/authz.ts` 152, through the `cartItem` delegate
  - H3a already changes three of them: `purge.resolver.ts` (removed with `purgeUserData`),
    `import.resolver.ts` (`clearAllData`) and `e2eCleanup.ts` (H3a task 3.10).
- Before changing the purge filters: the 11 missing `where` assertions in both paths, and a
  filter-form check in `purge-coverage.test.ts` (#320). Remove `purgeUserData`; `clearAllData`
  becomes the household clear. **[H3a]** (tasks 3.2 and 3.10). The real-SQL two-household test
  listed under H6 below also moved to H3a (decision H10).
- Remove the six `userId: String!` GraphQL fields only after a web build from `8465406b` or later
  is live (#359). **[H3a]** (task 3.14, decision H11)
- Fakes for the new models that honour every `where` key and the primary keys. Every role test
  has a second person with a different role and a location the caller has no role on.
  **[H3a]** (tasks 3.1 and 3.4; plus an E2E-only second-member route, decision H9)
- Rewrite the E2E specs and helpers that depend on the default location
  (`data-mode-migration.spec.ts`, `import-strategies.spec.ts`, `backupAssertions.ts`,
  `cloudSeed.ts`). Add the migration to `verify-migration.ts`. **[H3a]** (tasks 3.3, 3.14 and
  3.15; about 20 E2E files, not four)
- Cloud UI: the 🏠 label shows the household name. **[H3a]** (task 3.13), plus
  `renameHousehold` (decision H4)

### H4 — Import and export

- Export: catalog, plus locations where the exporter has a role.
- Import: owner and manager only; `clear` owner only. The new id rule; the "Import into which
  location?" dialog for the local default and for files with no locations.
- `requireOwnRowOrUnclaimed`'s body: catalog models check the **target** household; `Cart`,
  `InventoryLog`, `CartItem` check through their location; a cart id must start with
  `${locationId}:` and the location check runs first (#361). Correct the "cuid" comment.
- Refusal messages say "another household" (three i18n keys, both languages).
- Keep the `mode` term in `runBulkBatches`' batch key (#330); keep the colliding item **and** the
  new item in `import-strategies.spec.ts`.

### H5 — Invites, join, members, read-only views

- `HouseholdInvite`, `/join/$token`, Members page, location people page
  (`/settings/household/locations/$id`), switcher filtering and the **View only** badge,
  read-only views for members and viewers, the empty "no locations" screens.
- Two-user cloud E2E with one browser context per user.

### H6 — Transfer, hand-over, purges, activity

- `OwnershipOffer`, the banner, transfer, the `user.deleted` hand-over branch in
  `handleClerkEvent`, the three purges and the danger zone, `HouseholdActivity` and its page.
- Real-SQL test with two households: a purge of one leaves the other's rows. **Moved to H3a**
  (decision H10, `e2e/tests/purge-two-households.spec.ts`), because H3a changes the filters.
  H6 still owes the same kind of test for its new purges.

### H7 — Personal order, household switch and create

- `LocationPreference` order and the four sorts; Switch to… and Create new.
- **Moved here from H3** (H3a plan decisions H5 and H6): the `LocationPreference` and
  `UserPreference` tables, `Location.dataUpdatedAt` and its writers, and copying the shared
  `Location.order` into each person's `customOrder`.
- The household switch must set the active location and clear the household-scoped Apollo cache
  (including the persisted `Player1InventoryCloudCache`) in one step. A test switches with a
  cart in the old household and sees no old rows.

---

## Execution

Run this plan with `superpowers:subagent-driven-development`: one fresh subagent per task, a
review between tasks, and the main session reporting each task's result to the user. Task 2.1
step 6 is run by the main session, with the user's consent.
