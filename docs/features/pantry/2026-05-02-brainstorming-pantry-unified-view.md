# Brainstorming: Pantry Unified View

**Date:** 2026-05-02
**Topic:** Merge item list view and shelf view into a single pantry page

## Context

User tried the app in real usage and noticed the plain item list pantry view was never used once the shelf view was available. The item list is too long to navigate efficiently; the shelf view gives a better overview. The two views create confusion and the shelf view is clearly superior.

## Questions and Answers

**Q1: Should the Unsorted shelf appear in the merged view?**
A: Yes, and always last (below all user-defined shelves).

**Q2: Where does clicking "shelf settings" navigate?**
A: To `/settings/shelves/:id` — the existing shelf settings route.

**Q3: When searching/filtering, should items stay grouped inside shelf cards or flatten into a list?**
A: Stay grouped. Shelves with matching items auto-expand; shelves with no matches auto-collapse. Matched keywords are highlighted.

**Q4: Single global sort or per-shelf sort?**
A: Single global sort control. Remove `sortBy` and `sortDir` from the Shelf entity (requires DB migration).

**Q5: Where does "Add Item" live?**
A: Global button in the pantry toolbar — navigates to the new item page (same as current pantry behavior). Shelf selector lives on the new item page, not in a dialog.

## Decisions

| Area | Decision |
|---|---|
| Routes removed | `/shelves`, `/shelves/`, `/shelves/$shelfId` |
| Shelf grouping | Always on — no list/shelf view toggle |
| Unsorted shelf | Always visible, always last |
| Shelf card meta | N items + optional X low stock + optional Y out of stock |
| Expand/collapse | URL search param `expanded=id1,id2,...` (same pattern as cooking page) |
| Shelf settings nav | Click settings icon → `/settings/shelves/:id` |
| Search/filter | Grouped — auto-expand matching shelves, highlight keywords |
| Sort | Single global control; `sortBy`/`sortDir` removed from Shelf model |
| Add Item | Global button → navigates to new item page (current behavior); shelf selector on that page |
| Add Shelf | Button in pantry toolbar |
