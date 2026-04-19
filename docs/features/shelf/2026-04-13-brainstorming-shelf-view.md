# Brainstorming Log — Shelf View

**Date:** 2026-04-13
**Participants:** ETBlue, Claude Code
**Topic:** Adding a "shelf" view to the pantry page

---

## Problem

Users want to view pantry items in custom order and custom groups. The current list view supports dynamic filtering and sorting, but offers no persistent manual organization.

---

## Questions & Answers

**Q1. What does a shelf look like visually?**
A: A block/card showing metadata (shelf name, item count, shelf type, filter summary). Tapping into the shelf navigates to a detail page showing the item list.

**Q2. Same ItemCard component in shelf view?**
A: Yes, same ItemCard for items within a shelf detail page.

**Q3. Can an item appear in multiple shelves?**
A: Yes, multiple shelves is fine.

**Q4. What happens to items not in any shelf?**
A: Shown in a system-managed virtual "Unsorted" shelf, always last, cannot be renamed or deleted.

**Q5. For filter-based shelves, which filters?**
A: Tags + vendors + recipes, combinable. Also a default sort criteria (sortBy + sortDir).

**Q6. Can a shelf switch between filter and selection mode?**
A: No — mode is permanent, chosen at creation. User creates a new shelf instead of switching.

**Q7. Can a shelf mix both modes?**
A: No. Keeping it simple — each shelf is either filter-based or selection-based.

**Q8. How does the user reorder shelves and items?**
A: Drag-and-drop. Mobile drag-drop flagged as a risk — try @dnd-kit first; if mobile UX is poor, handle together with tag settings drag-drop.

**Q9. Search in shelf view?**
A: Search bar present on all shelf detail pages (filter, selection, unsorted).
- Items already in shelf → normal ItemCard
- Items in system but not in shelf → compact block with Add button
- Items not in system → Create & Add (same as current); newly created item auto-added to shelf (selection) or auto-matched if it satisfies filter

**Q10. Default view and persistence?**
A: Shelf view is default for fresh users. Last-used view (list vs shelf) is remembered persistently (localStorage).

**Q11. Where does shelf management live?**
A: Settings page (`/settings/shelves`), also accessible via link in shelf detail header.

**Q12. Routes — can shelf view have its own URL?**
A: Yes — `/` = list view, `/shelves` = shelf view. URL search params of list view don't apply to shelf view.

**Q13. Top bar changes?**
A: List view: `+` = Add Item only. Shelf view: `+` = Add Shelf only. View toggle on the left.

**Q14. Filter shelf detail: sortBy editable inline?**
A: Yes — sort dropdown in shelf detail updates `filterConfig.sortBy/Dir` and persists.

**Q15. Selection shelf detail: show shelf type?**
A: Yes — type badge ("Selection") shown near the top of the shelf detail.

**Q16. Unsorted shelf: allow sorting?**
A: Yes — sort dropdown in unsorted shelf detail, persisted separately.

**Q17. Back button in shelf settings?**
A: Context-aware — returns to where the user came from (shelf detail or `/settings` index).

**Q18. Persistence for Shelf entity?**
A: Both IndexedDB (Dexie, offline mode) and PostgreSQL (cloud mode) — same dual-persistence pattern as Items/Tags/Vendors/Recipes.

**Q19. Mobile drag-drop?**
A: Flag as risk. Use @dnd-kit with touch sensor first; if UX is poor, fix together with tag settings drag-drop.

**Q20. Unsorted shelf — rename/delete?**
A: System-managed virtual shelf. Always present, always last, cannot rename or delete.

**Q21. Shelf detail navigation model?**
A: New route/page (`/shelves/:shelfId`), not a modal.

---

## Final Decisions

1. Routes: `/` (list), `/shelves` (shelf view), `/shelves/$shelfId` (shelf detail), `/settings/shelves` (management)
2. Shelf types: `filter` | `selection` — permanent at creation
3. Unsorted: virtual, system-managed, always last
4. Search in shelf detail: in-shelf = ItemCard, outside = add block, new = create & add
5. View toggle on left of top bar; `+` button changes meaning per view
6. Sorting/filtering row (second row) only visible in list view
7. Shelf entity: dual-persistence (IndexedDB + PostgreSQL)
8. Mobile drag-drop: risk flagged, try @dnd-kit first
