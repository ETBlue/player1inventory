# Design: the Amount of a non-consumable item

Date: 2026-11-26. Brainstorming: `2026-11-26-brainstorming-non-consumable-amount.md`.
Follows `2026-11-25-item-consumable-design.md` (the Consumable switch) and #433 (the count
bar in the stock row). Branch `feature/non-consumable-amount`, from `develop` at
`93a87980`. **Web only: no server change, no migration, no new GraphQL field.**

## Summary

1. **Where it sits.** A non-consumable item (cups) shows one square per piece since PR 2 and
   #433. But its stock was still entered as "Packed" and "Unpacked", its target in the
   measurement unit, and the stock row said "unit" where the card said "pack".
2. **Relations.** Needs PR 2 of consumable items and #433, both in `develop`. Nothing waits on
   it. No server release is needed first: every write uses mutations the server already has.
3. **What the user gets** once merged and deployed:
   - the stock row says the same unit word as the card ("3 / 5 pack", not "3 / 5 unit");
   - a non-consumable item has ONE stock field, **Amount**, in whole pieces of the package
     unit, on the Stock tab and in the quick edit dialog; Target and Refill below are whole
     pieces in the same unit;
   - turning Consumable off drops opened stock at every location and turns the target and
     the refill threshold into whole packs, after the same "Update stock numbers?" dialog,
     which now says so.
4. **What the developer gets:**
   - one rule for pieces, `getPieceCounts` in `lib/quantityUtils.ts`, used by the card
     (`ItemStockSummary`, `ItemCard`'s colour) and the stock row (`getStockPreview`).
     `ItemStockSummary`'s private copy is gone (the follow-up owed from #433), and
     `StockProgressRow` does no unit maths any more;
   - one conversion for the switch, `toNonConsumableQuantities`, beside
     `convertTrackedQuantities`;
   - no migration to maintain: old rows are handled at read time.
   - Cost: `getStockPreview` has one more branch (`consumable: false`).

## Data

| Field | Non-consumable item |
|---|---|
| `packedQuantity` | the Amount, whole pieces |
| `unpackedQuantity` | always written as 0 by the Stock tab, the quick edit dialog and the switch |
| `targetQuantity`, `refillThreshold` | whole pieces (packs) |
| `targetUnit` | `package` after the switch (as in PR 2) |

## The rule for pieces (`getPieceCounts`)

- in stock: `floor(packedQuantity)`. Opened stock does not count.
- wanted, refill threshold: divided by `getPieceScale` (`amountPerPackage` for an item still
  tracked in a measurement unit, else 1), then rounded UP, after the float-dust guard.

Up, because the person wanted at least that much, and because a threshold of 0.4 must not
become 0, which would turn off the low-stock warning. This replaces the floor of the target
that PR 2 and #433 used. The status (colour) of a non-consumable item is read from pieces too.

## The switch

`buildStockConversions` (`routes/items/$id/index.tsx`) builds a row for every location when
the save turns Consumable off, with or without a unit change.
`toNonConsumableQuantities(before, { targetUnit: item.targetUnit, amountPerPackage })` gives
`{ unpackedQuantity: 0, targetQuantity, refillThreshold }` in whole packs. A row that would
not change is not listed. The dialog shows `unitSwitchDialog.nonConsumableDescription`, and
ONE `applyUnitSwitch` writes the item, every location and the recipe amounts, in both modes
(a Dexie transaction locally, `prisma.$transaction` in cloud).

## Old data

No Dexie version and no cloud migration. Items that were already non-consumable may still hold
opened stock or a fractional target. The card, the stock row and the cart dialog count packed
packages only, and the next save of the Stock tab or the quick edit dialog writes
`unpackedQuantity: 0`. Rejected: a Dexie upgrade, because cloud has no matching migration and
the two modes would then differ.

## Known gaps

- **Cooking** a non-consumable item with a fractional amount leaves opened stock:
  `consumeItem` (`@p1i/types`) opens a pack and keeps the rest. It runs on the server too, so
  a fix needs a server release. With the default `consumeAmount` of 1 nothing is left.
- **Import** writes whatever the file holds; a non-consumable row with opened stock shows
  without it until the next save.
- An item that is non-consumable but still tracked in a measurement unit (only a hand-edited
  file can make one) shows its stored target and threshold in the form with the package unit
  label. The card and the stock row convert them to pieces.
- Sorting by stock, the pantry group badges and the cart's suggested amount still read
  `getCurrentQuantity`, which counts opened stock, for an old row that still holds some.
