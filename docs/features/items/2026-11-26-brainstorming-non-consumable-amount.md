# Brainstorming: the Amount of a non-consumable item

Date: 2026-11-26. Design: `2026-11-26-non-consumable-amount-design.md`.

Follows the consumable items work (`2026-11-25-item-consumable-design.md`) and the count bar
in the stock row (#433). The owner looked at the quick edit dialog and the Stock tab of a
non-consumable item and asked three questions.

## Q1. The stock row says "unit", the card says "pack"

**Question:** the stock row (quick edit dialog and Stock tab) shows "3 / 5 unit" where the
card shows "3 / 5 pack". Which word is right?

**Answer:** the package unit, the same as the card. `getStockPreview` fell back to the
literal word `'unit'`; it now uses `packageUnit || DEFAULT_PACKAGE_UNIT`. A measurement item
keeps its measurement unit, because the card shows that too. The goal is "the row says the
same as the card".

## Q2. One stock field for a non-consumable item

**Question:** a non-consumable item still shows "Packed". How should its stock be entered?

**Answer:** one field, **Amount**, in whole pieces, not affected by the measurement unit.

- Storage: reuse `packedQuantity`. `unpackedQuantity` is kept at 0. No new column, no
  Prisma migration, no new GraphQL field.
- Target and Refill below are whole pieces in the package unit too. The measurement fields
  are not used for such an item.
- Switching a consumable item to non-consumable: Amount = whole packs, at EVERY location.
  `packedQuantity` stays, `unpackedQuantity` becomes 0 (opened stock is dropped). If the
  item tracked its target in a measurement unit, it becomes `package`, and target and refill
  threshold are converted to packs with the existing unit-switch rule. Switching back to
  consumable needs no data change.
- Everywhere a non-consumable item's quantity is shown, it is pieces in the package unit.

## Q3. The −/+ buttons in the cart amount dialog

**Question:** keep them?

**Answer:** yes, no change.

## Choices made while building (not asked of the owner)

| Question | Choice | Why |
|---|---|---|
| a converted target or threshold that is not whole (2.4 packs) | round UP | the person wanted at least that much; a threshold of 0.4 must not become 0, which would turn off the low-stock warning |
| old non-consumable rows that still hold opened stock | read time: show packed packages only; the next save writes 0 | cloud has no data migration; a Dexie version for local alone would make the two modes differ |
| cooking a non-consumable item with a fractional amount | not changed | the shared `consumeItem` runs on the server too, so a fix needs a server release. Reported as a known gap |
