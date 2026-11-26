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

**Not changed** (until the follow-up below, which changes all of this paragraph). Switching an item to non-consumable does not touch its recipe links. No link
is deleted anywhere. The pantry recipe group view and the recipe filters still count every
linked item, non-consumable ones too: they compute no cooking amounts. Import still writes
whatever links the file holds.

**Server guard: not built** (built since; see the last section). `consumeRecipes` still accepts a non-consumable item. A guard
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

## Only consumable items in a recipe, on the server too (owner answers 2026-11-26)

Built on `feature/recipes-consumable-only`, after #437. It replaces the paragraphs
*Not changed* and *Server guard: not built* above, and closes three of the known gaps
listed above (no server guard, the pantry recipe group view, and the import).

**The owner's three answers** (recorded in the brainstorming log):

1. A recipe whose items are all non-consumable STAYS on the cooking page. Its
   non-consumable items are hidden. (#437 already did this: "0 / 0 here", disabled.)
2. Hide non-consumable items from recipes everywhere, the pantry recipe group view
   included.
3. A recipe must not accept a non-consumable item, on the server too. No old app version
   matters: no released web can make a non-consumable item.

**Remove, not only hide** (the main session's decision). Turning an item non-consumable
DELETES its recipe links (`RecipeItem` rows in cloud, `Recipe.items` entries locally).

| Write | Cloud (`apps/server/src/lib/consumable.ts`) | Local (`db/operations.ts`) |
|---|---|---|
| `createRecipe`, `updateRecipe` | refuses a NEW link: `BAD_USER_INPUT`, `extensions.reason` `NOT_CONSUMABLE`, nothing written | the same, `NotConsumableError` |
| `applyShelfFilterPicks` (recipe axis) | refuses, inside the transaction, so the tag and vendor writes roll back | the same (`applyShelfFilterPicksBatch`) |
| the recipe lists of `applyUnitSwitch` | refuses a new link. The switched item counts as it is AFTER the switch | the same (`applyUnitSwitchBatch`) |
| `consumeRecipes` | refuses a non-consumable item before the first write | the same (`consumeRecipesBatch`) |
| recipe imports (`bulkCreateRecipes`, `bulkUpsertRecipes`) | SKIP that recipe item; the recipe lands | `importLocalData` ends with `removeNonConsumableRecipeLinks()`, on all three strategies |
| `updateItem`, `applyUnitSwitch` that turn an item off | delete its links in the SAME transaction | the same |
| `bulkUpsertItems` that makes an item non-consumable | deletes its links (imports are not one transaction) | covered by the import's last step |

**"New link" only.** `updateRecipe` and `applyUnitSwitch` replace a recipe's whole list.
A link the recipe already holds is not refused, so a recipe with a link made before this
rule can still be edited. Refusing it would stop every later edit of that recipe. No new
write can make such a link, so it can only come from data saved before this change, or
(local) a hand-edited backup that skipped the import's last step.

**`applyShelfFilterPicks`: refused, not skipped.** The person asked for the recipe link,
so dropping it quietly would add the tags and not the recipe. The web already shows a
note in place of **Add to shelf** for such a row (#437), so only a stale tab can reach the
refusal.

**Live updates.** No new event. A link delete runs inside `updateItem` or `applyUnitSwitch`,
which already publish household-level `CATALOG`; the recipe queries refetch on `CATALOG`.
No mutation was added, so the live-publish guard is unchanged.

**The warning before the save.** The item page's "Update stock numbers?" dialog (#434) adds
"It will be removed from N recipes, because only consumable items can be in a recipe."
(`items.detail.unitSwitchDialog.removedFromRecipes`, en and tw), only when N > 0. When the
item has no stock to convert (whole packs only), that dialog did not open before. Now it
also opens when N > 0, with the title "Mark as not consumable?" (`nonConsumableTitle`; it was "Turn off Consumable?" until the owner renamed it on 2026-11-26). So the
person always sees the warning before anything is written, and Cancel writes nothing. No
recipe amount is adjusted for an item that leaves its recipes. N is counted from the recipe
list the page has loaded.

**The read side stays, as a safety net.** `cookingRecipe` and `nonConsumableItemIds` still
filter the cooking page. The pantry recipe group view (`RecipeGroupView`) and the recipe
page (`RecipeDetailView`) now read each recipe through them too, so counts, lists and the
recipe badges match the cooking page. An old link's item counts as "Not added to recipe".
The recipe editor keeps the disabled row and the "Not used in cooking" row for an old link.

**A refusal the person can hit.** Another tab may turn an item off while this one still
offers it. `showSaveError` shows `common.notConsumable` ("An item here is no longer
consumable, so it cannot be in a recipe or be cooked. Nothing was saved.") for a
`NOT_CONSUMABLE` refusal or a local `NotConsumableError` (`isNotConsumableError` in
`lib/recipeConsumables.ts`). The cooking page's Done dialog shows the same text.

**Release order.** No schema change and no migration. The server and the web can go in the
same release: no released web can make a non-consumable item, so no deployed web sends a
request the new server refuses.

### Known gaps of this change

- If the recipe list has not loaded when Save is pressed, N is 0 and the warning is not
  shown. The links are still deleted.
- The cooking page's Done refusal text is not covered by its own test; `showSaveError`'s
  tests cover the helper it shares.
- The item page warning is tested in local mode only (`routes/items/$id.test.tsx`); the
  cloud page runs the same code with the cloud recipe list, and E2E covers both projects.
- `bulkUpsertItems`' link delete is not one transaction with the item write (no import is).

### The dialog when Consumable is turned off (owner request 2026-11-26)

- The title is always **"Mark as not consumable?"** (`nonConsumableTitle`) when the save turns
  Consumable off, also when stock converts. "Update stock numbers?" stays for a plain unit
  switch.
- The body starts with the recipe line ("It will be removed from N recipes…"), when N > 0.
  The conversion line (`nonConsumableDescription`) follows it, then the table per location.
- Tests: `routes/items/$id.test.tsx`, *user turning Consumable off is told how many recipes the
  item leaves*. Two mutations went red: the old title rule, and the old line order.
