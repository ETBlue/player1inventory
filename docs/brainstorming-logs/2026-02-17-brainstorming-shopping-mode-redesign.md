# Brainstorming Log: Shopping Mode Redesign

**Date:** 2026-02-17
**Outcome:** Design doc at `docs/plans/2026-02-17-shopping-mode-redesign-design.md`
**Implementation plan:** `docs/plans/2026-02-17-shopping-mode-redesign.md`

## Starting Requirements

The user initiated the brainstorm with these goals:

- Item cards in shopping mode should look like pantry mode (familiar visual)
- Quick vendor filtering (e.g., "show only Costco items")
- When an item is added to cart, keep the card visual as much as possible
- Remove from cart without clicking checkout/cancel/minus
- Items sorted by stock status — lowest percentage on top; inactive items collapsed at bottom
- +/- buttons in pantry mode should be hidden in shopping mode
- +/- buttons in shopping mode always operate in pack units

---

## Questions and Answers

**Q: How should vendors be represented in the data model?**
- Options: Tags / Separate entity / Simple field on Item
- **Answer: Separate entity** (new Vendor table, vendorIds on Item, similar to tagIds pattern)

**Q: How should a user remove an item from the cart (without using −, checkout, or cancel)?**
- Options: Swipe / Checkbox-style toggle / Long press / Tap card to toggle
- **Answer: Checkbox-style toggle** — a checkbox on the card marks it as "in cart"; unchecking removes it

**Q: When an item is added to the cart, where does its card appear and how does it change visually?**
- Options: Stays in place (marked) / Moves to pinned section at top / Stays in place (collapsed)
- **Answer: Moves to a pinned section at top** — card moves to a "Cart" section at the top; visual is preserved

**Q: What does "collapsed" mean for inactive items at the bottom of the list?**
- Options: Compact row / Hidden under a disclosure header / Grayed-out full card
- **Answer: Same as pantry view** — toggle button at bottom; when revealed, full cards at 50% opacity

---

## Architecture Decision

**Q: Which ItemCard architecture approach?**
- **Approach A — Mode prop on ItemCard** *(chosen)*: Add `mode='shopping'|'pantry'` prop. Simple, one component.
- Approach B — ShoppingItemCard wraps ItemCard: Separate component, overlay controls.
- Approach C — Extract shared visual, compose action layers: Full refactor, cleanest but most work.
- **Answer: Approach A** — mode prop keeps things simple; not enough divergence to justify a full refactor yet.

---

## Scope Decision

**Q: Is creating/managing vendors (CRUD) in scope for this redesign?**
- **Answer: Just filtering UI (minimal scope)** — vendor filter dropdown in shopping toolbar; vendors seeded/hardcoded for now; no CRUD or item-assignment UI yet.

---

## Key Design Decisions

1. **Vendor model**: `Vendor` entity (separate table) + `vendorIds?: string[]` on `Item`. Optional to avoid breaking existing tests.
2. **DB**: Dexie.js bumped to version 3 (adds vendors table).
3. **ItemCard**: `mode?: 'pantry' | 'shopping'` prop (default `'pantry'`). Shopping mode adds checkbox + stepper.
4. **Pantry +/- buttons**: User clarified — pantry +/- buttons stay unchanged. Shopping mode hides them (replaces with stepper when in cart).
5. **Stepper layout**: `[ − ] qty [ + ]` with quantity number between buttons.
6. **Sorting**: Active items by `currentQuantity / targetQuantity` ascending (emptiest first).
7. **Inactive items**: Same as pantry — toggle button, 50% opacity full cards; can still be added to cart.
8. **Vendor filter scope**: Local state (not persisted); hidden when no vendors in DB.
9. **Items shown**: All items (not just below-refill-threshold); shopping mode is a full inventory view.
