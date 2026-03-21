# A11y Plan 3 — Visual Verification

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Audit and fix color contrast and focus indicator issues across both light and dark themes. This plan requires running the app in a browser and using automated + manual tools to measure actual rendered contrast ratios.

**Scope:** Color contrast (both themes), focus indicators, inactive-item opacity.

**WCAG References:**
- 1.4.3 Contrast (Minimum) (AA) — normal text ≥ 4.5:1, large text ≥ 3:1
- 1.4.11 Non-text Contrast (AA) — UI components (borders, icons) ≥ 3:1 against adjacent colors
- 2.4.7 Focus Visible (AA) — keyboard focus indicator must be visible
- 1.4.1 Use of Color (A) — color must not be the only means of conveying information

**Tools required:**
- Browser DevTools with axe DevTools extension (or WAVE)
- `pnpm dev` running locally
- Manual keyboard testing (Tab key navigation)

---

## Task 1: Color Contrast Audit — Light Theme

**Issue:** Color contrast ratios for muted text, status badges, tag badges, and other themed colors have not been measured. Some combinations may fail WCAG AA.

**Step 1: Start dev server**

```bash
(cd apps/web && pnpm dev)
```

Open `http://localhost:5173` in Chrome/Firefox with axe DevTools or WAVE extension.

**Step 2: Set theme to Light**

Go to Settings → Theme → Light. Confirm `<html>` does NOT have the `dark` class.

**Step 3: Run axe on each major page**

Run axe DevTools on each of these pages and capture all contrast failures:
1. `/` (Pantry — with some items visible)
2. `/shopping` (Shopping cart)
3. `/cooking` (Cooking page)
4. `/settings` (Settings main)
5. `/settings/tags` (Tag list)
6. `/settings/vendors` (Vendor list)
7. `/settings/recipes` (Recipe list)
8. Item detail page (`/items/<id>`)

**Priority areas to check manually:**
- `text-foreground-muted` — secondary/helper text throughout (e.g. expiry dates, counts)
- `bg-status-error text-tint` — expiration warning badge in `ItemCard`
- `bg-status-warning text-tint` — low-stock warning badge in `ItemCard`
- `bg-status-ok text-tint` — in-stock badge
- `bg-status-inactive text-tint` — inactive item badge
- Tag color badges (all 14 colors × 2 variants = 28 combinations) in `TagBadge`
- `opacity-50` inactive items — text rendered at 50% opacity

**Step 4: Record all failures**

For each failing combination, note:
- Page/component where it occurs
- Foreground color token (or hex value from DevTools)
- Background color token (or hex value)
- Measured ratio
- Required ratio (4.5:1 for normal text, 3:1 for large text / UI)

**Step 5: Fix contrast failures in `src/design-tokens/theme.css`**

Adjust the HSL values for failing tokens in the `:root` block. Only change lightness — avoid hue shifts that would break visual design intent.

Common fixes:
- `--foreground-muted`: increase lightness contrast (darker in light mode)
- Status color tint text: verify `colorUtils.dark` provides enough contrast on tint backgrounds
- Tag color text on tint backgrounds: verify `colorUtils.dark` ratio against each tint

**Step 6: Fix `opacity-50` inactive items**

Read `apps/web/src/components/item/ItemCard/index.tsx`. Find where `opacity-50` is applied to inactive items.

Replace opacity-only dimming with a dual indicator:
- Keep reduced opacity (lower value like `opacity-60` may still pass with high base contrast)
- Add a non-color indicator: an icon (e.g. `EyeOff` from lucide-react) or strikethrough text

Pattern:
```tsx
<div className={cn('...', item.isActive === false && 'opacity-60')}>
  {item.isActive === false && (
    <span className="sr-only">Inactive</span>
  )}
  {/* existing card content */}
</div>
```

The `sr-only` span ensures screen readers also announce the inactive state.

**Step 7: Verify**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

Re-run axe on light theme — confirm zero contrast failures.

---

## Task 2: Color Contrast Audit — Dark Theme

**Issue:** Dark theme uses different HSL values (defined in `.dark` block in `theme.css`). Colors that pass in light mode may fail in dark mode, and vice versa.

**Step 1: Set theme to Dark**

Go to Settings → Theme → Dark. Confirm `<html>` has the `dark` class.

**Step 2: Run axe on the same pages as Task 1**

Repeat the axe audit across all 8 pages listed in Task 1 Step 3.

**Priority areas unique to dark mode:**
- Background layers are dark (3.9% → 10% → 15% lightness) — text must be light enough
- Tag tint backgrounds in dark mode (tint colors may be too dark for dark text)
- Status badge backgrounds in dark mode
- `text-foreground-muted` in dark mode (may be too dim against dark backgrounds)

**Step 3: Record and fix dark-mode failures**

For each failure, adjust the corresponding HSL values in the `.dark` block in `src/design-tokens/theme.css`.

**Step 4: Verify**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

Re-run axe on dark theme — confirm zero contrast failures.

---

## Task 3: Focus Indicator Audit & Fixes

**Issue:** shadcn/ui components use Radix UI primitives which typically include focus-visible ring styles. However, the actual rendered focus ring may be invisible against certain backgrounds or too thin to be clearly visible.

**WCAG 2.4.7 (AA):** Focus indicator must be visible. WCAG 2.4.11 (AA, 2.2) adds minimum size requirements (not tested here — 2.1 AA scope only).

**Step 1: Keyboard audit**

With the app running (both light and dark themes), use Tab to navigate through every interactive element on each major page. For each element, check:
- Is there a visible focus ring?
- Is the focus ring clearly visible against the element's background?
- Does it disappear against any background color in either theme?

Pages to test (Tab through entire page):
1. `/` (Pantry)
2. `/shopping`
3. `/cooking`
4. `/settings`
5. `/settings/tags` (including draggable tags)
6. Item detail page

**Step 2: Check global focus styles in CSS**

Read `apps/web/src/index.css` and `apps/web/src/design-tokens/theme.css`. Look for:
- `:focus-visible` rules
- `outline` overrides (especially `outline: none` or `outline: 0` without replacement)
- Tailwind `ring` utilities used in shadcn/ui components

**Step 3: Fix missing or invisible focus rings**

If any element has `outline: none` without a visible replacement:

Option A — Add global focus-visible fallback in `src/index.css`:
```css
/* Ensure visible focus rings everywhere */
:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}
```

Option B — Fix per-component using Tailwind's `focus-visible:ring-2 focus-visible:ring-primary` utilities.

Prefer Option A as a global safety net; use Option B only for components that need custom styling.

**Step 4: Verify in both themes**

Tab through all pages in both light and dark themes. Every interactive element must show a visible focus ring.

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

---

## Task 4: Final Verification & Commit

**Step 1: Full quality gate**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

**Step 2: E2E**

```bash
pnpm test:e2e --grep "pantry|shopping|cooking|items|tags|vendors|settings"
```

**Step 3: Commit (up to 3 commits)**

Split by concern:
```
fix(a11y): fix color contrast failures in light theme design tokens
fix(a11y): fix color contrast failures in dark theme design tokens
fix(a11y): improve focus indicators for keyboard navigation
```

If inactive-item opacity fix is not merged via Plan 1, include it here:
```
fix(a11y): replace opacity-only inactive indicator with dual visual + text indicator
```
