# Design: TemplateVendorsBrowser — always-visible search input

**Date:** 2026-03-30
**Branch:** feature-onboarding-b

## Context

`TemplateVendorsBrowser` was just refactored to use `<Toolbar>` rows with a togglable search (matching `TemplateItemsBrowser`). The new requirement simplifies this further: the search input should always be visible in row 2, removing the toggle button entirely.

## New toolbar layout

```
Row 1 (Toolbar, sticky):  [Back]  [N vendors selected]  ···  [Clear Selection]
Row 2 (Toolbar, transparent):  [Search input (flex-1)]  [Select All]
(conditional) Filter status:  [Showing X of Y]  ···  [Clear filter ×]
```

## Changes to `TemplateVendorsBrowser/index.tsx`

1. **Remove** `searchVisible` state and `setSearchVisible`.
2. **Remove** the Search toggle `<Button>` from row 2.
3. **Move** the search `<Input>` directly into row 2 inside `<Toolbar>`, with `className="flex-1 border-none shadow-none bg-transparent h-auto py-2 text-sm"`.
4. **Keep** the inline clear button (`<X>`) to the right of the input when `search` is non-empty.
5. **Remove** the conditional `searchVisible` guard around the search input section (and its `<div className="h-px ...">` separator).
6. **Keep** the filter status row unchanged (still conditional on `isFiltered`).

Row 2 render structure:

```tsx
<Toolbar className="bg-transparent border-none">
  <Input
    placeholder={t('onboarding.vendorsBrowser.title')}
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    onKeyDown={(e) => { if (e.key === 'Escape') setSearch('') }}
    className="flex-1 border-none shadow-none bg-transparent h-auto py-2 text-sm"
  />
  {search && (
    <Button size="icon" variant="neutral-ghost" className="h-6 w-6 shrink-0"
      onClick={() => setSearch('')}
      aria-label={t('itemListToolbar.clearSearch')}
    >
      <X />
    </Button>
  )}
  <Button type="button" variant="neutral-outline" onClick={handleSelectAllVisible}>
    <Check />
    {t('onboarding.vendorsBrowser.selectAll')}
  </Button>
</Toolbar>
```

## Changes to stories and tests

- `TemplateVendorsBrowser.stories.tsx` — no change needed (stories don't interact with search state).
- `TemplateVendorsBrowser.stories.test.tsx` — remove the `'renders the Search toggle button'` test; add a `'renders the search input'` test asserting the input placeholder is present.

## What is NOT changed

- `TemplateItemsBrowser` keeps its togglable search (vendors are fewer items; always-visible search fits better there).
- Row 1 toolbar is unchanged.
- Filter status row is unchanged.
