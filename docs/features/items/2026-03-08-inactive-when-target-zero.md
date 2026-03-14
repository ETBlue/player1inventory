# Inactive When Target Zero — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mark an item as inactive when `targetQuantity === 0`, regardless of `refillThreshold`.

**Architecture:** Change `isInactive()` in `quantityUtils.ts` to drop the `refillThreshold` condition. Update `ItemCard` to prevent the card variant from showing error/warning styling when the item is inactive. Update affected tests.

**Tech Stack:** TypeScript, React, Vitest, React Testing Library

---

### Task 1: Update `isInactive()` tests

**Files:**
- Modify: `src/lib/quantityUtils.test.ts:463-470`

**Step 1: Update the failing test case**

In `quantityUtils.test.ts`, find the block at line 463:

```ts
it('returns false when refillThreshold > 0', () => {
  const item: Partial<Item> = {
    targetQuantity: 0,
    refillThreshold: 1,
  }

  expect(isInactive(item as Item)).toBe(false)
})
```

Replace it with:

```ts
it('returns true when targetQuantity is 0 and refillThreshold > 0', () => {
  const item: Partial<Item> = {
    targetQuantity: 0,
    refillThreshold: 1,
  }

  expect(isInactive(item as Item)).toBe(true)
})
```

**Step 2: Run tests to verify this case now fails**

```bash
pnpm test quantityUtils
```

Expected: FAIL — `isInactive` returns `false` but test expects `true`

---

### Task 2: Update `isInactive()` implementation

**Files:**
- Modify: `src/lib/quantityUtils.ts:155`

**Step 1: Change the condition**

Find line 154–156 in `quantityUtils.ts`:

```ts
export function isInactive(item: Item): boolean {
  return item.targetQuantity === 0 && item.refillThreshold === 0
}
```

Change to:

```ts
export function isInactive(item: Item): boolean {
  return item.targetQuantity === 0
}
```

**Step 2: Run tests to verify they pass**

```bash
pnpm test quantityUtils
```

Expected: all `isInactive` tests PASS

**Step 3: Commit**

```bash
git add src/lib/quantityUtils.ts src/lib/quantityUtils.test.ts
git commit -m "feat(inactive): mark item inactive when targetQuantity is 0 regardless of refillThreshold"
```

---

### Task 3: Add `ItemCard` test for inactive item with `refillThreshold > 0`

**Files:**
- Modify: `src/components/ItemCard.test.tsx:922-947`

**Step 1: Add a new test inside the existing `describe('ItemCard - inactive item progress bar')` block**

After the existing `it(...)` block at line 937–946, add before the closing `})` at line 947:

```ts
it('renders with default (not error/warning) card styling when inactive with refillThreshold > 0', async () => {
  const itemWithThreshold: Item = {
    ...inactiveItem,
    id: 'item-inactive-threshold',
    refillThreshold: 5, // would normally trigger low-stock warning
    packedQuantity: 0,  // below threshold
  }

  const { container } = await renderWithRouter(
    <ItemCard item={itemWithThreshold} tags={[]} tagTypes={[]} />,
  )

  // Card should NOT have error or warning left-bar styling
  const card = container.querySelector('[data-slot="card"]')
  expect(card).not.toHaveClass('border-l-4')
})
```

> **Note on selector:** The `Card` component adds `border-l-4` for non-default variants (ok/warning/error/inactive). Check `src/components/ui/card.tsx` to confirm the exact class used for the error variant's left bar, and adjust the assertion if needed.

**Step 2: Run to verify it fails**

```bash
pnpm test ItemCard
```

Expected: FAIL — card has error/warning left-bar class because `isInactive()` currently does not suppress card variant

Wait — `isInactive()` was already updated in Task 2. Re-run after Task 4 if the test doesn't fail here (the card variant fix hasn't landed yet). If it already passes due to Task 2 cascade, skip to Task 4 and run again after.

---

### Task 4: Fix `ItemCard` card variant for inactive items

**Files:**
- Modify: `src/components/ItemCard.tsx:102`

**Step 1: Check exact class used for card error variant**

Read `src/components/ui/card.tsx` and look for how the `error` variant adds a left indicator. Confirm the class name (likely `border-l-4` or similar). Update the test assertion in Task 3 if needed.

**Step 2: Update the card variant expression**

Find line 102 in `ItemCard.tsx`:

```tsx
variant={status === 'ok' ? 'default' : status}
```

Change to:

```tsx
variant={isInactive(item) || status === 'ok' ? 'default' : status}
```

**Step 3: Run all tests**

```bash
pnpm test
```

Expected: all tests PASS

**Step 4: Commit**

```bash
git add src/components/ItemCard.tsx src/components/ItemCard.test.tsx
git commit -m "fix(inactive): suppress error/warning card styling for inactive items"
```

---

### Task 5: Verify in browser

**Step 1: Start the dev server**

```bash
pnpm dev
```

**Step 2: Manual check**

1. Open any item and set `targetQuantity = 0` but leave `refillThreshold > 0` (e.g. 5)
2. Set `packedQuantity = 0` (below threshold)
3. Navigate to pantry — item should appear in the **inactive** section (faded, no red/orange card bar)
4. Set `targetQuantity = 1` — item should return to active section with proper low-stock styling
