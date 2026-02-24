# Sort by Stock: Status-First Design

**Date:** 2026-02-24
**Status:** Approved

## Problem

The current "sort by stock" sorts purely by fill percentage (`currentQty / targetQuantity`). Items in critical states (below threshold, at threshold) are not visually grouped — a 0% item and a 33% item that's also below threshold look the same to the sorter. Users need urgent items surfaced together at the top.

## Goal

When sorting by stock:
1. Group items by refill status (primary key)
2. Within each group, sort by fill percentage (secondary key)

Ascending: error → warning → ok (most urgent first)
Descending: ok → warning → error (best status first)

## Three Statuses

Defined in `ItemCard.tsx`, computed as:

- `'error'` — `quantity < refillThreshold` (needs refill)
- `'warning'` — `quantity === refillThreshold` (at threshold)
- `'ok'` — `quantity > refillThreshold` (fine)

Items with `refillThreshold = 0` are always `'ok'`. Items with `targetQuantity = 0` are treated as 100% full progress.

## Design

### Section 1 — Shared utility

Add `getStockStatus(item, quantity)` to `src/lib/quantityUtils.ts`:

```ts
export function getStockStatus(
  item: Item,
  quantity: number,
): 'error' | 'warning' | 'ok' {
  if (item.refillThreshold > 0 && quantity === item.refillThreshold) return 'warning'
  if (quantity < item.refillThreshold) return 'error'
  return 'ok'
}
```

`ItemCard.tsx` replaces its inline 4-line status block with an import + call to this function. No behavior change.

### Section 2 — Sort update

Replace the `'stock'` case in `src/lib/sortUtils.ts`:

```ts
case 'stock': {
  const qtyA = quantities.get(a.id) ?? 0
  const qtyB = quantities.get(b.id) ?? 0
  const statusRank = { error: 0, warning: 1, ok: 2 }
  const rankDiff =
    statusRank[getStockStatus(a, qtyA)] - statusRank[getStockStatus(b, qtyB)]
  if (rankDiff !== 0) {
    comparison = rankDiff
    break
  }
  const progressA = a.targetQuantity > 0 ? qtyA / a.targetQuantity : 1
  const progressB = b.targetQuantity > 0 ? qtyB / b.targetQuantity : 1
  comparison = progressA - progressB
  break
}
```

The existing `sortDirection` flip handles both keys automatically — no special casing needed.

### Section 3 — Test updates

- Existing stock sort tests (all `'ok'` items) continue to pass unchanged.
- Add new tests in `sortUtils.test.ts` for cross-status ordering:
  - Ascending: error → warning → ok
  - Descending: ok → warning → error
  - Percentage ordering within same status group
- Add unit tests for `getStockStatus` in `quantityUtils.test.ts`.

## Files Affected

| File | Change |
|---|---|
| `src/lib/quantityUtils.ts` | Add `getStockStatus()` |
| `src/components/ItemCard.tsx` | Import + call `getStockStatus()` instead of inline logic |
| `src/lib/sortUtils.ts` | Update `'stock'` case to status-first sort |
| `src/lib/sortUtils.test.ts` | Add cross-status sort tests |
| `src/lib/quantityUtils.test.ts` | Add `getStockStatus` unit tests |
