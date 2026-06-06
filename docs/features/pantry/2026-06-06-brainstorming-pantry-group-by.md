# Brainstorming: Pantry Group-By Vendor/Recipe

**Date:** 2026-06-06
**Topic:** Extending the pantry group view to support grouping by vendor and recipe in addition to shelf
**Design doc:** [2026-06-06-pantry-group-by-design.md](./2026-06-06-pantry-group-by-design.md)

---

## Questions & Answers

**Q: Where should the group-by preference (shelf/vendor/recipe) be persisted?**
A: Use URL search params — replace `/shelves` with `/?groupBy=shelf`. The group view lives entirely in the root route with URL params controlling state.

**Q: Should vendor/recipe group cards have an 'Unsorted' card for items with no vendor or no recipe?**
A: Yes — show Unsorted, mirroring how the shelf view handles unclaimed items.

**Q: Where should the vendor/recipe item list page live in the URL structure?**
A: URL params — `/?groupBy=vendor&id=$vendorId`. Same root route, all views controlled by search params.

**Q: For the vendor/recipe item list page, should it have the same sort/search/filter toolbar as the shelf detail page?**
A: Yes — full toolbar (sort, search, tag visibility, settings button).

**Q: What happens to the existing `/shelves` and `/shelves/$shelfId` routes?**
A: Remove them entirely. No redirects.

**Q: For vendor/recipe cards in the group view, what metrics should they display?**
A: Same as shelf cards — name, pack totals progress bar, active count, out-of-stock/low-stock badges.

---

## Final Decision

Consolidate all pantry views (list, group-by-shelf, group-by-vendor, group-by-recipe, and their detail pages) into a single root route (`/`) controlled by `?groupBy` and `?id` URL search params.

- `/?` (no params) → item list view
- `/?groupBy=shelf` → shelf group view (current `/shelves`)
- `/?groupBy=vendor` → vendor group view (new)
- `/?groupBy=recipe` → recipe group view (new)
- `/?groupBy=shelf&id=$shelfId` → shelf detail view (current `/shelves/$shelfId`)
- `/?groupBy=vendor&id=$vendorId` → vendor detail view (new)
- `/?groupBy=recipe&id=$recipeId` → recipe detail view (new)
- `/?groupBy=X&id=unsorted` → unsorted detail view for that group type (new for vendor/recipe; existing for shelf)

The `/shelves` and `/shelves/$shelfId` routes are deleted.
