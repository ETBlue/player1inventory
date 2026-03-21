# A11y Plan 1 — Critical & High Fixes

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Fix all WCAG 2.1 A violations and high-severity AA gaps identified in the March 2026 audit. These are pure code changes — no visual testing required.

**Scope:** 5 issues across 8 files.

**WCAG References:**
- 1.1.1 Non-text Content (A) — icon-only elements need text alternatives
- 1.3.1 Info and Relationships (A) — semantic HTML must convey structure
- 2.1.1 Keyboard (A) — all functionality must be keyboard accessible
- 2.4.1 Bypass Blocks (A) — skip navigation link required
- 4.1.3 Status Messages (A) — status changes must be announced to screen readers

---

## Task 1: Navigation `aria-label`

**Issue:** The bottom navigation bar has 4 icon-only `<Link>` elements with no accessible name. Screen reader users hear "link" with no indication of destination.

**Files:**
- `apps/web/src/components/Navigation/index.tsx`

**Step 1: Read the file**

Read `src/components/Navigation/index.tsx` to identify the 4 nav links and their icon imports.

**Step 2: Add `aria-label` to each nav link**

Add descriptive `aria-label` to each `<Link>`:
- Pantry / Warehouse icon → `aria-label="Pantry"`
- Shopping / ShoppingCart icon → `aria-label="Shopping"`
- Cooking / CookingPot icon → `aria-label="Cooking"`
- Settings / Settings icon → `aria-label="Settings"`

These labels are hardcoded English for now — i18n can be added in a follow-up i18n PR (same pattern as other non-translated pages).

**Step 3: Verify**

Run lint and build:
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

---

## Task 2: Skip-to-Main-Content Link

**Issue:** No skip link exists. Keyboard users must Tab through the entire navigation bar before reaching page content. Navigation is positioned at the bottom of the viewport, but is still first in DOM order — users still need to navigate past it.

**Files:**
- `apps/web/src/components/Layout/index.tsx`
- `apps/web/src/routes/__root.tsx` (check which wraps the page — use whichever wraps `<main>`)

**Step 1: Read Layout and __root.tsx**

Identify where `<main>` is rendered and which component is the top-level wrapper.

**Step 2: Add skip link before `<main>`**

Insert a visually-hidden skip link that becomes visible on focus:

```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-background-elevated focus:text-foreground focus:rounded-md focus:border-2 focus:border-primary"
>
  Skip to main content
</a>
<main id="main-content" ...>
  {/* existing content */}
</main>
```

The `id="main-content"` must be added to the `<main>` element that wraps page content.

**Step 3: Verify**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

---

## Task 3: Semantic `<header>` for Fixed Top Bars

**Issue:** Detail pages use a fixed `<div>` as a top navigation bar. These are visually and functionally headers, but assistive technologies cannot identify them as such.

**Files to update:**
- `apps/web/src/routes/items/new.tsx` — "New Item" top bar
- `apps/web/src/routes/items/$id.tsx` — Item detail top bar
- `apps/web/src/routes/settings/tags/$id.tsx` — Tag detail top bar
- `apps/web/src/routes/settings/vendors/$id.tsx` — Vendor detail top bar
- `apps/web/src/routes/settings/recipes/$id.tsx` — Recipe detail top bar

**Step 1: Read each file**

For each file, find the fixed top bar div (typically `className="fixed top-0 ..."`).

**Step 2: Replace `<div>` with `<header>`**

Change the outer `<div className="fixed top-0 ...">` to `<header className="fixed top-0 ...">`. All children and classNames stay identical — only the element tag changes.

Do NOT change inner elements (back button div, h1, action buttons). Only the outermost fixed-top-bar div becomes `<header>`.

**Step 3: Verify all 5 files**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

---

## Task 4: Clickable Badges — `role` and `aria-pressed`

**Issue:** In `ItemCard`, tag, vendor, and recipe badges have `onClick` handlers but are rendered as `<span>`/`<div>` elements (via the `<Badge>` component). They are not keyboard-accessible and have no semantic role. The detail pages (`items/$id/vendors.tsx`, `items/$id/recipes.tsx`) already handle this correctly with `role="button"` + `aria-pressed` — ItemCard must match.

**Files:**
- `apps/web/src/components/item/ItemCard/index.tsx`

**Step 1: Read ItemCard**

Read `src/components/item/ItemCard/index.tsx`. Locate the sections rendering tag badges (around line 315), vendor badges (around line 335), and recipe badges (around line 361) with `onClick` handlers.

**Step 2: Add `role` and `aria-pressed` to clickable badges**

For each clickable `<Badge>` with an `onClick` handler, add:

```tsx
<Badge
  role="button"
  tabIndex={0}
  aria-pressed={isSelected}         // true if currently selected/filtered
  onClick={...}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      // same handler as onClick
    }
  }}
  ...
>
```

If badges do not currently track a "selected" state (they may just trigger a filter action), use `aria-pressed={undefined}` and omit it — the critical fix is `role="button"` and `tabIndex={0}` + keyboard handler.

**Step 3: Verify**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

---

## Task 5: `aria-live` Regions for Dynamic Content

**Issue:** Several UI actions produce visible changes that are not announced to screen readers:
- Quantity ± buttons in `ItemCard` (pantry and shopping pages)
- Cart item count in shopping toolbar
- Filter status changes
- Form submission status (saving / error)

**Files:**
- `apps/web/src/components/item/ItemCard/index.tsx` — quantity change announcements
- `apps/web/src/routes/shopping.tsx` — cart count / checkout status
- `apps/web/src/routes/index.tsx` — item count after filter (pantry)
- `apps/web/src/components/item/FilterStatus/index.tsx` — filter status text (already rendered, just needs live region)

**Step 1: ItemCard — quantity change announcement**

After the quantity display element in `ItemCard`, add a visually-hidden live region that announces the new quantity when it changes:

```tsx
{/* Screen reader announcement for quantity change */}
<span className="sr-only" aria-live="polite" aria-atomic="true">
  {item.name}: {currentQuantity}
</span>
```

Place this adjacent to the quantity stepper. The `aria-live="polite"` ensures it announces after the user finishes interacting (not interrupting).

**Step 2: FilterStatus — mark as live region**

Read `src/components/item/FilterStatus/index.tsx`. The filter status text is already rendered — wrap or annotate its container with `aria-live="polite"` so screen readers announce filter changes:

```tsx
<div aria-live="polite" aria-atomic="true">
  {/* existing filter status content */}
</div>
```

**Step 3: Shopping — cart item count**

Read `src/routes/shopping.tsx`. Find the cart item count display (in the toolbar or checkout area). Add `aria-live="polite"` to announce count changes when items are added/removed.

**Step 4: Verify**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

---

## Task 6: Final Verification

**Step 1: Full quality gate**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

**Step 2: E2E smoke test**

```bash
pnpm test:e2e --grep "pantry|shopping|cooking|items|tags|vendors|settings"
```

**Step 3: Commit**

One commit per task (Tasks 1–5 = 5 separate commits), following the commit splitting rule:

```
fix(a11y): add aria-labels to navigation links
fix(a11y): add skip-to-main-content link
fix(a11y): replace fixed top bar divs with header elements
fix(a11y): add role and keyboard support to clickable badges in ItemCard
fix(a11y): add aria-live regions for dynamic content updates
```
