# Location-aware shopping & cooking

**Date:** 2026-08-21
**Branch:** `worktree-feature-location-aware-shopping-cooking`
**Base:** `b2bf87c2` (PR E merged — Locations feature complete)
**Spec origin:** designer rulings, 2026-08-21 (recorded verbatim below)

Follow-on polish to the Locations feature. PR A–E delivered the `Location` entity,
the per-`(item × location)` `ItemStock` split, the global active-location switcher,
and location-scoped pantry/shopping/cooking data. What they did **not** do is make
the *shopping* and *cooking* surfaces say out loud which location you are standing
in, or reflect per-location stock in their summary cards. Three tasks close that.

## Designer rulings (verbatim)

> * shopping cart page: show active location in the top bar, same visual as pantry shelf page
> * shopping page: show inactive item count in the cart card based on active location
> * cooking page: show stock status info in the recipe card. disable recipes with no item stocked in active location

Three follow-up decisions, answered 2026-08-21:

1. **Branch** — new branch off `main`. These depend on PR D's `ItemStock` split
   (already on main), not on PR E's pager.
2. **What "inactive" means on the cart card** — **strict**: an item is inactive
   only if it *has a stock row in the active location* whose `targetQuantity` is 0.
   Items never stocked in this location drop out of the card's counts entirely,
   matching how the pantry already hides them. The card's existing "in vendor"
   figure therefore becomes **location-scoped** (a vendor with 40 items overall
   shows 4 at the Cabin, not 40).
3. **What "stock status info" means on the recipe card** — **both** availability
   and health: `3 / 5 here · 1 empty · 1 low stock`, reusing the `GroupCard`
   row-3 idiom the pantry already uses for its recipe group view.

## ⚠️ The `stockId` trap — read before writing any filter

`joinItemStock` (`db/operations.ts:90`) returns, for an item with **no** stock row
in the requested location:

```ts
if (!stock) return { ...item, ...ZERO_STOCK, locationId }   // no `stockId`
```

and `ZERO_STOCK.targetQuantity === 0` (`operations.ts:30`). Therefore:

```ts
isInactive(item)   // → TRUE for an item that is merely NOT STOCKED here
```

`isInactive()` alone **cannot** express the strict ruling. Every count added by
this work must guard on `stockId`:

| Intent | Correct predicate |
|---|---|
| stocked in the active location | `item.stockId !== undefined` |
| inactive **here** (strict) | `item.stockId !== undefined && isInactive(item)` |
| active **here** | `item.stockId !== undefined && !isInactive(item)` |

This is the same class of bug PR D shipped four times (code assuming the local
Dexie shape). A test that seeds only *stocked* items will pass against a wrong
implementation — **every new count needs a fixture with an item that is not
stocked in the active location at all.**

`useItems()` returns *all* items joined against the active location (unstocked
ones included, with `ZERO_STOCK`); `useStockedItems()` returns only those with a
row. Prefer `useItems()` + an explicit `stockId` guard where a total is also
needed, so both numbers come from one pass.

## Cloud mode

Cloud has no `Location` / `ItemStock` backend (deferred in PR D). Cloud items
carry inline stock and **never** carry a `stockId`, so a naive `stockId` guard
would zero out every count in cloud mode. Each change below states its cloud
behaviour explicitly, and each must be tested in both modes.

The established precedent is `cooking.tsx:113` — bypass the location gate when
`isCloud`, falling back to pre-split behaviour:

```ts
const availableItemIds = new Set(
  (isCloud ? items : items.filter((i) => i.stockId)).map((i) => i.id),
)
```

---

## Task 1 — Active location in the cart page top bar

**Where:** `apps/web/src/routes/shopping/$vendorId.tsx` (`<Toolbar>`, ~line 246).

`/` (pantry, all 7 views), `/shopping`, and `/cooking` all already mount
`<LocationSwitcher />` as the first child of their `<Toolbar>`. The cart page is
the only main surface missing it. "Same visual as pantry shelf page" = the same
shared component, not a lookalike.

- Mount `<LocationSwitcher />` as the **first** toolbar child, left of the back
  button, matching every other page's placement (design doc: "left of the top
  toolbar").
- It stays **interactive**, as everywhere else. Consequence to accept knowingly:
  carts are keyed `${locationId}:${vendorId}` (`cartIdFor`), so switching
  location while inside a cart swaps which cart you are editing. Nothing is
  destroyed — the other cart persists and switching back restores it — so this
  needs no confirm dialog, but the page must re-read the cart cleanly rather
  than showing stale rows.
- **Toolbar crowding is the real risk.** The bar already holds back / vendor name
  / cart count / cancel / done. At 390 px the name and count are the flexible
  elements. Verify at mobile width; the switcher is `size="icon"` +
  `flex-shrink-0` so it must not be what collapses.
- **Cloud:** locations are local-only, but `LocationSwitcher` already renders
  from `useLocations()` and is mounted on cloud-mode pages today. Match whatever
  `/shopping` does — do not add a new cloud branch here.

*Tests:* the switcher renders on the cart page; switching location while a cart
has checked items shows the target location's cart, not the previous one's rows.
*Story:* add the toolbar state to the existing cart-page stories.

## Task 2 — Inactive count on the vendor cart card

**Where:** `apps/web/src/components/shopping/VendorCartCard/` and its caller
`apps/web/src/routes/shopping/index.tsx` (`statsForVendor`, `useVendorItemCounts`).

Today the card's metadata line reads
`{availableCount} in vendor · {checkedCount} in cart`, where `availableCount`
comes from `useVendorItemCounts()` — which counts **every** item carrying that
vendor id, globally, with no location awareness at all
(`hooks/useVendorItemCounts.ts:4`).

Target metadata line:

```
4 in vendor · 2 inactive · 1 in cart
```

- "in vendor" becomes **location-scoped**: items with this vendor id that have a
  stock row in the active location.
- "inactive" is the strict count: stocked here **and** `targetQuantity === 0`.
- Omit the inactive segment entirely when the count is 0, matching how the card
  already omits "in cart" at 0 and how `GroupCard` omits empty/low-stock at 0.
- The no-vendor card (`noVendorCount`) needs the same treatment — it is computed
  inline in `shopping/index.tsx` and will otherwise stay global and disagree with
  every vendor card beside it.

`useVendorItemCounts()` is the natural home, but it is consumed for **sorting**
too (`sort === 'count'`). Decide deliberately whether sorting follows the new
location-scoped number (recommended — the list should rank by what it displays)
and say so in the report; changing it silently would be a hidden behaviour change.

- **Cloud:** no locations, no `stockId`. Cloud must keep today's global count and
  show **no** inactive segment — a cloud item has inline stock, and its
  `targetQuantity` is a real user value, so counting cloud "inactive" would be a
  different fact wearing the same word.

*Tests:* a vendor whose items are split across two locations shows different
counts per active location; an item stocked here with target 0 counts inactive;
an item **not stocked here at all** counts in neither figure (the trap above);
the no-vendor card agrees; cloud mode keeps the global count and omits inactive.
*Stories:* cart card with and without an inactive count.

## Task 3 — Stock status on the cooking recipe card

**Where:** `apps/web/src/routes/cooking.tsx` (recipe card markup, ~line 555).

`cooking.tsx` already computes availability correctly — `isItemAvailable`
(line 119) gates on `stockId` with the cloud bypass, and `availableRecipeItems`
(line 530) already excludes unavailable items from the tri-state checkbox. What
is missing is that none of it is **visible**, and a recipe with nothing stocked
here still renders an enabled-looking checkbox that silently does nothing
(`handleToggleRecipeCheckbox` computes an empty `effectiveItems` set).

Add a metadata line to the collapsed card, reusing the `GroupCard` row-3 idiom
(`components/shared/GroupCard/GroupCard.tsx`, "Row 3: counts and badges") —
muted separator dots, `text-status-error-foreground` for empty,
`text-status-warning-foreground` for low stock:

```
☐  Pasta Carbonara            ⌄
   3 / 5 here · 1 empty · 1 low stock

☐  Beef Stew                  ⌄
   5 / 5 here

☒  Thai Curry                 ⌄
   0 / 4 here                        (disabled)
```

- **Availability** — `{availableRecipeItems.length} / {recipe.items.length}`.
- **Health** — over the *available* items only: `empty` =
  `getCurrentQuantity(i) < i.refillThreshold`, `low stock` =
  `refillThreshold > 0 && qty === refillThreshold`, both excluding
  `isInactive`. These are exactly `RecipeGroupView`'s `getOutOfStockCount` /
  `getLowStockCount` (lines 45–56) — **extract the shared predicates** rather
  than writing a fourth copy; `ShelfGroupView` and `VendorGroupView` already
  duplicate them.
- **Disable** when `availableRecipeItems.length === 0`: `disabled` on the
  `Checkbox`, and dim the card the way `ItemCard` dims inactive items
  (`opacity-80`). Expand/collapse and the name link stay live — the user must
  still be able to look inside and see *why* it is unavailable.
- **i18n:** `GroupCard`'s existing strings (`active`, `empty`, `low stock`) are
  **hardcoded English** — pre-existing debt. New strings here go through `t()` in
  both `en.json` and `tw.json`, genuinely translated. Do not copy the hardcoded
  pattern; leave `GroupCard` itself alone (out of scope).
- **Cloud:** `isItemAvailable` already bypasses the gate, so every item counts
  available and the line reads `5 / 5 here` with health computed off inline
  stock. No recipe is ever disabled in cloud. Assert this — it is the branch PR D
  got wrong four times.

*Tests:* counts per active location; a recipe with zero items stocked here is
disabled and cannot be checked; a recipe with some items stocked shows the split
and stays checkable; health counts exclude inactive items; cloud mode disables
nothing. *Stories:* healthy / partial / fully-unavailable recipe cards.

## Out of scope

- `GroupCard`'s hardcoded English strings (pre-existing; would widen the diff
  across all pantry group views).
- Cloud `Location` / `ItemStock` (deferred, unchanged).
- The stale `LocationSwitcher` docstring, which still says "INERT (PR B) … does
  NOT scope or change any displayed data … Scoping arrives in PR D" — untrue
  since PR D. Cheap and adjacent to Task 1; fix it there.

## Verification

Gate after each change, absolute paths or subshells:

```
(cd apps/web && pnpm lint)
pnpm build 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo FAIL || echo OK
(cd apps/web && pnpm test --run)
```

Final: `pnpm test:e2e --grep "shopping|cooking|a11y"`. Known pre-existing E2E
failures to expect unchanged: 4 a11y colour-contrast (shelves, vendor/recipe
group-by, shelves mobile) and `[cloud]` specs needing a backend on :4001.

TDD is mandatory and **"a test exists" counts as unproven until mutated** —
delete the behaviour and confirm the test goes red. PR D shipped four tests that
passed without their behaviour; PR E caught a fifth.
