# Manual Packing Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable manual control over packing operations by making +/- buttons always operate on unpacked quantities and adding a "Pack unpacked" button.

**Architecture:** Modify existing `addItem()` and `consumeItem()` functions to always work with unpacked quantities. Remove automatic normalization calls. Add new `packUnpacked()` function and UI button for manual packing.

**Tech Stack:** React 19, TypeScript, Vitest, Dexie.js

---

## Task 1: Update addItem() to always add to unpacked

**Files:**
- Modify: `src/lib/quantityUtils.ts:97-116`
- Test: `src/lib/quantityUtils.test.ts`

**Step 1: Write failing test for addItem in package mode**

```ts
it('adds to unpacked in package mode', () => {
  const item: Partial<Item> = {
    packedQuantity: 5,
    unpackedQuantity: 0.5,
    targetUnit: 'package',
    packageUnit: 'bottle',
    consumeAmount: 1,
  }

  addItem(item as Item, 2)

  expect(item.packedQuantity).toBe(5) // Should stay same
  expect(item.unpackedQuantity).toBe(2.5) // Should add to unpacked
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test quantityUtils.test.ts -t "adds to unpacked in package mode"`
Expected: FAIL - packedQuantity is 7, not 5

**Step 3: Update addItem implementation**

In `src/lib/quantityUtils.ts`, replace lines 102-108:

```ts
export function addItem(
  item: Item,
  amount: number,
  purchaseDate: Date = new Date(),
): void {
  // Always add to unpacked (removed mode branching)
  item.unpackedQuantity += amount

  // Recalculate dueDate if quantity was 0 and estimatedDueDays exists
  if (item.estimatedDueDays && !item.dueDate && getCurrentQuantity(item) > 0) {
    const expirationMs =
      purchaseDate.getTime() + item.estimatedDueDays * 86400000
    item.dueDate = new Date(expirationMs)
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test quantityUtils.test.ts -t "adds to unpacked in package mode"`
Expected: PASS

**Step 5: Verify existing measurement mode test still passes**

Run: `pnpm test quantityUtils.test.ts -t "addItem"`
Expected: All addItem tests PASS (measurement mode already added to unpacked)

**Step 6: Commit**

```bash
git add src/lib/quantityUtils.ts src/lib/quantityUtils.test.ts
git commit -m "feat(quantityUtils): make addItem always add to unpacked

- Remove mode branching (measurement vs package)
- Both modes now add to unpackedQuantity
- Part of manual packing control feature

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Update consumeItem() to open full packages

**Files:**
- Modify: `src/lib/quantityUtils.ts:43-95`
- Test: `src/lib/quantityUtils.test.ts`

**Step 1: Write failing test for full package opening**

```ts
it('opens full package when consuming with insufficient unpacked', () => {
  const item: Partial<Item> = {
    packedQuantity: 3,
    unpackedQuantity: 0.2,
    targetUnit: 'measurement',
    measurementUnit: 'L',
    amountPerPackage: 1.0,
    consumeAmount: 0.5,
  }

  consumeItem(item as Item, 0.5)

  // Should open 1 full package (1.0L)
  expect(item.packedQuantity).toBe(2) // One package opened
  expect(item.unpackedQuantity).toBe(0.7) // 0.2 + 1.0 - 0.5 = 0.7
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test quantityUtils.test.ts -t "opens full package"`
Expected: FAIL - unpackedQuantity is 0 (current code opens partial)

**Step 3: Update consumeItem for measurement mode**

In `src/lib/quantityUtils.ts`, replace lines 54-65:

```ts
    } else {
      // Need to open package - open FULL package
      const remaining = amount - item.unpackedQuantity

      if (item.packedQuantity > 0) {
        // Open one full package
        item.packedQuantity -= 1
        item.unpackedQuantity += item.amountPerPackage

        // Now consume the amount
        item.unpackedQuantity =
          Math.round((item.unpackedQuantity - amount) * 1000) / 1000
      } else {
        // No packages left, consume what's available
        item.unpackedQuantity = 0
      }
```

**Step 4: Update consumeItem for package mode**

In `src/lib/quantityUtils.ts`, replace lines 78-87 with simpler logic:

```ts
    } else {
      // Need to open package - open FULL package
      if (item.packedQuantity > 0) {
        // Open one full package (1 unit in package mode)
        item.packedQuantity -= 1
        item.unpackedQuantity += 1

        // Now consume the amount
        item.unpackedQuantity =
          Math.round((item.unpackedQuantity - amount) * 1000) / 1000
      } else {
        // No packages left, consume what's available
        item.unpackedQuantity = 0
      }
```

**Step 5: Run test to verify it passes**

Run: `pnpm test quantityUtils.test.ts -t "opens full package"`
Expected: PASS

**Step 6: Run all consumeItem tests**

Run: `pnpm test quantityUtils.test.ts -t "consumeItem"`
Expected: All PASS (or some may fail - we'll fix in next step)

**Step 7: Commit**

```bash
git add src/lib/quantityUtils.ts src/lib/quantityUtils.test.ts
git commit -m "feat(quantityUtils): make consumeItem open full packages

- When unpacked insufficient, open entire package
- Applies to both measurement and package modes
- Matches physical reality (you open whole package)
- Part of manual packing control feature

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Add packUnpacked() function

**Files:**
- Modify: `src/lib/quantityUtils.ts` (add new function after normalizeUnpacked)
- Test: `src/lib/quantityUtils.test.ts`

**Step 1: Write failing tests for packUnpacked**

```ts
describe('packUnpacked', () => {
  it('packs complete units in package mode', () => {
    const item: Partial<Item> = {
      packedQuantity: 2,
      unpackedQuantity: 3.7,
      targetUnit: 'package',
      packageUnit: 'bottle',
    }

    packUnpacked(item as Item)

    expect(item.packedQuantity).toBe(5) // 2 + floor(3.7) = 5
    expect(item.unpackedQuantity).toBe(0.7) // Remainder
  })

  it('packs complete packages in measurement mode', () => {
    const item: Partial<Item> = {
      packedQuantity: 1,
      unpackedQuantity: 2500,
      targetUnit: 'measurement',
      measurementUnit: 'g',
      amountPerPackage: 1000,
    }

    packUnpacked(item as Item)

    expect(item.packedQuantity).toBe(3) // 1 + floor(2500/1000) = 3
    expect(item.unpackedQuantity).toBe(500) // Remainder
  })

  it('does nothing when insufficient unpacked in package mode', () => {
    const item: Partial<Item> = {
      packedQuantity: 2,
      unpackedQuantity: 0.5,
      targetUnit: 'package',
    }

    packUnpacked(item as Item)

    expect(item.packedQuantity).toBe(2) // No change
    expect(item.unpackedQuantity).toBe(0.5) // No change
  })

  it('does nothing when no amountPerPackage in measurement mode', () => {
    const item: Partial<Item> = {
      packedQuantity: 2,
      unpackedQuantity: 150,
      targetUnit: 'measurement',
      measurementUnit: 'g',
      amountPerPackage: undefined,
    }

    packUnpacked(item as Item)

    expect(item.packedQuantity).toBe(2) // No change
    expect(item.unpackedQuantity).toBe(150) // No change
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test quantityUtils.test.ts -t "packUnpacked"`
Expected: FAIL - packUnpacked is not defined

**Step 3: Implement packUnpacked function**

In `src/lib/quantityUtils.ts`, add after line 41 (after normalizeUnpacked):

```ts
export function packUnpacked(item: Item): void {
  if (
    item.targetUnit === 'measurement' &&
    item.measurementUnit &&
    item.amountPerPackage
  ) {
    // Measurement mode: pack complete packages based on amountPerPackage
    const packages = Math.floor(item.unpackedQuantity / item.amountPerPackage)
    if (packages > 0) {
      item.packedQuantity += packages
      item.unpackedQuantity -= packages * item.amountPerPackage
    }
  } else if (item.targetUnit === 'package') {
    // Package mode: pack complete units (floor of unpacked)
    const packages = Math.floor(item.unpackedQuantity)
    if (packages > 0) {
      item.packedQuantity += packages
      item.unpackedQuantity -= packages
    }
  }
  // If no valid mode or insufficient quantity, do nothing
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test quantityUtils.test.ts -t "packUnpacked"`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/lib/quantityUtils.ts src/lib/quantityUtils.test.ts
git commit -m "feat(quantityUtils): add packUnpacked function

- Packs complete units from unpacked to packed
- Package mode: floor(unpacked) packages
- Measurement mode: floor(unpacked / amountPerPackage) packages
- Leaves remainder in unpacked
- Part of manual packing control feature

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Remove normalizeUnpacked calls from button handlers

**Files:**
- Modify: `src/routes/index.tsx:236-250` (onAdd handler)
- Test: Manual verification (no new tests needed)

**Step 1: Remove normalizeUnpacked call from active items onAdd**

In `src/routes/index.tsx`, find line ~240 and remove the normalizeUnpacked call:

```tsx
onAdd={async () => {
  const updatedItem = { ...item }
  const purchaseDate = new Date()
  addItem(updatedItem, updatedItem.consumeAmount, purchaseDate)
  // REMOVE THIS LINE: normalizeUnpacked(updatedItem)

  await updateItem.mutateAsync({
    id: item.id,
    updates: {
      packedQuantity: updatedItem.packedQuantity,
      unpackedQuantity: updatedItem.unpackedQuantity,
      dueDate: updatedItem.dueDate,
    },
  })
}}
```

**Step 2: Find and remove normalizeUnpacked from inactive items onAdd**

Search for the second occurrence around line ~290 and remove the same line.

**Step 3: Verify normalizeUnpacked is still exported (needed for packUnpacked tests)**

Check `src/lib/quantityUtils.ts` - normalizeUnpacked should still exist, just not called from handlers.

**Step 4: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/routes/index.tsx
git commit -m "feat(pantry): remove automatic normalization from + button

- + button now only adds to unpacked
- No automatic packing after adding
- User controls when to pack via new button (next task)
- Part of manual packing control feature

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Add "Pack unpacked" button to item detail form

**Files:**
- Modify: `src/routes/items/$id/index.tsx:265-309` (add button after unpacked quantity input)
- Test: `src/routes/items/$id.test.tsx`

**Step 1: Write failing test for button visibility**

In `src/routes/items/$id.test.tsx`, add test:

```ts
it('shows pack unpacked button always', async () => {
  const item: Partial<Item> = {
    id: '1',
    name: 'Test Item',
    packedQuantity: 2,
    unpackedQuantity: 0.5,
    targetUnit: 'package',
    packageUnit: 'bottle',
    targetQuantity: 10,
    refillThreshold: 2,
    consumeAmount: 1,
    tagIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  db.items.add(item as Item)

  render(<Route path="/items/$id" component={ItemDetail} />, {
    initialEntries: ['/items/1'],
  })

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /pack unpacked/i })).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test items/\\$id.test.tsx -t "shows pack unpacked button"`
Expected: FAIL - button not found

**Step 3: Add button to form**

In `src/routes/items/$id/index.tsx`, after line 308 (after unpacked quantity field closing div):

```tsx
          </div>
        </div>

        {/* Pack unpacked button */}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="neutral-outline"
            size="sm"
            disabled={
              targetUnit === 'package'
                ? unpackedQuantity < 1
                : targetUnit === 'measurement'
                  ? !amountPerPackage || unpackedQuantity < amountPerPackage
                  : true
            }
            onClick={() => {
              const itemCopy = { ...item }
              itemCopy.packedQuantity = packedQuantity
              itemCopy.unpackedQuantity = unpackedQuantity
              itemCopy.targetUnit = targetUnit
              itemCopy.measurementUnit = measurementUnit || undefined
              itemCopy.amountPerPackage = amountPerPackage
                ? Number(amountPerPackage)
                : undefined

              packUnpacked(itemCopy)

              setPackedQuantity(itemCopy.packedQuantity)
              setUnpackedQuantity(itemCopy.unpackedQuantity)
              setIsDirty(true)
            }}
          >
            Pack unpacked
          </Button>
        </div>
```

**Step 4: Add import for packUnpacked**

At top of file, add to imports from quantityUtils:

```ts
import {
  getCurrentQuantity,
  getDisplayQuantity,
  packUnpacked, // ADD THIS
} from '@/lib/quantityUtils'
```

**Step 5: Run test to verify it passes**

Run: `pnpm test items/\\$id.test.tsx -t "shows pack unpacked button"`
Expected: PASS

**Step 6: Commit**

```bash
git add src/routes/items/\$id/index.tsx src/routes/items/\$id.test.tsx
git commit -m "feat(item-form): add pack unpacked button

- Always visible button below unpacked quantity field
- Disabled when insufficient quantity to pack
- Calls packUnpacked() and updates form state
- Part of manual packing control feature

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Add tests for pack button disabled states

**Files:**
- Test: `src/routes/items/$id.test.tsx`

**Step 1: Write test for disabled in measurement mode without amountPerPackage**

```ts
it('disables pack button when tracking measurement without amountPerPackage', async () => {
  const item: Partial<Item> = {
    id: '1',
    name: 'Test Item',
    packedQuantity: 0,
    unpackedQuantity: 150,
    targetUnit: 'measurement',
    measurementUnit: 'g',
    amountPerPackage: undefined, // No package size
    targetQuantity: 1000,
    refillThreshold: 200,
    consumeAmount: 50,
    tagIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  db.items.add(item as Item)

  render(<Route path="/items/$id" component={ItemDetail} />, {
    initialEntries: ['/items/1'],
  })

  await waitFor(() => {
    const button = screen.getByRole('button', { name: /pack unpacked/i })
    expect(button).toBeDisabled()
  })
})
```

**Step 2: Write test for enabled in package mode with unpacked >= 1**

```ts
it('enables pack button when package mode and unpacked >= 1', async () => {
  const item: Partial<Item> = {
    id: '1',
    name: 'Test Item',
    packedQuantity: 2,
    unpackedQuantity: 1.5,
    targetUnit: 'package',
    packageUnit: 'bottle',
    targetQuantity: 10,
    refillThreshold: 2,
    consumeAmount: 1,
    tagIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  db.items.add(item as Item)

  render(<Route path="/items/$id" component={ItemDetail} />, {
    initialEntries: ['/items/1'],
  })

  await waitFor(() => {
    const button = screen.getByRole('button', { name: /pack unpacked/i })
    expect(button).toBeEnabled()
  })
})
```

**Step 3: Write test for enabled in measurement mode with sufficient unpacked**

```ts
it('enables pack button when measurement mode and unpacked >= amountPerPackage', async () => {
  const item: Partial<Item> = {
    id: '1',
    name: 'Test Item',
    packedQuantity: 1,
    unpackedQuantity: 1500,
    targetUnit: 'measurement',
    measurementUnit: 'g',
    amountPerPackage: 1000,
    targetQuantity: 3000,
    refillThreshold: 500,
    consumeAmount: 100,
    tagIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  db.items.add(item as Item)

  render(<Route path="/items/$id" component={ItemDetail} />, {
    initialEntries: ['/items/1'],
  })

  await waitFor(() => {
    const button = screen.getByRole('button', { name: /pack unpacked/i })
    expect(button).toBeEnabled()
  })
})
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test items/\\$id.test.tsx -t "pack button"`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/routes/items/\$id.test.tsx
git commit -m "test(item-form): add pack button disabled state tests

- Disabled when measurement mode without amountPerPackage
- Enabled when package mode with unpacked >= 1
- Enabled when measurement mode with unpacked >= amountPerPackage
- Part of manual packing control feature

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Add test for pack button functionality

**Files:**
- Test: `src/routes/items/$id.test.tsx`

**Step 1: Write test for pack button click behavior**

```ts
it('packs unpacked quantity when pack button clicked', async () => {
  const item: Partial<Item> = {
    id: '1',
    name: 'Olive Oil',
    packedQuantity: 1,
    unpackedQuantity: 2500,
    targetUnit: 'measurement',
    measurementUnit: 'g',
    amountPerPackage: 1000,
    packageUnit: 'bottle',
    targetQuantity: 5000,
    refillThreshold: 1000,
    consumeAmount: 100,
    tagIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  db.items.add(item as Item)

  render(<Route path="/items/$id" component={ItemDetail} />, {
    initialEntries: ['/items/1'],
  })

  await waitFor(() => {
    expect(screen.getByDisplayValue('1')).toBeInTheDocument() // packedQuantity
    expect(screen.getByDisplayValue('2500')).toBeInTheDocument() // unpackedQuantity
  })

  const button = screen.getByRole('button', { name: /pack unpacked/i })
  fireEvent.click(button)

  // Should pack 2 bottles (2000g) and leave 500g unpacked
  await waitFor(() => {
    expect(screen.getByDisplayValue('3')).toBeInTheDocument() // packedQuantity: 1 + 2 = 3
    expect(screen.getByDisplayValue('500')).toBeInTheDocument() // unpackedQuantity: 2500 - 2000 = 500
  })

  // Button should still be disabled (500 < 1000)
  expect(button).toBeDisabled()
})
```

**Step 2: Run test to verify it passes**

Run: `pnpm test items/\\$id.test.tsx -t "packs unpacked quantity"`
Expected: PASS

**Step 3: Commit**

```bash
git add src/routes/items/\$id.test.tsx
git commit -m "test(item-form): add pack button functionality test

- Verifies button click packs complete units
- Verifies remainder stays in unpacked
- Verifies button becomes disabled after packing
- Part of manual packing control feature

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Add integration test for +/- buttons not normalizing

**Files:**
- Test: `src/routes/index.test.tsx` or `src/components/ItemCard.test.tsx`

**Step 1: Write test for + button not normalizing**

In `src/routes/index.test.tsx` (or create if doesn't exist):

```ts
it('+ button adds to unpacked without normalizing', async () => {
  const item: Partial<Item> = {
    id: '1',
    name: 'Cookies',
    packedQuantity: 2,
    unpackedQuantity: 0,
    targetUnit: 'package',
    packageUnit: 'pack',
    targetQuantity: 10,
    refillThreshold: 2,
    consumeAmount: 1,
    tagIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  db.items.add(item as Item)

  render(<Route path="/" component={Pantry} />)

  const addButton = await screen.findByLabelText('Add Cookies')

  // Click + button twice
  fireEvent.click(addButton)
  fireEvent.click(addButton)

  await waitFor(async () => {
    const updated = await db.items.get('1')
    expect(updated?.packedQuantity).toBe(2) // Should NOT change
    expect(updated?.unpackedQuantity).toBe(2) // Should add 1 + 1 = 2
  })
})
```

**Step 2: Run test to verify it passes**

Run: `pnpm test index.test.tsx -t "+ button adds to unpacked"`
Expected: PASS

**Step 3: Commit**

```bash
git add src/routes/index.test.tsx
git commit -m "test(pantry): verify + button no longer normalizes

- + button adds to unpacked only
- Packed quantity stays unchanged
- Part of manual packing control feature

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Run full test suite and verify

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 2: If any tests fail, fix them**

Common failures:
- Tests expecting old addItem behavior (adding to packed in package mode)
- Tests expecting normalizeUnpacked to be called
- Tests expecting partial package opening

Fix these tests to match new behavior.

**Step 3: Run dev server and manual test**

Run: `pnpm dev`
Manual verification:
1. Open an item in package mode
2. Click + button several times
3. Verify unpacked increases (doesn't auto-pack)
4. Click "Pack unpacked" button
5. Verify complete units pack to packed
6. Test in measurement mode too

**Step 4: Commit any test fixes**

```bash
git add .
git commit -m "test: update tests for manual packing control behavior

- Fix tests expecting old addItem behavior
- Fix tests expecting automatic normalization
- Fix tests expecting partial package opening
- All tests now pass with new manual packing behavior

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Update documentation

**Step 1: Update CLAUDE.md with new behavior**

In CLAUDE.md, find the "Manual Quantity Input" section and add note about packing:

```markdown
### Manual Quantity Input

Users can manually set current inventory quantities in the item detail form:
- **Packed Quantity** - Number of whole packages (always visible)
- **Unpacked Quantity** - Loose amount from opened packages (only for dual-unit items)
- **Pack unpacked button** - Manually converts complete units from unpacked to packed

**+/- Button Behavior (Pantry Page):**
- Both + and - buttons always operate on unpacked quantity
- No automatic normalization/packing
- Use "Pack unpacked" button in item detail form to manually pack complete units
```

**Step 2: Commit documentation update**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document manual packing control feature

- Explain + button always adds to unpacked
- Explain pack unpacked button purpose
- Part of manual packing control feature

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Verification Checklist

After all tasks complete, verify:

- [ ] All tests pass (`pnpm test`)
- [ ] + button adds to unpacked in both package and measurement modes
- [ ] - button consumes from unpacked, opens full packages when needed
- [ ] No automatic normalization after adding
- [ ] "Pack unpacked" button visible in item detail form
- [ ] Pack button disabled when insufficient unpacked
- [ ] Pack button packs complete units correctly
- [ ] Documentation updated in CLAUDE.md
