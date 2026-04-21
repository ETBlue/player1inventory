---
date: 2026-04-21
topic: Should sortBy/sortDir live in FilterConfig or on the top-level Shelf?
---

## Questions asked

**Q1.** Should sort/order apply to all shelf types (selection + filter + system), or only to filter shelves?
**A:** Yes, sort applies to all shelf types.

**Q2.** Should selection shelves also have their own sortBy/sortDir?
**A:** Yes, selection shelves also have their own sort/order.

**Q3.** Should sort preference be preserved independently when filters are reset?
**A:** Yes — sort config should be preserved regardless of filter changes.

## Decision

Move `sortBy` and `sortDir` out of `FilterConfig` and onto the top-level `Shelf` object.

## Rationale

`filterConfig` describes *what items to include* (tag/vendor/recipe criteria). Sort is a *display preference* that is orthogonal to filtering, applies to all shelf types, and must survive filter resets. Keeping them inside `FilterConfig` was a conceptual error introduced during the initial cloud persistence implementation.
