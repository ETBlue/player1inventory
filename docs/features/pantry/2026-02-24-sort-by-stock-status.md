# Sort by Stock: Status-First Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When sorting by stock, group items by refill status first (error → warning → ok ascending), then sort by fill percentage within each group.

**Architecture:** Extract the status computation from `ItemCard.tsx` into a shared `getStockStatus()` utility in `quantityUtils.ts`, then use it in both `ItemCard.tsx` and the `'stock'` sort case in `sortUtils.ts`. The existing `sortDirection` flip handles both sort keys automatically — no special-casing needed.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Add `getStockStatus` to `quantityUtils.ts` (TDD)

**Files:**
- Modify: `src/lib/quantityUtils.test.ts`
- Modify: `src/lib/quantityUtils.ts`

**Step 1: Add failing tests**

Append a new `describe` block at the bottom of `src/lib/quantityUtils.test.ts`:

```ts
import {
  addItem,
  consumeItem,
  getCurrentQuantity,
  getDisplayQuantity,
  getStockStatus,
  isInactive,
  normalizeUnpacked,
  packUnpacked,
} from './quantityUtils'

// ... (existing tests stay unchanged) ...

describe('getStockStatus', () => {
  const makeItem = (refillThreshold: number): Item =>
    ({
      refillThreshold,
      targetQuantity: 10,
      tagIds: [],
      packedQuantity: 0,
      unpackedQuantity: 0,
      targetUnit: 'package',
      consumeAmount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as Item

  it('returns error when quantity is below threshold', () => {
    expect(getStockStatus(makeItem(3), 1)).toBe('error')
  })

  it('returns warning when quantity equals threshold', () => {
    expect(getStockStatus(makeItem(3), 3)).toBe('warning')
  })

  it('returns ok when quantity is above threshold', () => {
    expect(getStockStatus(makeItem(3), 5)).toBe('ok')
  })

  it('returns ok when threshold is zero (no tracking)', () => {
    expect(getStockStatus(makeItem(0), 0)).toBe('ok')
  })
})
```

Note: Add `getStockStatus` to the import at the top of the file (it doesn't exist yet — the import will fail, making the test fail cleanly).

**Step 2: Run tests to verify they fail**

```bash
pnpm test src/lib/quantityUtils.test.ts
```

Expected: FAIL — `getStockStatus is not exported from './quantityUtils'`

**Step 3: Implement `getStockStatus` in `quantityUtils.ts`**

Add this function anywhere in `src/lib/quantityUtils.ts` (e.g. after `getCurrentQuantity`):

```ts
export function getStockStatus(
  item: Item,
  quantity: number,
): 'error' | 'warning' | 'ok' {
  if (item.refillThreshold > 0 && quantity === item.refillThreshold)
    return 'warning'
  if (quantity < item.refillThreshold) return 'error'
  return 'ok'
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/lib/quantityUtils.test.ts
```

Expected: PASS — all `getStockStatus` tests green

**Step 5: Commit**

```bash
git add src/lib/quantityUtils.ts src/lib/quantityUtils.test.ts
git commit -m "feat(sort): add getStockStatus shared utility"
```

---

### Task 2: Update `ItemCard.tsx` to use `getStockStatus`

**Files:**
- Modify: `src/components/ItemCard.tsx:8,48-53`

**Step 1: Update the import**

In `src/components/ItemCard.tsx`, line 8, add `getStockStatus` to the import:

```ts
import { getCurrentQuantity, getStockStatus, isInactive } from '@/lib/quantityUtils'
```

**Step 2: Replace the inline status block**

Replace lines 48–53 in `src/components/ItemCard.tsx`:

```ts
// Before:
const status =
  item.refillThreshold > 0 && quantity === item.refillThreshold
    ? 'warning'
    : quantity < item.refillThreshold
      ? 'error'
      : 'ok'

// After:
const status = getStockStatus(item, quantity)
```

**Step 3: Run all tests to verify no regression**

```bash
pnpm test
```

Expected: PASS — all existing tests green (no behavior change)

**Step 4: Commit**

```bash
git add src/components/ItemCard.tsx
git commit -m "refactor(item-card): use shared getStockStatus utility"
```

---

### Task 3: Update `sortUtils.ts` stock sort to status-first (TDD)

**Files:**
- Modify: `src/lib/sortUtils.test.ts`
- Modify: `src/lib/sortUtils.ts`

**Step 1: Add failing tests for cross-status sort**

Append a new `describe` block at the bottom of `src/lib/sortUtils.test.ts`.

The `createMockItem` factory is already defined in the `'sortItems - stock by progress'` describe block — copy it or move it to the top-level scope if needed. For simplicity, define a local factory in the new block:

```ts
describe('sortItems - stock by status group', () => {
  const makeItem = (id: string, refillThreshold: number): Item => ({
    id,
    name: `Item ${id}`,
    tagIds: [],
    targetQuantity: 10,
    refillThreshold,
    packedQuantity: 0,
    unpackedQuantity: 0,
    targetUnit: 'package',
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  // Item A: qty=1, threshold=3 → error (10%)
  // Item B: qty=3, threshold=3 → warning (30%)
  // Item C: qty=8, threshold=3 → ok (80%)
  const items = [
    makeItem('A', 3),
    makeItem('B', 3),
    makeItem('C', 3),
  ]
  const quantities = new Map([
    ['A', 1],
    ['B', 3],
    ['C', 8],
  ])

  it('sorts error → warning → ok when ascending', () => {
    const sorted = sortItems(items, quantities, new Map(), new Map(), 'stock', 'asc')
    expect(sorted.map((i) => i.id)).toEqual(['A', 'B', 'C'])
  })

  it('sorts ok → warning → error when descending', () => {
    const sorted = sortItems(items, quantities, new Map(), new Map(), 'stock', 'desc')
    expect(sorted.map((i) => i.id)).toEqual(['C', 'B', 'A'])
  })

  it('sorts by percentage within the same status group', () => {
    // Two error items: D at 20%, E at 10%
    const twoErrors = [makeItem('D', 3), makeItem('E', 3)]
    const twoQtys = new Map([['D', 2], ['E', 1]])
    const sorted = sortItems(twoErrors, twoQtys, new Map(), new Map(), 'stock', 'asc')
    expect(sorted.map((i) => i.id)).toEqual(['E', 'D']) // 10% before 20%
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test src/lib/sortUtils.test.ts
```

Expected: FAIL — cross-status tests fail because current sort ignores status

**Step 3: Update the `'stock'` case in `sortUtils.ts`**

In `src/lib/sortUtils.ts`, add the import at the top:

```ts
import { getStockStatus } from '@/lib/quantityUtils'
```

Then replace the `'stock'` case (lines 22–29):

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

**Step 4: Run all tests to verify they pass**

```bash
pnpm test
```

Expected: PASS — all tests green, including new cross-status and existing percentage tests

**Step 5: Commit**

```bash
git add src/lib/sortUtils.ts src/lib/sortUtils.test.ts
git commit -m "feat(sort): sort by stock status first, then percentage within group"
```

---

### Task 4: Final verification

**Step 1: Run full test suite**

```bash
pnpm test
```

Expected: PASS — all tests green

**Step 2: Start dev server and manually verify**

```bash
pnpm dev
```

Navigate to the pantry page, switch sort to "Stock" ascending. Confirm:
- Red (error) items appear first, sorted lowest % to highest %
- Orange (warning) items appear next
- Green (ok) items appear last, sorted lowest % to highest %
- Switch to descending — order reverses
