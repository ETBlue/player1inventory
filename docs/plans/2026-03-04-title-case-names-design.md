# Title Case Name Rendering

**Date:** 2026-03-04
**Status:** Implemented

## Summary

Render item, tag, and recipe names in title case throughout the UI. Vendors are excluded — vendor names may use intentional casing (e.g. "iHerb", "7-Eleven"). Purely visual — no data changes, no new utilities.

## Approach

Add Tailwind's `capitalize` class to name display elements and name input fields. CSS `text-transform: capitalize` capitalizes the first letter of each word visually without changing stored values. Search inputs are excluded (users type queries, not names).

Vendor badges override the Badge component's built-in `capitalize` with `normal-case` to preserve vendor casing.

## Changes

### Shared components

| File | Change |
|---|---|
| `src/components/ItemCard.tsx:162` | Add `capitalize` to item name `<h3>` |
| `src/components/ItemCard.tsx` | Add `normal-case` to vendor badge `className` (overrides Badge base class) |
| `src/components/RecipeCard.tsx:21` | Add `capitalize` to recipe name link |
| `src/components/ItemForm.tsx:359` | Add `className="capitalize"` to name `<Input>` |
| `src/components/TagNameForm.tsx:30` | Add `className="capitalize"` to `<Input>` |
| `src/components/AddTagDialog.tsx:36` | Add `className="capitalize"` to tag name `<Input>` |
| `src/components/EditTagTypeDialog.tsx:42` | Add `className="capitalize"` to tag type name `<Input>` |
| `src/components/RecipeNameForm.tsx:30` | Add `className="capitalize"` to `<Input>` |

### Routes

| File | Change |
|---|---|
| `src/routes/items/$id.tsx:108` | Add `capitalize` to item name `<h1>` |
| `src/routes/items/$id/vendors.tsx` | Add `normal-case` to vendor badge `className` |
| `src/routes/settings/tags/$id.tsx:102` | Add `capitalize` to tag name `<h1>` |
| `src/routes/settings/tags/$id/index.tsx` | Add `capitalize` to tag name `<Input>` and tag type `<SelectTrigger>`/`<SelectItem>` |
| `src/routes/settings/tags/index.tsx` | Add `capitalize` to new tag type name `<Input>` |
| `src/routes/settings/recipes/$id.tsx:102` | Add `capitalize` to recipe name `<h1>` |
| `src/components/ItemFilters.tsx:189` | Add `capitalize` to recipe name `<span>` |
| `src/routes/cooking.tsx:267` | Add `capitalize` to recipe name `<button>` |

## Out of scope

- **Vendor names** — vendors may use intentional casing (e.g. "iHerb", "7-Eleven"); `VendorCard`, `VendorNameForm`, vendor detail header, and vendor filter spans are NOT capitalized; vendor badges use `normal-case` to override the Badge base class
- Search inputs
- In-sentence name references in dialogs/error messages
- Tag type section headers (already `capitalize`/`uppercase`)
