# Title Case Name Rendering

**Date:** 2026-03-04
**Status:** Implemented

## Summary

Render item, tag, and recipe names in title case throughout the UI. Vendors are excluded — vendor names may use intentional casing (e.g. "iHerb", "7-Eleven"). Purely visual — no data changes, no new utilities.

## Approach

Add Tailwind's `capitalize` class to name display elements and name input fields. CSS `text-transform: capitalize` capitalizes the first letter of each word visually without changing stored values. Search inputs are excluded (users type queries, not names).

The `Badge` component already has `capitalize`, so tag/vendor/recipe badges are already covered.

## Changes

### Shared components

| File | Change |
|---|---|
| `src/components/ItemCard.tsx:162` | Add `capitalize` to `<h3>` |
| `src/components/RecipeCard.tsx:21` | Add `capitalize` to the recipe name link |
| `src/components/ItemForm.tsx:359` | Add `className="capitalize"` to name `<Input>` |
| `src/components/TagNameForm.tsx:30` | Add `className="capitalize"` to `<Input>` |
| `src/components/RecipeNameForm.tsx:30` | Add `className="capitalize"` to `<Input>` |

### Individual detail headers

| File | Change |
|---|---|
| `src/routes/items/$id.tsx:108` | Add `capitalize` to `<h1>` |
| `src/routes/settings/tags/$id.tsx:102` | Add `capitalize` to `<h1>` |
| `src/routes/settings/recipes/$id.tsx:102` | Add `capitalize` to `<h1>` |

### Additional name displays

| File | Change |
|---|---|
| `src/components/ItemFilters.tsx:189` | Add `capitalize` to recipe name `<span>` |
| `src/routes/cooking.tsx:267` | Add `capitalize` to recipe name `<button>` |

## Out of scope

- **Vendor names** — vendors may use intentional casing (e.g. "iHerb", "7-Eleven"); `VendorCard`, `VendorNameForm`, vendor detail header, and vendor filter spans are NOT capitalized
- Search inputs
- In-sentence name references in dialogs/error messages
- Tag type section headers (already `capitalize`/`uppercase`)
- Badge component (already has `capitalize`)
