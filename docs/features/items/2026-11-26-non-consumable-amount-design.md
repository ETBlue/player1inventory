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

- **Cooking** a non-consumable item with a fractional amount left opened stock:
  `consumeItem` (`@p1i/types`) opens a pack and keeps the rest. Closed on the web by
  *Cooking is only for consumable items* below: the cooking page no longer sends a
  non-consumable item. The server still accepts one (no server change), so an old bundle or
  a hand-made request can still write opened stock.
- **Import** writes whatever the file holds; a non-consumable row with opened stock shows
  without it until the next save.
- An item that is non-consumable but still tracked in a measurement unit (only a hand-edited
  file can make one) shows its stored target and threshold in the form with the package unit
  label. The card and the stock row convert them to pieces.
- Sorting by stock, the pantry group badges and the cart's suggested amount still read
  `getCurrentQuantity`, which counts opened stock, for an old row that still holds some.

## Owner confirmation: rounding up (2026-11-26)

The owner confirmed on 2026-11-26 that rounding a converted target or refill threshold UP is
OK (`toNonConsumableQuantities`, `getPieceCounts`).

## Cooking is only for consumable items (owner decision 2026-11-26)

Owner request: "exclude non-consumable items from cooking please, as cooking is specifically
for consumables". Built on `feature/cooking-consumables`. **Web only, no server change.**

| Place | What it does now |
|---|---|
| Cooking page (`routes/cooking.tsx`) | every recipe is read through `cookingRecipe(recipe, nonConsumableItemIds(items))` (`lib/recipeConsumables.ts`), ONE `useMemo` at the top of the page. So the item list, the "A / T here" count, the empty and low stock counts, the sort by item count, the search by item name, the recipe checkbox and the consume write all leave a non-consumable item out. A recipe whose only items are non-consumable shows "0 / 0 here", is disabled, and sinks below the "not stocked here" divider |
| Recipe editor (`settings/household/recipes/$id/items.tsx`) | a non-consumable item is LISTED, with its checkbox disabled and the note "Not consumable. Only consumable items can be in a recipe." (`settings.recipes.items.notConsumable`). A link made before the rule stays checked and removable, with "Not used in cooking: this item is not consumable." (`notUsedInCooking`). The checkbox names the note in `aria-describedby`. `handleToggle` refuses to add one, in case a press gets past the disabled box |
| Item page, Recipes tab (`items/$id/recipes.tsx`) | for a non-consumable item: a note under the badges (`items.recipes.notConsumable`), the badges of recipes it is not in are `aria-disabled` and dimmed, a badge of a recipe it is in can still be pressed to remove it, and there is no New Recipe button |
| Pantry recipe page search tail (`RecipeDetailView`) | a non-consumable row shows "Not consumable, so it cannot be added to a recipe." (`items.searchTail.notConsumable`) in place of **Add to recipe**. `handleAddToRecipe` refuses one too |
| Pantry filter shelf search tail (`ShelfDetailView`) | the same note in place of **Add to shelf** when the item is non-consumable AND the shelf has an unmet recipe axis for it (joining would add it to a recipe). A shelf with no recipe axis keeps the button |

**Why the editor shows the item disabled, not hidden.** The recipe editor's list is where a
person looks for the item. A hidden item would look like a missing item. The search tail
rows and the item page badges follow the same idea: the row or badge stays, and a short line
says why.

**An item that turns non-consumable while the cooking page is open.** The page's session
maps (`sessionAmounts`, `checkedItemIds`) were filled from an earlier render. So
`totalByItemId` also requires each item to be listed in the recipe's CURRENT filtered items.
It reads the same filtered list, so it is not a second rule. Pinned by "user cooks after an
item turned non-consumable while the page was open" in `routes/cooking.test.tsx`.

**`blockedNote`.** `ItemSearchTailAction` and `ItemSearchTailGroupAction` take an optional
`blockedNote(item)`. When it returns a note, that row shows the note in place of the button.
It is the per-row form of `groupNote`, which is for a whole section.

**Not changed.** Switching an item to non-consumable does not touch its recipe links. No link
is deleted anywhere. The pantry recipe group view and the recipe filters still count every
linked item, non-consumable ones too: they compute no cooking amounts. Import still writes
whatever links the file holds.

**Server guard: not built.** `consumeRecipes` still accepts a non-consumable item. A guard
there would need its own release, and the server must deploy before a web that depends on
it. With this web change no current screen sends one; only an old bundle, a stale tab that
loaded before the item changed, or a hand-made request can. See *Known gaps*.

### Known gaps of this change

- **No server guard.** See above.
- **The pantry recipe group view** counts a linked non-consumable item in its recipe card
  and lists it on the recipe page. Left alone on purpose (the brief), but it can differ from
  the cooking page's "A / T here".
- **The amount stepper** of a linked non-consumable item still shows on the recipe editor.
  Changing it does nothing in cooking.
