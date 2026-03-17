# Item Consume Amount & Expiration Fixes — Design

Date: 2026-03-16

## Overview

Four changes to the item form: two improvements to consume amount handling and two bug fixes covering expiration mode persistence and floating-point quantity arithmetic.

---

## 1. `consumeAmount` > 0 Validation

**Problem:** `consumeAmount` defaults to `0` and has `min={0}`, allowing items with a zero step size. This causes division-by-zero and no-op +/- buttons.

**Fix:**
- `DEFAULT_VALUES.consumeAmount`: `0` → `1`
- Input `min`: `0` → `0.01`
- `isSubmitDisabled` condition: add `|| consumeAmount <= 0`
- Description text updated to "Must be greater than 0"

**Files:** `src/components/item/ItemForm/index.tsx`

---

## 2. Recipe `defaultAmount` Adjustment on `consumeAmount` Change

**Problem:** When a user changes an item's `consumeAmount`, existing recipe `defaultAmount` values may no longer align to the new step size, causing fractional amounts in cooking.

**Design:**
On save in the item info form, if `consumeAmount` changed:

1. Fetch all recipes using `useRecipes()` and filter by `recipe.items[].itemId === item.id`
2. For each recipe item entry, calculate new `defaultAmount`:
   - If `oldDefault === 0` → stays `0`
   - Otherwise: `nearest = Math.round(oldDefault / newConsumeAmount) * newConsumeAmount`
   - If `nearest === 0` (rounded down from a non-zero value) → use `newConsumeAmount` (round up to 1×)
3. If any recipe would change, show a confirm dialog **before** saving
4. On "Update & Save": save item, then batch-update all affected recipes
5. On "Cancel": close dialog, no save

**Confirm dialog:**
```
Title:   "Update recipe amounts?"
Message: "Amount per consume changed from X to Y.
          The following recipes will be adjusted:"

[Recipe Name]   [Current]   [New]
Salad           4           3
Smoothie        1           3

Buttons: [Cancel]  [Update & Save]
```

If no recipes are affected (none include this item, or all `defaultAmount` values already align): save immediately with no dialog.

**Implementation note:** The current `handleSubmit` in `$id/index.tsx` calls `updateItem.mutateAsync` then `goBack()`. The new flow adds an async gate: `onSubmit` → check for recipe changes → maybe show dialog → then save + navigate. The save-and-navigate sequence must be restructured to accommodate the dialog step.

**Files:** `src/routes/items/$id/index.tsx`

---

## 3. Expiration Field Split (Bug Fix)

**Problem:** On new item creation, the "Calculate Expiration based on" dropdown is shown in the info section, but the expiration value input ("Expires in N days") only exists in the stock section — which is hidden during creation. The mode selection is never persisted, so the item always loads with "Specific Date".

**Fix: Split the two expiration inputs across sections:**

- **Stock section:** "Expires on" (date input) — shown only when `expirationMode === 'date'`
- **Info section:** mode selector (unchanged) + "Expires in (days)" input — shown only when `expirationMode === 'days'`

The `estimatedDueDays` value moves from the stock section to the info section, co-located with the mode selector that controls it.

**`buildCreateData` (`new.tsx`):** add:
```ts
...(values.expirationMode === 'days' && values.estimatedDueDays
  ? { estimatedDueDays: Number(values.estimatedDueDays) }
  : {}),
```

No data model changes needed. The existing `itemToFormValues` mapping (`estimatedDueDays != null ? 'days' : 'date'`) already handles round-tripping correctly.

**Implementation note:** The current form uses `id="expirationValue"` for both the date and days inputs (rendered conditionally in the same block). After the split, both inputs can be visible simultaneously on the edit page (which shows all three sections). The `id` must be de-duped — use `id="expirationDueDate"` for the date input and `id="expirationDueDays"` for the days input.

**Files:**
- `src/components/item/ItemForm/index.tsx`
- `src/routes/items/new.tsx`

---

## 4. Floating-Point Quantity Arithmetic (Bug Fix)

**Problem:** Quantity arithmetic uses raw JS floating-point addition (e.g. `0.1 + 0.1 + 0.1 = 0.30000000000000004`). Results can have more decimal places than `consumeAmount`, causing confusing display values.

**Fix:** Add a `roundToStep(value, step)` utility and apply it after every quantity mutation.

**New utility in `src/lib/quantityUtils.ts`:**
```ts
function decimalPlaces(n: number): number {
  const s = n.toString()
  const dot = s.indexOf('.')
  return dot === -1 ? 0 : s.length - dot - 1
}

export function roundToStep(value: number, step: number): number {
  const places = decimalPlaces(step)
  return Math.round(value * 10 ** places) / 10 ** places
}
```

**Apply to:**

| Location | Current | Fixed |
|---|---|---|
| `quantityUtils.ts` `addItem()` | `item.unpackedQuantity += amount` | `item.unpackedQuantity = roundToStep(item.unpackedQuantity + amount, item.consumeAmount)` |
| `quantityUtils.ts` `consumeItem()` | `Math.round(... * 1000) / 1000` | `roundToStep(..., item.consumeAmount)` |
| `cooking.tsx` `handleAdjustAmount` | `current + delta * step` | `roundToStep(Math.max(0, current + delta * step), step)` |
| `ItemForm/index.tsx` unpacked onChange | `Number(e.target.value)` | `roundToStep(Number(e.target.value), consumeAmount \|\| 1)` |
| `settings/recipes/$id/items.tsx` `handleAdjustDefaultAmount` | `Math.max(0, current + delta * step)` | `roundToStep(Math.max(0, current + delta * step), step)` |

**Out of scope:** `packUnpacked()` and `normalizeUnpacked()` in `quantityUtils.ts` also use `Math.round(... * 1000) / 1000` rounding, but these are triggered by explicit user actions (Pack button) and are less likely to accumulate drift — not included in this fix.

**Files:**
- `src/lib/quantityUtils.ts`
- `src/routes/cooking.tsx`
- `src/components/item/ItemForm/index.tsx`
- `src/routes/settings/recipes/$id/items.tsx`

---

## Summary of Files Changed

| File | Changes |
|---|---|
| `src/components/item/ItemForm/index.tsx` | consumeAmount min/default, expiration field split, roundToStep on unpacked |
| `src/routes/items/new.tsx` | save estimatedDueDays on creation |
| `src/routes/items/$id/index.tsx` | recipe adjustment confirm dialog |
| `src/lib/quantityUtils.ts` | roundToStep utility, apply in addItem/consumeItem |
| `src/routes/cooking.tsx` | roundToStep in handleAdjustAmount |
| `src/routes/settings/recipes/$id/items.tsx` | roundToStep in handleAdjustDefaultAmount |
