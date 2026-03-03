# Delete Button Consolidation — Design

**Date:** 2026-03-03

## Overview

Consolidate all delete flows across the app to use the shared `DeleteButton` component, update the `AlertDialog` layout, align form widths, and add explicit cascade impact statements to every delete confirmation dialog.

## Background

The user manually modified several files (working tree changes, not yet committed):

- `alert-dialog.tsx` — layout polish (border-bottom header, horizontal footer, `neutral-outline` cancel)
- `DeleteButton.tsx` — `destructive-ghost` default variant, description moved outside header, `flex-1` footer spacer
- `VendorNameForm`, `RecipeNameForm`, `TagNameForm` — `max-w-2xl`, full-width save button
- `tags/index.tsx` — tag badge dialog description improved; tag type button variant changed to `destructive-ghost`
- `vendors/$id/index.tsx` — DeleteButton with impact count
- `recipes/$id/index.tsx` — DeleteButton (missing recipe item count, to be fixed)
- `items/$id/index.tsx` — DeleteButton styling fixed

Three locations still use the old pattern (plain `Button` + external `ConfirmDialog`):
1. **Tag type** delete button in the tags list page
2. **VendorCard** delete button + `ConfirmDialog` in the vendors list page
3. **RecipeCard** delete button + `ConfirmDialog` in the recipes list page

Additionally, several delete dialogs are missing explicit cascade impact statements.

## Design Decisions

### `DeleteButton` API extension

Add `buttonAriaLabel?: string` prop, passed to the inner `Button` element. Needed for icon-only triggers (`<Trash2>`, `<X>`) to support accessibility and tests.

### Delete mutation location (vendor/recipe list pages)

Mutation stays in the list page. The `onDelete` prop on `VendorCard`/`RecipeCard` changes semantics: it becomes the actual delete function (not "open dialog"). The list page passes `() => deleteVendor.mutate(vendor.id)`. No hooks move into the card components.

### Item count source for tag badge X button

Add `useItemCountByTag(tag.id)` inside `DraggableTagBadge` to show the exact count in the confirmation dialog.

### Item count source for tag type delete

Use `sortedTypeTags.length` (already computed in the render loop) — no new hook needed.

### Impact statement format

All delete dialogs must describe cascade effects:

| Location | >0 impact | 0 impact |
|---|---|---|
| Tag badge X (list) | "{name} will be removed from {N} item(s)." | "No items are using {name}." |
| Tag type (list) | "This will delete {N} tags, removing them from all assigned items." | "No tags in this type." |
| Tag detail | "{name} will be removed from {N} item(s)." | "No items are using this tag." |
| Vendor list card | "{N} item(s) will be unassigned from {name}." | "No items are assigned to {name}." |
| Vendor detail | "{name} will be removed from {N} item(s). This action cannot be undone." | "No items are assigned to {name}. This action cannot be undone." |
| Recipe list card | "This recipe contains {N} items. Your inventory will not be affected." | "This recipe has no items." |
| Recipe detail | "{name} will be deleted. It contains {N} items. Your inventory will not be affected." | "{name} will be deleted. It has no items." |
| Item detail | "This will permanently remove {name} and its inventory history." | (no cascade — item is the leaf node) |

## Commit Plan

| # | Scope | Files |
|---|---|---|
| 1 | `style(delete)` | `alert-dialog.tsx`, `DeleteButton.tsx`, `VendorNameForm`, `RecipeNameForm`, `TagNameForm`, `tags/index.tsx` (variant-only change), `DeleteButton.stories.tsx` |
| 2 | `feat(tags)` | `tags/index.tsx` (tag type → DeleteButton), `DeleteButton.tsx` (add buttonAriaLabel), `tags/$id/index.tsx` (description update), `DraggableTagBadge` (item count), tests, stories |
| 3 | `feat(vendors)` | `VendorCard.tsx`, `vendors/index.tsx`, `VendorCard.test.tsx`, `VendorCard.stories.tsx`, `vendors.test.tsx` |
| 4 | `feat(recipes)` | `RecipeCard.tsx`, `recipes/index.tsx`, `RecipeCard.test.tsx` (new), `RecipeCard.stories.tsx` |
| 5 | `fix(delete)` | Remaining dialog description gaps: vendor detail (0 items), recipe detail (item count), tag detail (0 items), item detail |

## Files Affected

**Components:**
- `src/components/DeleteButton.tsx`
- `src/components/VendorCard.tsx`
- `src/components/RecipeCard.tsx`
- `src/components/ui/alert-dialog.tsx`
- `src/components/VendorNameForm.tsx`
- `src/components/RecipeNameForm.tsx`
- `src/components/TagNameForm.tsx`

**Routes:**
- `src/routes/settings/tags/index.tsx`
- `src/routes/settings/tags/$id/index.tsx`
- `src/routes/settings/vendors/index.tsx`
- `src/routes/settings/vendors/$id/index.tsx`
- `src/routes/settings/recipes/index.tsx`
- `src/routes/settings/recipes/$id/index.tsx`
- `src/routes/items/$id/index.tsx`

**Tests:**
- `src/components/DeleteButton.test.tsx`
- `src/components/VendorCard.test.tsx`
- `src/routes/settings/tags/$id.test.tsx`
- `src/routes/settings/vendors.test.tsx`
- `src/routes/settings/recipes/$id.test.tsx` (add delete tests)

**Stories:**
- `src/components/DeleteButton.stories.tsx`
- `src/components/VendorCard.stories.tsx`
- `src/components/RecipeCard.stories.tsx`
