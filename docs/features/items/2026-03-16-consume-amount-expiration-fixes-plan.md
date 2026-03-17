# Consume Amount & Expiration Fixes — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix floating-point quantity drift, persist expiration mode on item creation, validate consume amount > 0, and auto-adjust recipe amounts when consume amount changes.

**Architecture:** All changes are isolated to the item form component, quantityUtils library, and item detail route. The recipe adjustment uses an AlertDialog gate before `updateItem.mutateAsync`. No new hooks, no schema changes.

**Tech Stack:** React 19, TypeScript, Vitest + React Testing Library, Dexie.js, TanStack Router

**PR Split:** This plan produces two PRs:
- **PR 1** — Tasks 1–3 (bug fixes: floating-point + expiration field split)
- **PR 2** — Tasks 4–5 (improvements: consumeAmount validation + recipe adjustment dialog)

After completing Task 3, open PR 1 from the current branch targeting `main`. After it merges, rebase and continue with Tasks 4–5 for PR 2. If branching is preferred, Tasks 4–5 can be done on a separate branch after PR 1 merges.

---

## Chunk 1: Bug Fixes (PR 1)

### Task 1: `roundToStep` utility and fix `addItem` / `consumeItem`

**Files:**
- Modify: `apps/web/src/lib/quantityUtils.ts`
- Modify: `apps/web/src/lib/quantityUtils.test.ts`

- [ ] **Step 1: Write failing tests for `roundToStep`**

Add to `apps/web/src/lib/quantityUtils.test.ts`:

```ts
import {
  addItem,
  consumeItem,
  getCurrentQuantity,
  getStockStatus,
  isInactive,
  normalizeUnpacked,
  packUnpacked,
  roundToStep,  // will fail until exported
} from './quantityUtils'

describe('roundToStep', () => {
  it('rounds to integer when step is whole number', () => {
    expect(roundToStep(3.0000000000000004, 1)).toBe(3)
  })

  it('rounds to 1 decimal place when step is 0.1', () => {
    expect(roundToStep(0.30000000000000004, 0.1)).toBe(0.3)
  })

  it('rounds to 2 decimal places when step is 0.01', () => {
    expect(roundToStep(0.010000000000000002, 0.01)).toBe(0.01)
  })

  it('handles step with trailing zeros (e.g. 0.10)', () => {
    expect(roundToStep(0.30000000000000004, 0.10)).toBe(0.3)
  })
})

describe('addItem float precision', () => {
  it('user can add 0.1 three times without float drift', () => {
    // Given item with consumeAmount 0.1 and unpackedQuantity 0
    const item: Partial<Item> = {
      targetUnit: 'package',
      packedQuantity: 5,
      unpackedQuantity: 0,
      consumeAmount: 0.1,
    }

    // When adding 0.1 three times
    addItem(item as Item, 0.1)
    addItem(item as Item, 0.1)
    addItem(item as Item, 0.1)

    // Then unpackedQuantity is exactly 0.3 (not 0.30000000000000004)
    expect(item.unpackedQuantity).toBe(0.3)
  })
})

describe('consumeItem float precision', () => {
  it('user can consume 0.1 without float drift', () => {
    // Given item with consumeAmount 0.1 and unpackedQuantity 0.5
    const item: Partial<Item> = {
      targetUnit: 'package',
      packedQuantity: 0,
      unpackedQuantity: 0.5,
      consumeAmount: 0.1,
    }

    // When consuming 0.1
    consumeItem(item as Item, 0.1)

    // Then unpackedQuantity is exactly 0.4 (not 0.4000000000000001)
    expect(item.unpackedQuantity).toBe(0.4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
(cd apps/web && pnpm test --run quantityUtils)
```

Expected: FAIL — `roundToStep` not found

- [ ] **Step 3: Add `roundToStep` to `quantityUtils.ts`**

Add at the top of `apps/web/src/lib/quantityUtils.ts`, before `getCurrentQuantity`:

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

- [ ] **Step 4: Fix `addItem` — replace raw addition with `roundToStep`**

In `apps/web/src/lib/quantityUtils.ts`, `addItem` function (line 144):

```ts
// Before:
item.unpackedQuantity += amount

// After:
item.unpackedQuantity = roundToStep(item.unpackedQuantity + amount, item.consumeAmount)
```

- [ ] **Step 5: Fix `consumeItem` — replace `Math.round(... * 1000) / 1000` with `roundToStep`**

There are four occurrences of `Math.round(... * 1000) / 1000` in `consumeItem`. Replace each:

```ts
// Line 82 — measurement mode, simple subtract:
// Before:
item.unpackedQuantity = Math.round((item.unpackedQuantity - amount) * 1000) / 1000
// After:
item.unpackedQuantity = roundToStep(item.unpackedQuantity - amount, item.consumeAmount)

// Lines 93–95 — measurement mode, open packages, leftover:
// Before:
item.unpackedQuantity = Math.round((packagesToOpen * item.amountPerPackage - remaining) * 1000) / 1000
// After:
item.unpackedQuantity = roundToStep(packagesToOpen * item.amountPerPackage - remaining, item.consumeAmount)

// Line 107 — package mode, simple subtract:
// Before:
item.unpackedQuantity = Math.round((item.unpackedQuantity - amount) * 1000) / 1000
// After:
item.unpackedQuantity = roundToStep(item.unpackedQuantity - amount, item.consumeAmount)

// Lines 117–119 — package mode, open packages, leftover:
// Before:
item.unpackedQuantity = Math.round((item.unpackedQuantity + packagesToOpen - amount) * 1000) / 1000
// After:
item.unpackedQuantity = roundToStep(item.unpackedQuantity + packagesToOpen - amount, item.consumeAmount)
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
(cd apps/web && pnpm test --run quantityUtils)
```

Expected: all quantityUtils tests pass

- [ ] **Step 7: Run full test suite and quality gate**

```bash
(cd apps/web && pnpm test --run)
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports" || echo "OK"
```

Expected: all tests pass, build clean

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/quantityUtils.ts apps/web/src/lib/quantityUtils.test.ts
git commit -m "fix(quantityUtils): add roundToStep and fix float drift in addItem/consumeItem"
```

---

### Task 2: Apply `roundToStep` in cooking page, ItemForm, and recipe items page

**Files:**
- Modify: `apps/web/src/routes/cooking.tsx`
- Modify: `apps/web/src/components/item/ItemForm/index.tsx`
- Modify: `apps/web/src/routes/settings/recipes/$id/items.tsx`
- Modify: `apps/web/src/routes/cooking.test.tsx`
- Modify: `apps/web/src/routes/settings/recipes/$id/items.test.tsx`

- [ ] **Step 1: Write failing test for cooking page ± float precision**

Add to `apps/web/src/routes/cooking.test.tsx`, inside the `describe('Use (Cooking) Page')` block:

```ts
it('user can adjust ingredient amount without float drift when consumeAmount is 0.1', async () => {
  const user = userEvent.setup()

  // Given an item with consumeAmount 0.1 linked to a recipe
  const item = await makeItem('oil', 0.1)
  const recipe = await createRecipe({ name: 'Salad', items: [{ itemId: item.id, defaultAmount: 0.1 }] })

  renderPage()

  // When the recipe is expanded and checked
  await waitFor(() => screen.getByText('Salad'))
  await user.click(screen.getByRole('checkbox', { name: 'Salad' }))

  // Then the initial amount shows as 0.1
  const plusButton = screen.getByRole('button', { name: /increase oil/i })
  expect(screen.getByText('0.1')).toBeInTheDocument()

  // When clicking + twice (0.1 → 0.2 → 0.3)
  await user.click(plusButton)
  await user.click(plusButton)

  // Then the amount is exactly 0.3 (no float drift)
  expect(screen.getByText('0.3')).toBeInTheDocument()
  expect(screen.queryByText('0.30000000000000004')).not.toBeInTheDocument()
})
```

Note: Check the aria-label of the +/- buttons in `cooking.tsx` before writing this test — use `screen.debug()` or inspect the source if the label differs.

- [ ] **Step 2: Write failing test for recipe items page ± float precision**

Add to `apps/web/src/routes/settings/recipes/$id/items.test.tsx`, inside the `describe` block:

```ts
it('user can adjust default amount without float drift when consumeAmount is 0.1', async () => {
  const user = userEvent.setup()

  // Given an item with consumeAmount 0.1 linked to a recipe with defaultAmount 0.1
  const item = await createItem({
    name: 'Oil',
    targetUnit: 'package',
    targetQuantity: 1,
    refillThreshold: 0,
    packedQuantity: 5,
    unpackedQuantity: 0,
    consumeAmount: 0.1,
    tagIds: [],
  })
  const recipe = await createRecipe({ name: 'Salad', items: [{ itemId: item.id, defaultAmount: 0.1 }] })

  renderItemsTab(recipe.id)

  // When clicking + twice (0.1 → 0.2 → 0.3)
  await waitFor(() => screen.getByText('Oil'))
  const plusButton = screen.getByRole('button', { name: /increase/i })
  await user.click(plusButton)
  await user.click(plusButton)

  // Then the displayed amount is 0.3 (no float drift)
  await waitFor(() => {
    expect(screen.getByText('0.3')).toBeInTheDocument()
    expect(screen.queryByText('0.30000000000000004')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
(cd apps/web && pnpm test --run cooking.test)
(cd apps/web && pnpm test --run "recipes/\$id/items.test")
```

Expected: the new tests fail (float drift produces wrong value)

- [ ] **Step 4: Fix `cooking.tsx` — apply `roundToStep` in `handleAdjustAmount`**

In `apps/web/src/routes/cooking.tsx`:

Add `roundToStep` to the import (line 29):
```ts
// Before:
import { consumeItem, getCurrentQuantity } from '@/lib/quantityUtils'
// After:
import { consumeItem, getCurrentQuantity, roundToStep } from '@/lib/quantityUtils'
```

In `handleAdjustAmount` (line 247):
```ts
// Before:
const next = Math.max(0, current + delta * step)
// After:
const next = roundToStep(Math.max(0, current + delta * step), step)
```

- [ ] **Step 5: Fix `ItemForm/index.tsx` — apply `roundToStep` to unpacked onChange**

In `apps/web/src/components/item/ItemForm/index.tsx`:

Add import at top:
```ts
import { roundToStep } from '@/lib/quantityUtils'
```

In the unpacked quantity input onChange (line 271):
```ts
// Before:
onChange={(e) => setUnpackedQuantity(Number(e.target.value))}
// After:
onChange={(e) => setUnpackedQuantity(roundToStep(Number(e.target.value), consumeAmount || 1))}
```

- [ ] **Step 6: Fix `recipes/$id/items.tsx` — apply `roundToStep` in `handleAdjustDefaultAmount`**

In `apps/web/src/routes/settings/recipes/$id/items.tsx`:

Add `roundToStep` to the import (line 17):
```ts
// Before:
import { isInactive } from '@/lib/quantityUtils'
// After:
import { isInactive, roundToStep } from '@/lib/quantityUtils'
```

In `handleAdjustDefaultAmount` (line 263):
```ts
// Before:
const next = Math.max(0, current + delta * step)
// After:
const next = roundToStep(Math.max(0, current + delta * step), step)
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
(cd apps/web && pnpm test --run)
```

Expected: all tests pass

- [ ] **Step 8: Quality gate**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/routes/cooking.tsx \
        apps/web/src/components/item/ItemForm/index.tsx \
        apps/web/src/routes/settings/recipes/\$id/items.tsx \
        apps/web/src/routes/cooking.test.tsx \
        apps/web/src/routes/settings/recipes/\$id/items.test.tsx
git commit -m "fix(items): apply roundToStep to cooking, ItemForm, and recipe items ± buttons"
```

---

### Task 3: Split expiration fields — move "Expires in (days)" to item info section

**Files:**
- Modify: `apps/web/src/components/item/ItemForm/index.tsx`
- Modify: `apps/web/src/routes/items/new.tsx`
- Modify: `apps/web/src/routes/items/new.test.tsx`
- Modify: `apps/web/src/routes/items/$id.test.tsx`

- [ ] **Step 1: Write failing test — expiration mode persists on new item creation**

Add to `apps/web/src/routes/items/new.test.tsx`:

```ts
it('user can create item with days-from-purchase expiration and it persists', async () => {
  const user = userEvent.setup()

  // Given the new item page
  renderNewItemPage()
  await waitFor(() => screen.getByLabelText(/name/i))

  // When user fills in the name
  await user.type(screen.getByLabelText(/name/i), 'Milk')

  // And selects "Days from Purchase" expiration mode
  await user.click(screen.getByRole('combobox', { name: /calculate expiration/i }))
  await user.click(screen.getByRole('option', { name: /days from purchase/i }))

  // And enters 30 days (the input now appears in the info section)
  await waitFor(() => screen.getByLabelText(/expires in/i))
  await user.clear(screen.getByLabelText(/expires in/i))
  await user.type(screen.getByLabelText(/expires in/i), '30')

  // And submits
  await user.click(screen.getByRole('button', { name: /save/i }))

  // Then the item is saved with estimatedDueDays = 30
  await waitFor(async () => {
    const items = await db.items.toArray()
    expect(items).toHaveLength(1)
    expect(items[0].estimatedDueDays).toBe(30)
  })
})
```

- [ ] **Step 2: Write failing test — "Expires on" is hidden in stock section when mode is "days"**

Add a new `describe` block at the end of `apps/web/src/routes/items/$id.test.tsx`. The existing helper is named `renderItemDetailPage` and is defined inside the first `describe` block — replicate it in the new block:

```ts
describe('Item detail page - expiration field split', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemDetailPage = (itemId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  it('user sees "Expires in" in info section when expiration mode is days-from-purchase', async () => {
    // Given an item with estimatedDueDays set (days mode)
    const item = await createItem({
      name: 'Milk',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      estimatedDueDays: 30,
    })

    renderItemDetailPage(item.id)

    await waitFor(() => screen.getByText('Milk'))

    // Then "Expires in (days)" is visible
    expect(screen.getByLabelText(/expires in/i)).toBeInTheDocument()

    // And "Expires on" date input is NOT visible in stock section
    expect(screen.queryByLabelText(/expires on/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
(cd apps/web && pnpm test --run "items/new.test|items/\$id.test")
```

Expected: new tests fail

- [ ] **Step 4: Restructure `ItemForm` — stock section shows date only when mode = 'date'**

In `apps/web/src/components/item/ItemForm/index.tsx`, find the stock section's expiration block (lines 316–346). Replace the entire block:

```tsx
// Before (lines 316–346):
<div className="grid grid-cols-2 gap-4">
  <div>
    <Label htmlFor="expirationValue">
      {expirationMode === 'date' ? (
        'Expires on'
      ) : (
        <>
          Expires in{' '}
          <span className="text-xs font-normal">(days)</span>
        </>
      )}
    </Label>
    {expirationMode === 'date' ? (
      <Input
        id="expirationValue"
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
      />
    ) : (
      <Input
        id="expirationValue"
        type="number"
        min={1}
        value={estimatedDueDays}
        onChange={(e) => setEstimatedDueDays(e.target.value)}
      />
    )}
  </div>
</div>

// After:
{expirationMode === 'date' && (
  <div className="grid grid-cols-2 gap-4">
    <div>
      <Label htmlFor="expirationDueDate">Expires on</Label>
      <Input
        id="expirationDueDate"
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
      />
    </div>
  </div>
)}
```

- [ ] **Step 5: Add "Expires in (days)" to info section**

In `apps/web/src/components/item/ItemForm/index.tsx`, find the info section after the `expirationMode` Select block (after line 484). Add immediately after the closing `</div>` of the mode selector:

```tsx
{expirationMode === 'days' && (
  <div className="grid grid-cols-2 gap-4">
    <div>
      <Label htmlFor="expirationDueDays">
        Expires in{' '}
        <span className="text-xs font-normal">(days)</span>
      </Label>
      <Input
        id="expirationDueDays"
        type="number"
        min={1}
        value={estimatedDueDays}
        onChange={(e) => setEstimatedDueDays(e.target.value)}
      />
    </div>
  </div>
)}
```

- [ ] **Step 6: Fix `buildCreateData` in `new.tsx` — save `estimatedDueDays`**

In `apps/web/src/routes/items/new.tsx`, in `buildCreateData`, add after the `expirationThreshold` spread:

```ts
// Add this:
...(values.expirationMode === 'days' && values.estimatedDueDays
  ? { estimatedDueDays: Number(values.estimatedDueDays) }
  : {}),
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
(cd apps/web && pnpm test --run "items/new.test|items/\$id.test")
```

Expected: all tests pass

- [ ] **Step 8: Full quality gate**

```bash
(cd apps/web && pnpm test --run)
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/item/ItemForm/index.tsx \
        apps/web/src/routes/items/new.tsx \
        apps/web/src/routes/items/new.test.tsx \
        apps/web/src/routes/items/\$id.test.tsx
git commit -m "fix(items): split expiration fields — move 'expires in days' to item info section"
```

---

**→ At this point, open PR 1** targeting `main` with the three bug fix commits.

---

## Chunk 2: Improvements (PR 2)

### Task 4: `consumeAmount` > 0 validation

**Files:**
- Modify: `apps/web/src/components/item/ItemForm/index.tsx`
- Modify: `apps/web/src/routes/items/new.test.tsx`

- [ ] **Step 1: Write failing test — submit is blocked when consumeAmount is 0**

Add to `apps/web/src/routes/items/new.test.tsx`:

```ts
it('user cannot save item when consumeAmount is 0', async () => {
  const user = userEvent.setup()

  // Given the new item page
  renderNewItemPage()
  await waitFor(() => screen.getByLabelText(/name/i))

  // When user fills in the name but leaves consumeAmount at 0
  await user.type(screen.getByLabelText(/name/i), 'Milk')
  const consumeInput = screen.getByLabelText(/amount per consume/i) as HTMLInputElement
  await user.clear(consumeInput)
  await user.type(consumeInput, '0')

  // Then the save button is disabled
  expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
})

it('user can save item when consumeAmount is 0.01', async () => {
  const user = userEvent.setup()

  // Given the new item page
  renderNewItemPage()
  await waitFor(() => screen.getByLabelText(/name/i))

  // When user fills in name and sets consumeAmount to 0.01
  await user.type(screen.getByLabelText(/name/i), 'Salt')
  const consumeInput = screen.getByLabelText(/amount per consume/i) as HTMLInputElement
  await user.clear(consumeInput)
  await user.type(consumeInput, '0.01')

  // Then the save button is enabled
  expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
(cd apps/web && pnpm test --run "items/new.test")
```

Expected: fail — save is not disabled when consumeAmount is 0

- [ ] **Step 3: Update `ItemForm` — change default, min, and validation**

In `apps/web/src/components/item/ItemForm/index.tsx`:

**a) Change default value** (line 45):
```ts
// Before:
consumeAmount: 0,
// After:
consumeAmount: 1,
```

**b) Change input `min`** (line 445):
```tsx
// Before:
min={0}
// After:
min={0.01}
```

**c) Update description text** (line 451):
```tsx
// Before:
Amount added/removed per +/- button click
// After:
Amount added/removed per +/- button click. Must be greater than 0.
```

**d) Add consumeAmount to `isSubmitDisabled`** (line 210):
```ts
// Before:
const isSubmitDisabled =
  isValidationFailed || (onDirtyChange !== undefined && !isDirty)
// After:
const isSubmitDisabled =
  isValidationFailed ||
  consumeAmount <= 0 ||
  (onDirtyChange !== undefined && !isDirty)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
(cd apps/web && pnpm test --run "items/new.test")
```

Expected: new tests pass

- [ ] **Step 5: Full quality gate**

```bash
(cd apps/web && pnpm test --run)
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/item/ItemForm/index.tsx \
        apps/web/src/routes/items/new.test.tsx
git commit -m "feat(items): validate consumeAmount must be greater than 0"
```

---

### Task 5: Recipe adjustment confirm dialog when `consumeAmount` changes

**Files:**
- Modify: `apps/web/src/routes/items/$id/index.tsx`
- Modify: `apps/web/src/routes/items/$id.test.tsx`

- [ ] **Step 1: Write failing tests**

Add a new `describe` block at the end of `apps/web/src/routes/items/$id.test.tsx`.

First, add `createRecipe` to the existing `import { createItem } from '@/db/operations'` line:
```ts
// Before:
import { createItem } from '@/db/operations'
// After:
import { createItem, createRecipe } from '@/db/operations'
```

Then add the describe block:

```ts
describe('consumeAmount change — recipe adjustment', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.recipes.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemDetailPage = (itemId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  it('user sees confirm dialog when changing consumeAmount affects a recipe', async () => {
    const user = userEvent.setup()

    // Given an item with consumeAmount 2 linked to a recipe with defaultAmount 4
    const item = await createItem({
      name: 'Flour',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 2,
      tagIds: [],
    })
    await createRecipe({
      name: 'Bread',
      items: [{ itemId: item.id, defaultAmount: 4 }],
    })

    renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Flour'))

    // When user changes consumeAmount from 2 to 3
    const consumeInput = screen.getByLabelText(/amount per consume/i) as HTMLInputElement
    await user.clear(consumeInput)
    await user.type(consumeInput, '3')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then a confirm dialog appears listing the affected recipe
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(screen.getByText(/update recipe amounts/i)).toBeInTheDocument()
      expect(screen.getByText('Bread')).toBeInTheDocument()
    })
  })

  it('user can confirm and recipe defaultAmount is adjusted to nearest multiple', async () => {
    const user = userEvent.setup()

    // Given item with consumeAmount 2, recipe with defaultAmount 4 (2 servings)
    const item = await createItem({
      name: 'Flour',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 2,
      tagIds: [],
    })
    const recipe = await createRecipe({
      name: 'Bread',
      items: [{ itemId: item.id, defaultAmount: 4 }],
    })

    renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Flour'))

    // When changing consumeAmount to 3 and confirming
    const consumeInput = screen.getByLabelText(/amount per consume/i) as HTMLInputElement
    await user.clear(consumeInput)
    await user.type(consumeInput, '3')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => screen.getByRole('alertdialog'))
    await user.click(screen.getByRole('button', { name: /update & save/i }))

    // Then recipe defaultAmount is adjusted: round(4/3)*3 = 3
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      const ri = updated?.items.find((r) => r.itemId === item.id)
      expect(ri?.defaultAmount).toBe(3)
    })
  })

  it('recipes with defaultAmount 0 are not affected', async () => {
    const user = userEvent.setup()

    // Given item with consumeAmount 2, recipe with defaultAmount 0 (optional ingredient)
    const item = await createItem({
      name: 'Salt',
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 2,
      tagIds: [],
    })
    const recipe = await createRecipe({
      name: 'Soup',
      items: [{ itemId: item.id, defaultAmount: 0 }],
    })

    renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Salt'))

    // When changing consumeAmount to 3 and saving
    const consumeInput = screen.getByLabelText(/amount per consume/i) as HTMLInputElement
    await user.clear(consumeInput)
    await user.type(consumeInput, '3')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then NO dialog appears (no affected recipes)
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.consumeAmount).toBe(3)
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('rounds up to new consumeAmount when nearest multiple would be 0', async () => {
    const user = userEvent.setup()

    // Given item with consumeAmount 2, recipe with defaultAmount 1
    // round(1/3)*3 = 0, but we round up to 3 (1× newConsumeAmount)
    const item = await createItem({
      name: 'Oil',
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 2,
      tagIds: [],
    })
    const recipe = await createRecipe({
      name: 'Salad',
      items: [{ itemId: item.id, defaultAmount: 1 }],
    })

    renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Oil'))

    // When changing consumeAmount to 3 and confirming
    const consumeInput = screen.getByLabelText(/amount per consume/i) as HTMLInputElement
    await user.clear(consumeInput)
    await user.type(consumeInput, '3')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => screen.getByRole('alertdialog'))
    await user.click(screen.getByRole('button', { name: /update & save/i }))

    // Then defaultAmount is rounded up to 3 (not 0)
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      const ri = updated?.items.find((r) => r.itemId === item.id)
      expect(ri?.defaultAmount).toBe(3)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
(cd apps/web && pnpm test --run "items/\$id.test")
```

Expected: new tests fail

- [ ] **Step 3: Add imports to `$id/index.tsx`**

In `apps/web/src/routes/items/$id/index.tsx`, add imports. Note: `useState` is already imported at line 2 — do not duplicate it.

```ts
// Add after the existing imports:
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useRecipes, useUpdateRecipe } from '@/hooks/useRecipes'
```

- [ ] **Step 4: Add `calcNewDefault` helper and `Adjustment` type above `ItemDetailTab`**

Add above `ItemDetailTab` in `apps/web/src/routes/items/$id/index.tsx`:

```ts
type Adjustment = {
  recipeId: string
  recipeName: string
  oldAmount: number
  newAmount: number
}

function calcNewDefault(oldDefault: number, newConsumeAmount: number): number {
  if (oldDefault === 0) return 0
  const nearest = Math.round(oldDefault / newConsumeAmount) * newConsumeAmount
  return nearest === 0 ? newConsumeAmount : nearest
}
```

- [ ] **Step 5: Restructure `ItemDetailTab` to add dialog state and new submit flow**

In `apps/web/src/routes/items/$id/index.tsx`, update `ItemDetailTab`:

```tsx
function ItemDetailTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const { registerDirtyState } = useItemLayout()
  const { goBack } = useAppNavigation()
  const [savedAt, setSavedAt] = useState(0)

  const { data: allRecipes } = useRecipes()
  const updateRecipe = useUpdateRecipe()

  const [pendingAdjustments, setPendingAdjustments] = useState<Adjustment[] | null>(null)
  const [pendingFormValues, setPendingFormValues] = useState<ItemFormValues | null>(null)

  if (!item) return null

  const formValues = itemToFormValues(item)

  const doSave = async (values: ItemFormValues) => {
    await updateItem.mutateAsync({ id, updates: buildUpdates(values) })
    setSavedAt((n) => n + 1)
    goBack()
  }

  const handleSubmit = async (values: ItemFormValues) => {
    const oldConsumeAmount = item.consumeAmount ?? 1
    const newConsumeAmount = values.consumeAmount

    if (oldConsumeAmount !== newConsumeAmount && allRecipes) {
      const affected: Adjustment[] = allRecipes
        .filter((r) => r.items.some((ri) => ri.itemId === id))
        .flatMap((r) => {
          const ri = r.items.find((ri) => ri.itemId === id)
          if (!ri) return []
          const newDefault = calcNewDefault(ri.defaultAmount, newConsumeAmount)
          if (newDefault === ri.defaultAmount) return []
          return [{
            recipeId: r.id,
            recipeName: r.name,
            oldAmount: ri.defaultAmount,
            newAmount: newDefault,
          }]
        })

      if (affected.length > 0) {
        setPendingFormValues(values)
        setPendingAdjustments(affected)
        return
      }
    }

    await doSave(values)
  }

  const handleConfirmAdjustments = async () => {
    if (!pendingFormValues || !pendingAdjustments || !allRecipes) return
    await doSave(pendingFormValues)
    for (const adj of pendingAdjustments) {
      const recipe = allRecipes.find((r) => r.id === adj.recipeId)
      if (!recipe) continue
      const newItems = recipe.items.map((ri) =>
        ri.itemId === id ? { ...ri, defaultAmount: adj.newAmount } : ri
      )
      await updateRecipe.mutateAsync({ id: adj.recipeId, updates: { items: newItems } })
    }
    setPendingAdjustments(null)
    setPendingFormValues(null)
  }

  const handleCancelAdjustments = () => {
    setPendingAdjustments(null)
    setPendingFormValues(null)
  }

  const handleDelete = async () => {
    await deleteItem.mutateAsync(item.id)
    goBack()
  }

  return (
    <>
      <ItemForm
        initialValues={formValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={handleSubmit}
        onDirtyChange={registerDirtyState}
        savedAt={savedAt}
      />

      <DeleteButton
        trigger="Delete"
        buttonClassName="w-full max-w-2xl mt-4"
        dialogTitle="Delete Item?"
        dialogDescription={
          <>
            Are you sure you want to delete <strong>{item.name}</strong>? This
            will permanently remove this item and its history.
          </>
        }
        onDelete={handleDelete}
      />

      <AlertDialog open={!!pendingAdjustments} onOpenChange={(open) => { if (!open) handleCancelAdjustments() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update recipe amounts?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            Amount per consume changed from {item.consumeAmount} to {pendingFormValues?.consumeAmount}.
            The following recipes will be adjusted:
          </AlertDialogDescription>
          {pendingAdjustments && (
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="text-left text-foreground-muted">
                  <th className="pb-1">Recipe</th>
                  <th className="pb-1">Current</th>
                  <th className="pb-1">New</th>
                </tr>
              </thead>
              <tbody>
                {pendingAdjustments.map((adj) => (
                  <tr key={adj.recipeId}>
                    <td className="capitalize">{adj.recipeName}</td>
                    <td>{adj.oldAmount}</td>
                    <td>{adj.newAmount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelAdjustments}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAdjustments}>
              Update &amp; Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
(cd apps/web && pnpm test --run "items/\$id.test")
```

Expected: all tests pass

- [ ] **Step 7: Full quality gate + E2E**

```bash
(cd apps/web && pnpm test --run)
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
pnpm test:e2e --grep "items|cooking"
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/routes/items/\$id/index.tsx \
        apps/web/src/routes/items/\$id.test.tsx
git commit -m "feat(items): show confirm dialog to adjust recipe amounts when consumeAmount changes"
```

---

**→ Open PR 2** targeting `main` (or targeting PR 1's branch if PR 1 is not yet merged).
