# Item Page Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve item management UX with decimal refill thresholds, correction-mode +/- buttons, always-visible expiration messages, and unified stock sorting.

**Architecture:** Four independent component updates - item form input refinement, item card button handlers simplification, item card display logic enhancement, and sort utility consolidation.

**Tech Stack:** React 19, TypeScript, TanStack Router, Dexie.js, Vitest

---

## Task 1: Update Refill Threshold to Accept Decimals

**Files:**
- Modify: `src/routes/items/$id/index.tsx:443-450`
- Test: `src/routes/items/$id.test.tsx`

**Step 1: Read current implementation**

Read: `src/routes/items/$id/index.tsx` lines 443-450

Current code shows:
```tsx
step={targetUnit === 'package' ? 1 : consumeAmount || 1}
```

**Step 2: Update step attribute**

In `src/routes/items/$id/index.tsx`, change line 447:

```tsx
// Before
step={targetUnit === 'package' ? 1 : consumeAmount || 1}

// After
step={consumeAmount || 1}
```

**Step 3: Verify behavior manually**

Run: `pnpm dev`

Navigate to an item detail page:
1. Check refill threshold input shows step based on consumeAmount
2. Manually type decimal value (e.g., 2.5)
3. Verify value is accepted

**Step 4: Commit**

```bash
git add src/routes/items/$id/index.tsx
git commit -m "feat(items): allow decimal refill threshold values

- Changed step from conditional (1 for packages) to always use consumeAmount
- Users can now set fractional refill thresholds (e.g., 2.5 packs)
- Manual decimal input was already supported, step only affects increment buttons

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Remove Inventory Log Creation from +/- Buttons

**Files:**
- Modify: `src/routes/index.tsx:224-252, 340-368`
- Test: `src/routes/index.test.tsx`

**Step 1: Write failing test**

Add to `src/routes/index.test.tsx`:

```tsx
it('consume button does not create inventory log', async () => {
  const user = userEvent.setup()

  // Given an item with quantity 5
  const item = await createItem({
    name: 'Test Item',
    targetQuantity: 10,
    refillThreshold: 2,
    packedQuantity: 5,
    unpackedQuantity: 0,
    consumeAmount: 1,
    tagIds: [],
  })

  render(<Index />)

  await waitFor(() => {
    expect(screen.getByText('Test Item')).toBeInTheDocument()
  })

  // When user clicks consume button
  const consumeButton = screen.getByLabelText('Consume Test Item')
  await user.click(consumeButton)

  // Then no inventory log is created
  await waitFor(async () => {
    const logs = await db.inventoryLogs.where('itemId').equals(item.id).toArray()
    expect(logs).toHaveLength(0)
  })

  // And item quantity is updated
  const updatedItem = await db.items.get(item.id)
  expect(updatedItem?.packedQuantity).toBe(4)
})

it('add button does not create inventory log', async () => {
  const user = userEvent.setup()

  // Given an item with quantity 5
  const item = await createItem({
    name: 'Test Item',
    targetQuantity: 10,
    refillThreshold: 2,
    packedQuantity: 5,
    unpackedQuantity: 0,
    consumeAmount: 1,
    tagIds: [],
  })

  render(<Index />)

  await waitFor(() => {
    expect(screen.getByText('Test Item')).toBeInTheDocument()
  })

  // When user clicks add button
  const addButton = screen.getByLabelText('Add Test Item')
  await user.click(addButton)

  // Then no inventory log is created
  await waitFor(async () => {
    const logs = await db.inventoryLogs.where('itemId').equals(item.id).toArray()
    expect(logs).toHaveLength(0)
  })

  // And item quantity is updated
  const updatedItem = await db.items.get(item.id)
  expect(updatedItem?.packedQuantity).toBe(6)
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/routes/index.test.tsx -t "does not create inventory log"`

Expected: FAIL - tests expect 0 logs but currently logs are created

**Step 3: Update onConsume handler (Active List)**

In `src/routes/index.tsx`, find the onConsume handler around line 224 (in the active items list).

Replace the handler:

```tsx
onConsume={async () => {
  const updatedItem = { ...item }
  consumeItem(updatedItem, updatedItem.consumeAmount)

  await db.items.update(item.id, {
    packedQuantity: updatedItem.packedQuantity,
    unpackedQuantity: updatedItem.unpackedQuantity,
  })
}}
```

Remove the entire `db.inventoryLogs.add()` block.

**Step 4: Update onAdd handler (Active List)**

In the same section, find the onAdd handler around line 253.

Replace the handler:

```tsx
onAdd={async () => {
  const updatedItem = { ...item }
  const purchaseDate = new Date()
  addItem(updatedItem, updatedItem.consumeAmount, purchaseDate)
  normalizeUnpacked(updatedItem)

  await db.items.update(item.id, {
    packedQuantity: updatedItem.packedQuantity,
    unpackedQuantity: updatedItem.unpackedQuantity,
    dueDate: updatedItem.dueDate,
  })
}}
```

Remove the entire `db.inventoryLogs.add()` block.

**Step 5: Update onConsume handler (Inactive List)**

Find the second onConsume handler around line 311 (in the inactive items list).

Apply the same change:

```tsx
onConsume={async () => {
  const updatedItem = { ...item }
  consumeItem(updatedItem, updatedItem.consumeAmount)

  await db.items.update(item.id, {
    packedQuantity: updatedItem.packedQuantity,
    unpackedQuantity: updatedItem.unpackedQuantity,
  })
}}
```

**Step 6: Update onAdd handler (Inactive List)**

Find the second onAdd handler around line 340.

Apply the same change:

```tsx
onAdd={async () => {
  const updatedItem = { ...item }
  const purchaseDate = new Date()
  addItem(updatedItem, updatedItem.consumeAmount, purchaseDate)
  normalizeUnpacked(updatedItem)

  await db.items.update(item.id, {
    packedQuantity: updatedItem.packedQuantity,
    unpackedQuantity: updatedItem.unpackedQuantity,
    dueDate: updatedItem.dueDate,
  })
}}
```

**Step 7: Run tests to verify they pass**

Run: `pnpm test -- src/routes/index.test.tsx -t "does not create inventory log"`

Expected: PASS - both tests pass

**Step 8: Run all tests**

Run: `pnpm test`

Expected: All tests pass

**Step 9: Commit**

```bash
git add src/routes/index.tsx src/routes/index.test.tsx
git commit -m "feat(items): +/- buttons now corrections, not logged changes

- Removed inventory log creation from onConsume and onAdd handlers
- +/- buttons now just update item quantities directly
- Corrections don't pollute inventory history
- Added tests to verify no logs created

Breaking change: +/- button clicks no longer create inventory logs.
Use item form quantity fields for tracked changes.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Always Show Expiration Message with Conditional Styling

**Files:**
- Modify: `src/components/ItemCard.tsx:102-125`
- Test: `src/components/ItemCard.test.tsx`

**Step 1: Write failing test**

Add to `src/components/ItemCard.test.tsx`:

```tsx
it('shows expiration message even when not within threshold', () => {
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  const item: Partial<Item> = {
    id: '1',
    name: 'Test Item',
    targetQuantity: 10,
    refillThreshold: 2,
    packedQuantity: 5,
    unpackedQuantity: 0,
    consumeAmount: 1,
    targetUnit: 'package',
    expirationThreshold: 7, // Warn when < 7 days
    estimatedDueDays: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
    tagIds: [],
  }

  render(
    <ItemCard
      item={item as Item}
      quantity={5}
      tags={[]}
      tagTypes={[]}
      estimatedDueDate={futureDate}
      onConsume={() => {}}
      onAdd={() => {}}
    />
  )

  // Message should show even though 30 days > 7 day threshold
  expect(screen.getByText(/Expires in 30 days/i)).toBeInTheDocument()

  // Should be muted style (not error background)
  const messageEl = screen.getByText(/Expires in 30 days/i)
  expect(messageEl).toHaveClass('text-foreground-muted')
  expect(messageEl).not.toHaveClass('bg-status-error')
})

it('shows warning style when within expiration threshold', () => {
  const soonDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days
  const item: Partial<Item> = {
    id: '1',
    name: 'Test Item',
    targetQuantity: 10,
    refillThreshold: 2,
    packedQuantity: 5,
    unpackedQuantity: 0,
    consumeAmount: 1,
    targetUnit: 'package',
    expirationThreshold: 7, // Warn when < 7 days
    estimatedDueDays: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    tagIds: [],
  }

  render(
    <ItemCard
      item={item as Item}
      quantity={5}
      tags={[]}
      tagTypes={[]}
      estimatedDueDate={soonDate}
      onConsume={() => {}}
      onAdd={() => {}}
    />
  )

  const messageEl = screen.getByText(/Expires in 3 days/i)

  // Should have warning style
  expect(messageEl).toHaveClass('bg-status-error')
  expect(messageEl).toHaveClass('text-tint')

  // Should show warning icon
  expect(screen.getByTestId('warning-icon')).toBeInTheDocument() // Need to add test id
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/ItemCard.test.tsx -t "expiration"`

Expected: FAIL - message doesn't show when not within threshold

**Step 3: Update expiration message rendering**

In `src/components/ItemCard.tsx`, find the expiration message block around line 102.

Replace it with:

```tsx
{currentQuantity > 0 &&
  estimatedDueDate &&
  (() => {
    const daysUntilExpiration = Math.ceil(
      (estimatedDueDate.getTime() - Date.now()) / 86400000,
    )
    const threshold =
      item.expirationThreshold ?? Number.POSITIVE_INFINITY
    const isWarning = daysUntilExpiration <= threshold

    return (
      <span
        className={cn(
          'inline-flex gap-1 px-2 py-1 text-xs',
          isWarning
            ? 'bg-status-error text-tint'
            : 'text-foreground-muted',
        )}
      >
        {isWarning && <TriangleAlert className="w-4 h-4" />}
        {item.estimatedDueDays
          ? // Relative mode: show "Expires in X days"
            daysUntilExpiration >= 0
            ? `Expires in ${daysUntilExpiration} days`
            : `Expired ${Math.abs(daysUntilExpiration)} days ago`
          : // Explicit mode: show "Expires on YYYY-MM-DD"
            `Expires on ${estimatedDueDate.toISOString().split('T')[0]}`}
      </span>
    )
  })()}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/components/ItemCard.test.tsx -t "expiration"`

Expected: PASS

**Step 5: Run all tests**

Run: `pnpm test`

Expected: All tests pass

**Step 6: Commit**

```bash
git add src/components/ItemCard.tsx src/components/ItemCard.test.tsx
git commit -m "feat(items): always show expiration message with conditional styling

- Expiration message now always visible when estimatedDueDate exists
- Within threshold: red background + warning icon
- Outside threshold: muted text, no background, no icon
- Improves awareness of expiration dates

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Update Stock Sort to Use Progress Percentage

**Files:**
- Modify: `src/lib/sortUtils.ts:3, 38-48`
- Test: `src/lib/sortUtils.test.ts`

**Step 1: Write failing tests**

Add to `src/lib/sortUtils.test.ts`:

```tsx
describe('sortItems - stock by progress', () => {
  it('sorts by progress percentage ascending', () => {
    const items: Item[] = [
      createMockItem('1', 'Item A', { targetQuantity: 10 }), // 5/10 = 50%
      createMockItem('2', 'Item B', { targetQuantity: 5 }),  // 2/5 = 40%
      createMockItem('3', 'Item C', { targetQuantity: 10 }), // 8/10 = 80%
    ]
    const quantities = new Map([
      ['1', 5],
      ['2', 2],
      ['3', 8],
    ])

    const sorted = sortItems(items, quantities, new Map(), 'stock', 'asc')

    // Should sort by percentage: 40%, 50%, 80%
    expect(sorted[0].id).toBe('2') // 40%
    expect(sorted[1].id).toBe('1') // 50%
    expect(sorted[2].id).toBe('3') // 80%
  })

  it('sorts by progress percentage descending', () => {
    const items: Item[] = [
      createMockItem('1', 'Item A', { targetQuantity: 10 }), // 5/10 = 50%
      createMockItem('2', 'Item B', { targetQuantity: 5 }),  // 2/5 = 40%
      createMockItem('3', 'Item C', { targetQuantity: 10 }), // 8/10 = 80%
    ]
    const quantities = new Map([
      ['1', 5],
      ['2', 2],
      ['3', 8],
    ])

    const sorted = sortItems(items, quantities, new Map(), 'stock', 'desc')

    // Should sort by percentage: 80%, 50%, 40%
    expect(sorted[0].id).toBe('3') // 80%
    expect(sorted[1].id).toBe('1') // 50%
    expect(sorted[2].id).toBe('2') // 40%
  })

  it('handles zero targetQuantity gracefully', () => {
    const items: Item[] = [
      createMockItem('1', 'Item A', { targetQuantity: 0 }),  // 5/0 = Infinity
      createMockItem('2', 'Item B', { targetQuantity: 10 }), // 5/10 = 50%
    ]
    const quantities = new Map([
      ['1', 5],
      ['2', 5],
    ])

    const sorted = sortItems(items, quantities, new Map(), 'stock', 'asc')

    // Items with 0 target should sort as if 100% full
    expect(sorted[0].id).toBe('2') // 50%
    expect(sorted[1].id).toBe('1') // Infinity
  })
})

// Remove old 'quantity' sort tests since that option is being removed
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/sortUtils.test.ts -t "stock by progress"`

Expected: FAIL - tests fail because 'stock' still sorts by status

**Step 3: Update SortField type**

In `src/lib/sortUtils.ts`, line 3:

```tsx
// Before
export type SortField = 'name' | 'quantity' | 'stock' | 'updatedAt' | 'expiring'

// After
export type SortField = 'name' | 'stock' | 'updatedAt' | 'expiring'
```

**Step 4: Update stock sort logic**

In `src/lib/sortUtils.ts`, replace the 'stock' case (around lines 38-48):

```tsx
case 'stock': {
  // Sort by progress percentage (current/target)
  const qtyA = quantities.get(a.id) ?? 0
  const qtyB = quantities.get(b.id) ?? 0
  const progressA = a.targetQuantity > 0 ? qtyA / a.targetQuantity : 1
  const progressB = b.targetQuantity > 0 ? qtyB / b.targetQuantity : 1
  comparison = progressA - progressB
  break
}
```

Remove the old 'quantity' case entirely.

**Step 5: Run tests to verify they pass**

Run: `pnpm test -- src/lib/sortUtils.test.ts -t "stock by progress"`

Expected: PASS

**Step 6: Run all sort tests**

Run: `pnpm test -- src/lib/sortUtils.test.ts`

Expected: All pass (remove/update any tests that reference 'quantity' sort)

**Step 7: Update UI components**

Check if PantryToolbar or other components reference 'quantity' sort option.

Search: `grep -r "quantity.*sort\|SortField" src/components/`

Update any UI that shows 'quantity' as a sort option to remove it.

**Step 8: Run all tests**

Run: `pnpm test`

Expected: All tests pass

**Step 9: Commit**

```bash
git add src/lib/sortUtils.ts src/lib/sortUtils.test.ts
git commit -m "feat(sort): merge stock and quantity into progress-based sort

- Removed 'quantity' from SortField type
- Changed 'stock' sort to use progress percentage (current/target)
- Lower percentage sorts first (ascending) - items needing attention
- Higher percentage sorts first (descending) - well-stocked items
- Added tests for progress-based sorting

Breaking change: 'quantity' sort option removed. Users with this
preference will fall back to default sort.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Verify Manual Testing and Update Documentation

**Files:**
- Test: Manual verification
- Modify: `CLAUDE.md` (if needed)

**Step 1: Manual smoke test**

Run: `pnpm dev`

Test each change:

1. **Refill threshold decimals:**
   - Go to item detail page
   - Change refill threshold to 2.5
   - Save and verify

2. **+/- buttons:**
   - Use +/- buttons on item card
   - Check inventory history (logs page)
   - Verify no new logs created

3. **Expiration messages:**
   - Find item with future expiration (30+ days)
   - Verify message shows in muted style
   - Find item expiring soon
   - Verify message shows in warning style

4. **Stock sort:**
   - Use sort dropdown
   - Verify 'quantity' option is gone
   - Select 'stock' and verify it sorts by progress percentage
   - Toggle between asc/desc

Expected: All features work as designed

**Step 2: Run all tests one final time**

Run: `pnpm test`

Expected: All 204+ tests pass

**Step 3: Check if CLAUDE.md needs updates**

Read: `CLAUDE.md`

If there are references to:
- +/- buttons creating logs
- Stock sorting by status
- Quantity sorting

Update those sections to reflect new behavior.

**Step 4: Commit documentation if changed**

```bash
git add CLAUDE.md
git commit -m "docs(claude): update for item page polish changes

- +/- buttons now corrections (no logging)
- Stock sort now by progress percentage
- Expiration messages always visible

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Step 5: Final verification**

Run: `pnpm build`

Expected: Build succeeds with no errors

---

## Summary

This plan implements four UX improvements:

1. ✅ Refill threshold accepts decimals (step uses consumeAmount)
2. ✅ +/- buttons are corrections (no inventory logs)
3. ✅ Expiration messages always show (conditional styling)
4. ✅ Stock sort unified to progress percentage

All changes follow TDD principles with tests before implementation, frequent commits, and comprehensive verification.
