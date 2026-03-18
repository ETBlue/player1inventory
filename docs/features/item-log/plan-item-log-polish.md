# Plan: Item Log Page Polish

## Goal

Polish the item log page (`/items/:id/log`) in three areas:
1. Style clean-up (already done manually — commit it)
2. Fix quantity calculation to use item's actual `packedQuantity + unpackedQuantity` as authoritative base
3. Always display quantities in package units regardless of `targetUnit`
4. Move log route file into `$id/` directory alongside other tabs
5. Add Storybook stories and smoke tests

---

## Background

### Current Bug: `log.quantity` Drifts from Reality

`addInventoryLog` currently calls `getCurrentQuantity(itemId)` which **sums all previous log deltas** to derive the base quantity. This drifts whenever the user manually adjusts `item.packedQuantity` via the item detail form (manual adjustments do not create log entries).

### Current Bug: Mixed Units in Cooking Logs

When cooking consumes a measurement-tracked item, `log.delta = -totalAmount` is stored in **measurement units** (e.g. grams), but the display renders with `packageUnit` — so `-150 → 3 packs` is shown which is unit-inconsistent.

### Fix: Always Package Units

`log.quantity` and `log.delta` should always be stored in **package units** (fractional allowed). This makes the log a consistent audit trail in one unit, regardless of how the item tracks internally.

---

## Data Model Changes

### `InventoryLog.quantity` — new meaning

Previously: sum of previous log deltas + current delta (log-derived, drifts)
**New**: `item.packedQuantity + item.unpackedQuantity / amountPerPackage` (if dual-unit) or `item.packedQuantity + item.unpackedQuantity` (if package-only) — computed from actual item state, includes unpacked fraction, always in package units.

### `InventoryLog.delta` — new meaning for cooking

Previously (cooking): in measurement units (e.g. `-150` grams)
**New**: in package units (e.g. `-1.5` packs) — same unit as `quantity`

---

## Helper Function

Add `getPackedTotal(item: Item): number` to `src/lib/quantityUtils.ts`:

```ts
export function getPackedTotal(item: Item): number {
  if (item.amountPerPackage && item.amountPerPackage > 0) {
    return item.packedQuantity + item.unpackedQuantity / item.amountPerPackage
  }
  return item.packedQuantity + item.unpackedQuantity
}
```

- For dual-unit items: converts unpacked measurement units to fractional packs
- For package-only items: adds fractional packs directly

---

## `addInventoryLog` API Change

Remove the internal `getCurrentQuantity(itemId)` call. Callers now pass `quantity` explicitly:

```ts
type CreateLogInput = {
  itemId: string
  delta: number    // in package units
  quantity: number // final total in package units (caller computes pre-change + delta)
  occurredAt: Date
  note?: string
}
```

---

## Call-site Changes

### `checkout()` in `operations.ts`

Reorder: update item **first**, then create log (so we can read updated `packedQuantity` if needed, but here we compute from pre-change state + delta):

```ts
// 1. Compute final quantity before any mutation
const finalQuantity = getPackedTotal(item) + cartItem.quantity

// 2. Update item first
await db.items.update(cartItem.itemId, {
  packedQuantity: item.packedQuantity + cartItem.quantity,
  updatedAt: now,
})

// 3. Then log with explicit quantity
await addInventoryLog({
  itemId: cartItem.itemId,
  delta: cartItem.quantity,
  quantity: finalQuantity,
  occurredAt: now,
})
```

### `handleConfirmDone` in `cooking.tsx`

Compute package-unit delta and final quantity from before/after item state:

```ts
const originalTotal = getPackedTotal(item)
const finalTotal = getPackedTotal(updatedItem)  // after consumeItem()
const packageDelta = finalTotal - originalTotal  // negative

await updateItem.mutateAsync({ id: itemId, updates: { ... } })

await addInventoryLog.mutateAsync({
  itemId,
  delta: packageDelta,
  quantity: finalTotal,
  occurredAt: now,
  note: 'consumed via recipe',
})
```

---

## File Move

`src/routes/items/$id.log.tsx` → `src/routes/items/$id/log.tsx`

TanStack Router generates the same `/items/:id/log` route either way. Moving into `$id/` aligns with the other tab files (`index.tsx`, `tags.tsx`, `vendors.tsx`, `recipes.tsx`).

---

## Steps

### Step 1 — Commit style changes
Commit the unstaged changes to `apps/web/src/routes/items/$id.log.tsx`.

### Step 2 — Move route file
- Move `$id.log.tsx` → `$id/log.tsx`
- Run `pnpm build` (Vite restarts will regenerate `routeTree.gen.ts` — use build to trigger it)
- Verify the route still works

### Step 3 — Add `getPackedTotal` helper + tests
- Add `getPackedTotal(item: Item): number` to `src/lib/quantityUtils.ts`
- Add unit tests in `src/lib/quantityUtils.test.ts` (package-only, dual-unit, zero unpacked)

### Step 4 — Refactor `addInventoryLog` + update `checkout()`
- Add `quantity: number` to `CreateLogInput`, remove `getCurrentQuantity` internal call
- Reorder `checkout()`: item update first, then log
- Pass `quantity: getPackedTotal(item) + cartItem.quantity` and `delta: cartItem.quantity`
- Update `useAddInventoryLog` hook type to include `quantity: number`
- Update `operations.test.ts`: existing quantity tests need updating + add a test for "quantity includes unpacked fraction"

### Step 5 — Update `cooking.tsx`
- Import `getPackedTotal` from `@/lib/quantityUtils`
- Compute `packageDelta` and `finalTotal` before calling `addInventoryLog`
- Pass `delta: packageDelta`, `quantity: finalTotal`

### Step 6 — Add Storybook stories for log page
File: `src/routes/items/$id/log.stories.tsx`

Stories:
- `Empty` — item with no logs → shows "No history yet."
- `WithPurchaseLogs` — item with positive-delta logs (bought 3 packs)
- `WithConsumptionLogs` — item with negative-delta logs (consumed via recipe)
- `MixedLogs` — item with both purchase and consumption entries (most realistic)

### Step 7 — Add smoke tests
File: `src/routes/items/$id/log.stories.test.tsx`

Each story: `render(<Story />)` → `expect(screen.getByText('Loading...')).toBeInTheDocument()`
(Stories initialize DB in `useEffect`, so initial render shows loading state.)

### Verification Gate (each step)
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

Final step only:
```bash
pnpm test:e2e --grep "shopping"
```
