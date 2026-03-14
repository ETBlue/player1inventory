# Delete Dialog Text Consolidation — Design

**Date:** 2026-03-03

## Overview

Consolidate delete dialog title and description text so that deleting the same type of object always shows the same dialog regardless of where it's triggered (list page vs detail page).

## Design Decisions

### Title pattern: type name (not entity name)

Use `Delete Vendor?` / `Delete Recipe?` everywhere — not `Delete "Costco"?`.

The entity name belongs in the description, not the title. This keeps the title short and predictable.

### Description: entity-named, no "cannot be undone"

Descriptions always name the entity being deleted. The phrase "This action cannot be undone." is dropped everywhere for simplicity and consistency.

## Final Wording

| Entity | Trigger | Title | Non-zero description | Zero description |
|---|---|---|---|---|
| Tag | List badge X | `Delete Tag?` | `{name} will be removed from N items.` | `No items are using {name}.` |
| Tag | Detail page | `Delete Tag?` | *(same)* | *(same)* |
| Tag type | List only | `Delete "{name}"?` | `This will delete N tags, removing them from all assigned items.` | `This type has no tags.` |
| Vendor | List card | `Delete Vendor?` | `{name} will be removed from N items.` | `No items are assigned to {name}.` |
| Vendor | Detail page | `Delete Vendor?` | *(same)* | *(same)* |
| Recipe | List card | `Delete Recipe?` | `{name} will be deleted. It contains N items. Your inventory will not be affected.` | `{name} will be deleted. It has no items.` |
| Recipe | Detail page | `Delete Recipe?` | *(same)* | *(same)* |
| Item | Detail only | `Delete Item?` | `This will permanently remove {name} and its inventory history.` | *(leaf node — no cascade)* |

## Files Changed

- `src/components/VendorCard.tsx` — title: `Delete "Costco"?` → `Delete Vendor?`; non-zero description: `N items will be unassigned from Costco.` → `Costco will be removed from N items.`
- `src/routes/settings/vendors/$id/index.tsx` — remove "This action cannot be undone." from both description branches
- `src/components/RecipeCard.tsx` — title: `Delete "Pasta Dinner"?` → `Delete Recipe?`; descriptions updated to match detail pattern (add recipe name, use "will be deleted")

No changes needed to: `tags/index.tsx`, `tags/$id/index.tsx`, `recipes/$id/index.tsx`, `items/$id/index.tsx`.
