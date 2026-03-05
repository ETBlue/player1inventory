# Tag Dropdown Badge Selection Visual Design

**Date:** 2026-03-05
**Status:** Approved

## Problem

In the `TagTypeDropdown` component (used by `ItemFilters`), all tag badges in the dropdown menu render with the solid color variant — regardless of whether the tag is selected as a filter or not. This makes it hard to visually distinguish selected from unselected tags at a glance.

## Goal

Make badge appearance reflect selection state:
- **Selected tags** → solid color background (high contrast, prominent)
- **Unselected tags** → tint background (light, receded, scannable)

## Design

**File:** `src/components/TagTypeDropdown.tsx`, line 56

**Change:** Make the Badge `variant` prop conditional on `isChecked`:

```tsx
// Before
<Badge variant={tagType.color}>{tag.name}</Badge>

// After
<Badge variant={isChecked ? tagType.color : `${tagType.color}-tint`}>
  {tag.name}
</Badge>
```

`isChecked` is already computed on line 47 (`const isChecked = selectedTagIds.includes(tag.id)`), so no additional logic is needed.

## Visual Result

| State     | Variant              | Appearance                          |
|-----------|----------------------|-------------------------------------|
| Unselected | `${color}-tint`     | Light tint background, colored border — receded |
| Selected  | `${color}`           | Solid color background, high contrast — prominent |

The solid selected state mirrors the active filter trigger button style (which also switches to the solid variant when tags are selected).

## Scope

- One line changed in `src/components/TagTypeDropdown.tsx`
- No other files affected
- All 14 `${color}-tint` variants already exist in the Badge component

## Decisions

- Both checkbox and solid badge signal selection simultaneously — checkbox for interaction affordance, solid badge for color-coded visual confirmation. This dual signaling is intentional.
