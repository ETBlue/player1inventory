# Brainstorming: Item Log Page Polish

Date: 2026-03-18

## Questions & Answers

### Q: For `log.quantity` calculation — explicit `quantity` param or reorder checkout()?

**Answer:** Reorder `checkout()` so item is updated first, then log. Pass `quantity` explicitly to `addInventoryLog`.

**Rationale:** Semantic correctness — the log records state after the operation. Passing `quantity` explicitly makes the API honest: callers own the calculation, not the DB function.

### Q: Should `log.delta` for cooking also be stored in package units?

**Answer:** Yes — store `log.delta` in package units for cooking too.

**Rationale:** The log display shows `{delta} → {quantity} {packageUnit}`. If delta is in measurement units (e.g. `-150g`) but quantity is in package units (`3 packs`), the display is unit-inconsistent. Storing everything in package units keeps the UI coherent.

### Q: Should `log.quantity` include `item.unpackedQuantity` (fractional packs)?

**Answer:** Yes — include `item.unpackedQuantity` converted to fractional packs.

**Rationale:** Reflects the true total inventory at the time of the log entry. For a dual-unit item with `packedQuantity=3, unpackedQuantity=50g, amountPerPackage=100g`, the total is `3.5 packs`, not just `3`. This makes the log more useful as an audit trail.

---

## Final Decisions

| Decision | Chosen approach |
|----------|----------------|
| `log.quantity` base | `item.packedQuantity + item.unpackedQuantity / amountPerPackage` (package units, caller-provided) |
| `log.delta` for cooking | Package units: `getPackedTotal(updatedItem) - getPackedTotal(originalItem)` |
| `checkout()` order | Item update first, then log (reversed from original) |
| `addInventoryLog` API | Explicit `quantity: number` param — remove internal `getCurrentQuantity` call |
| Helper function | `getPackedTotal(item)` added to `quantityUtils.ts` |
| File location | `$id.log.tsx` → `$id/log.tsx` (alongside other item tab files) |
| Tests | Unit tests for `getPackedTotal`, updated `addInventoryLog` tests, new checkout regression test |
| Storybook | 4 stories: Empty, WithPurchaseLogs, WithConsumptionLogs, MixedLogs |
| Smoke tests | One smoke test per story using `composeStories` pattern |
