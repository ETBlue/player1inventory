# Location switcher in the desktop sidebar

**Date:** 2026-08-22
**Branch:** `worktree-feature-location-aware-shopping-cooking` (PR #244 — folded in)
**Base:** `da15d6ad`
**Spec origin:** designer session 2026-08-22, logged in
[`2026-08-22-brainstorming-sidebar-location-switcher.md`](./2026-08-22-brainstorming-sidebar-location-switcher.md)

## The rule

| Breakpoint | Sidebar | Page toolbar |
|---|---|---|
| `< lg` | not rendered (`hidden lg:flex`) | switcher, compact glyph — **unchanged** |
| `>= lg` | switcher, full-width with name | switcher **hidden** (`lg:hidden`) |

Exactly one switcher is visible at any width. The set of pages that have a
switcher does not change.

## Task 1 — a second variant on `LocationSwitcher`

`components/shared/LocationSwitcher/LocationSwitcher.tsx` renders an
icon-sized `Button` whose label is the first letter of the active location.
That is right for a contested toolbar and wrong for a 224px sidebar column.

Add a `variant` prop, defaulting to today's behaviour so all 11 existing call
sites keep working untouched:

```ts
variant?: 'compact' | 'full'   // default 'compact'
```

- `compact` — byte-identical to today. Do not change its markup, classes, or
  `aria-label`; it is covered by existing tests and an E2E spec.
- `full` — full-width trigger showing the location **name** (not the initial),
  a leading location icon, and a trailing chevron, sized to sit inside the
  sidebar's `px-2` column. Names render **as stored** — the vendor-name rule in
  the root `CLAUDE.md` applies to locations too, so no `capitalize`.

Both variants share one `DropdownMenu`; only the trigger differs. Do not fork
the component.

Update the component docstring — it currently says "for the top toolbar of
pantry/shopping/cooking", which stops being the whole truth.

## Task 2 — mount it in the sidebar

`components/global/Sidebar/Sidebar.tsx`, between the `<h1>` app title and the
nav-links `<div>`, matching the approved mockup:

```
Player 1            ← h1
[ 📍 Home      ▾ ]  ← switcher, variant="full"
🏠 Pantry
🛒 Shopping
...
```

Note `Sidebar` returns `null` on fullscreen pages. That is correct and stays:
those pages have no switcher today either.

## Task 3 — hide the toolbar copy at `lg+`

All 11 sites wrap their `<LocationSwitcher />` so it disappears at `lg`:

| File |
|---|
| `components/pantry/PantryListView.tsx` |
| `components/pantry/ShelfGroupView.tsx` |
| `components/pantry/VendorGroupView.tsx` |
| `components/pantry/RecipeGroupView.tsx` |
| `components/pantry/ShelfDetailView.tsx` |
| `components/pantry/VendorDetailView.tsx` |
| `components/pantry/RecipeDetailView.tsx` |
| `routes/cooking.tsx` |
| `routes/shopping/index.tsx` |
| `routes/shopping/$vendorId.tsx` |

(10 files; `LocationSwitcher.tsx` itself is the 11th grep hit.)

Prefer a `className` prop on `LocationSwitcher` over 10 wrapper `<div>`s — a
wrapper div changes flex layout inside those toolbars and risks shifting the
adjacent back-button spacing that was deliberately set earlier in this PR.

## ⚠️ Two failure modes specific to this change

**1. Duplicate accessible name in jsdom.** Tailwind's `lg:hidden` is
`display: none` at runtime, which removes the node from the a11y tree — so at a
real desktop viewport only one switcher is reachable. **jsdom loads no CSS**, so
in unit tests *both* copies are present in the DOM and a `getByRole` /
`getByLabelText` for the trigger would throw a strict-mode "found multiple"
error. Route-level tests do **not** render `Layout`, so they are safe; anything
that renders `Layout` + a page together is not. Check the story harness before
assuming.

**2. Playwright resolves to the sidebar copy, silently.** Playwright's default
viewport is 1280×720, which is `>= lg`. `e2e/tests/location-switcher.spec.ts:66`
targets the trigger by `locationSwitcher.triggerLabel`. After this change that
selector matches the **sidebar** switcher, not the toolbar one — the spec may
keep passing while testing a different element than its comments claim. Update
the spec's comments and add explicit coverage of both breakpoints rather than
letting it drift.

## Testing

- **`LocationSwitcher`**: unit tests for both variants — `compact` renders the
  initial, `full` renders the full name; both open the same menu and both
  set the active location. Stories for both variants plus a matching
  `.stories.test.tsx`.
- **`Sidebar`**: renders the switcher on a normal page; renders **no** switcher
  on a fullscreen page (it returns `null` there).
- **E2E, both breakpoints** — this is the assertion that actually pins the
  requirement:
  - desktop (default viewport): the switcher is in the sidebar, and the page
    toolbar has none.
  - mobile (390×844, matching the existing `mobile viewport a11y` block): the
    switcher is in the toolbar, and there is no sidebar.
  A test that only runs at one width cannot distinguish this change from a
  no-op.
- **a11y**: add the desktop sidebar switcher to the existing scans. Expect the
  4 known pre-existing colour-contrast failures (shelves, vendor group-by,
  recipe group-by, shelves-mobile) to remain, unchanged and no more.

## Out of scope

- Removing the toolbar mounts. Mobile has no sidebar.
- Changing which pages render a switcher.
- The mobile bottom `Navigation` component.

## Verification

Standard gate after each commit, from the repo root, each in its own subshell:

```bash
(cd apps/web && pnpm lint)
pnpm build 2>&1 | tee /tmp/p1i-build.log   # root build — only full type-check of both tsc targets
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo FAIL || echo OK
(cd apps/web && pnpm test --run)
```

Baseline: **1629 tests / 201 files green**; `routes/shopping/index.tsx` carries
exactly 4 pre-existing Biome warnings.

Final: `pnpm test:e2e --grep "shopping|cooking|items|location|a11y"`. Baseline
captured at `da15d6ad`: **80 passed / 8 skipped / 4 failed**.
