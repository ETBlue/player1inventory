# Brainstorming: Pantry Toolbar Controls

**Date:** 2026-02-13

## Initial Request

Add buttons to the pantry page top bar:
1. Show/hide filters
2. Show/hide tags in item cards
3. Sorting options

## Questions and Answers

**Q1: For show/hide filters - when hidden, what should happen?**

Options:
1. Collapse to just the item count
2. Completely hide the filters section
3. Minimize to an icon button

**A:** Option 3 - Minimize to an icon button that expands when clicked

---

**Q2: For show/hide tags - when hidden, what should happen?**

Options:
1. Hide tag badges but keep the space
2. Collapse the entire tags section
3. Show tag count instead

**A:** Option 3 - Show compact tag count indicator (e.g., "3 tags")

---

**Q3: What sorting criteria to offer?**

Options:
1. Name (A-Z / Z-A)
2. Quantity (low to high / high to low)
3. Status (needs refill first / well-stocked first)
4. Last updated
5. Custom order

**A:** Options 1, 2, 3, 4 + expired date (5 total criteria)

---

**Q4: How to present sorting options?**

Options:
1. Dropdown menu
2. Segmented control
3. Sheet/modal

**A:** Option 1 - Dropdown menu with ascending/descending toggle

---

**Q5: Button placement in top bar?**

Options:
1. Between title and Add item
2. Left of Add item, grouped together
3. Replace the title area

**A:** Option 3 - Replace title with icon-only buttons

---

**Q6: Persistence for UI preferences?**

Options:
1. Persist across sessions (storage)
2. Reset each session
3. Mixed (persist sort, reset toggles)

**A:** Option 3 - Mixed with tags and filters hidden by default

---

**Q7: sessionStorage vs localStorage?**

**A:** Mixed approach:
- localStorage for sort order (true preference)
- sessionStorage for visibility toggles (per-session)
- Filters and tags hidden by default

---

**Q8: Default sort order?**

Options:
1. Name A-Z
2. Status (needs refill first)
3. Last updated (newest first)
4. Quantity (low to high)

**A:** Expiring soon first (prioritize items needing attention)

---

**Q9: Implementation approach?**

Options:
1. Toolbar Component Approach - Create PantryToolbar component
2. Inline State Management - Keep in index.tsx
3. Context-Based - PantryViewContext

**A:** Option 1 - Toolbar Component Approach (balance of organization and simplicity)

**Follow-up:** How to test when toolbar doesn't have access to items?
- Two-level testing: Unit tests for toolbar (mock callbacks), integration tests for PantryView (end-to-end)

---

**Q10: Storage implementation - library or vanilla?**

**A:** Vanilla TypeScript - follow existing sessionStorage.ts pattern, no library needed

---

**Q11: Sorting logic - how to get quantities/expiry dates?**

Options:
1. Fetch all data upfront in PantryView
2. Sort client-side with null handling

**A:** Option 1 - Fetch all data upfront for better UX

---

**Q12: Sort button - show current criteria?**

**A:** Yes - show icon + text label (e.g., "Expiring ↑") for clarity

## Final Design Decision

**Component Architecture:**
- Create PantryToolbar component (presentational)
- State managed in PantryView (coordination)
- Icon-only buttons for Filter/Tags, icon+text for Sort

**Storage Strategy:**
- sessionStorage for UI toggles (filtersVisible, tagsVisible) - defaults: both false
- localStorage for sort preferences (sortBy, sortDirection) - default: expiring asc
- Vanilla TypeScript following existing pattern

**Sorting:**
- 5 criteria: name, quantity, status, updatedAt, expiring
- Fetch all quantities/dates upfront for smooth UX
- Dropdown menu with checkmarks and direction indicators

**Testing:**
- Unit tests: PantryToolbar.test.tsx (isolated, mocked callbacks)
- Integration tests: index.test.tsx (end-to-end user flows)
- Storage tests: sessionStorage.test.ts (save/load functions)

## Rationale

**Why toolbar component approach:**
- Keeps toolbar logic isolated and testable
- Doesn't over-engineer (unlike context approach)
- More organized than inline state

**Why mixed storage:**
- Visibility toggles are temporary per-session choices
- Sort order is a lasting preference worth persisting
- Matches mental model of how users think about these settings

**Why expiring first default:**
- Prioritizes items needing immediate attention
- Aligns with pantry management goal (prevent waste)
- More actionable than alphabetical sorting
