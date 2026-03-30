# Design: TemplateVendorRow — align vendor selection view with item selection view

**Date:** 2026-03-30
**Branch:** feature-onboarding-b

## Context

`TemplateVendorsBrowser` currently renders each vendor using `VendorCard variant="template"`. It also uses a custom sticky-header layout instead of the shared `<Toolbar>` component. The result is a vendor selection screen that looks and behaves differently from the item selection screen.

The goal is to make both views visually and structurally consistent:

1. Replace `VendorCard` with a purpose-built `TemplateVendorRow` (matching the `TemplateItemRow` pattern).
2. Align the `TemplateVendorsBrowser` toolbar to use the shared `<Toolbar>` component with a togglable search (matching `TemplateItemsBrowser`).
3. Remove the now-unused `template` variant from `VendorCard`.

## Row Layout

```
[✓]  ┌────────────────────────────────────────────┐
     │  [vendor name]                             │
     └────────────────────────────────────────────┘
```

- Checkbox sits **outside** the Card (same as `TemplateItemRow`).
- Vendor name only — no tags, no item count, no CardContent.
- Clicking the row does **not** toggle the checkbox — only the checkbox itself toggles selection.

## New file: `TemplateVendorRow.tsx`

Co-located inside `apps/web/src/components/onboarding/TemplateVendorsBrowser/`:

```
TemplateVendorsBrowser/
  index.tsx
  TemplateVendorRow.tsx               ← new
  TemplateVendorRow.stories.tsx       ← new
  TemplateVendorRow.stories.test.tsx  ← new
  TemplateVendorsBrowser.stories.tsx
  TemplateVendorsBrowser.stories.test.tsx
```

### Props

```ts
interface TemplateVendorRowProps {
  name: string       // resolved, translated vendor name
  isChecked: boolean
  onToggle: () => void
}
```

### Render structure

```tsx
<Card className="ml-10 px-3 py-2">
  <Checkbox
    checked={isChecked}
    onCheckedChange={onToggle}
    aria-label={isChecked ? `Remove ${name}` : `Add ${name}`}
    className="absolute -ml-10 mt-[2px]"
  />
  <CardHeader className="truncate">{name}</CardHeader>
</Card>
```

No `CardContent`. `Card` uses default variant.

## Changes to `TemplateVendorsBrowser/index.tsx`

1. **Remove** `buildMockVendor` helper — no longer needed.
2. **Replace** the custom sticky header with two `<Toolbar>` rows matching `TemplateItemsBrowser`:
   - Row 1 (sticky): Back button · selected count · spacer · Clear Selection button
   - Row 2: Search toggle button · spacer · Select All button
3. **Make search togglable** — same pattern as item browser (toggle button shows/hides the search input row).
4. **Replace** `VendorCard` in the render loop with `TemplateVendorRow`.
5. **Keep** filter-status row (showing X of Y + clear filter) — only shown when `isFiltered`.
6. **Change** item list spacing from `px-4 py-3 space-y-2` → `mb-2 space-y-px` (matching item browser).

## Changes to `VendorCard`

1. **Remove** `template` variant from props union.
2. **Remove** `isTemplate` flag and all template-guarded logic (item count hide, delete button hide, checkbox).
3. **Remove** `selected`, `onToggle` props (only used by the template variant).
4. Update stories and smoke tests accordingly.

## Stories

`TemplateVendorRow.stories.tsx` — two stories:
- `Unchecked` — single row, `isChecked: false`
- `Checked` — single row, `isChecked: true`

`TemplateVendorRow.stories.test.tsx` — smoke tests:
- `Unchecked`: renders vendor name
- `Checked`: renders checkbox in checked state

## What is NOT changed

- `TemplateItemsBrowser` and `TemplateItemRow` are unaffected.
- `VendorCard` non-template behavior (item count, delete button) is unchanged.
