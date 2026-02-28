# Cooking Page ItemCard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the custom item rows in the cooking page's expanded recipe view with `ItemCard`, adding a new `cooking` mode that supports per-item optional-ingredient checkboxes and hides tags.

**Architecture:** Add `'cooking'` mode to `ItemCard` with the same tag-hiding behavior as `'shopping'` mode. Change `minControlAmount` default from `1` to `0`. In the cooking page, add `checkedItemIds` state to track per-recipe optional-ingredient inclusion, then replace custom item rows with `ItemCard` in a flat list below the recipe header.

**Tech Stack:** React 19, TypeScript strict, Vitest + React Testing Library, Storybook

---

### Task 1: Write failing tests for ItemCard cooking mode and minControlAmount change

**Files:**
- Modify: `src/components/ItemCard.test.tsx`

**Step 1: Add failing tests for cooking mode**

Append a new `describe` block at the bottom of `src/components/ItemCard.test.tsx`:

```tsx
describe('ItemCard - Cooking mode', () => {
  const mockItem: Item = {
    id: 'item-1',
    name: 'Flour',
    packageUnit: 'kg',
    targetUnit: 'package',
    tagIds: ['t1'],
    targetQuantity: 5,
    refillThreshold: 1,
    packedQuantity: 3,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockTags: Tag[] = [{ id: 't1', name: 'Baking', typeId: 'type1' }]
  const mockTagTypes: TagType[] = [
    { id: 'type1', name: 'Category', color: TagColor.blue },
  ]

  it('hides tags in cooking mode', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={mockTags}
        tagTypes={mockTagTypes}
        mode="cooking"
        isChecked={true}
        onCheckboxToggle={vi.fn()}
        controlAmount={2}
        onAmountChange={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('tag-badge-Baking')).not.toBeInTheDocument()
  })

  it('shows checkbox when onCheckboxToggle is provided in cooking mode', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[]}
        tagTypes={[]}
        mode="cooking"
        isChecked={false}
        onCheckboxToggle={vi.fn()}
        controlAmount={2}
        onAmountChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('checkbox', { name: /Add Flour/i })).toBeInTheDocument()
  })

  it('shows amount stepper when checked in cooking mode', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[]}
        tagTypes={[]}
        mode="cooking"
        isChecked={true}
        onCheckboxToggle={vi.fn()}
        controlAmount={4}
        onAmountChange={vi.fn()}
      />,
    )
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Increase quantity of Flour/i }),
    ).toBeInTheDocument()
  })

  it('minus button is disabled at amount 0 (default minControlAmount=0)', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[]}
        tagTypes={[]}
        mode="cooking"
        isChecked={true}
        onCheckboxToggle={vi.fn()}
        controlAmount={0}
        onAmountChange={vi.fn()}
      />,
    )
    const minusBtn = screen.getByRole('button', {
      name: /Decrease quantity of Flour/i,
    })
    expect(minusBtn).toBeDisabled()
  })

  it('minus button is enabled at amount 1 with default minControlAmount=0', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[]}
        tagTypes={[]}
        mode="cooking"
        isChecked={true}
        onCheckboxToggle={vi.fn()}
        controlAmount={1}
        onAmountChange={vi.fn()}
      />,
    )
    const minusBtn = screen.getByRole('button', {
      name: /Decrease quantity of Flour/i,
    })
    expect(minusBtn).not.toBeDisabled()
  })
})
```

**Step 2: Update the shopping mode minControlAmount test**

Find this test in `src/components/ItemCard.test.tsx`:

```tsx
it('- button is disabled at quantity 1 (shopping mode)', async () => {
```

Add `minControlAmount={1}` to the `ItemCard` props in that test so it keeps passing (the default is changing to 0, so shopping mode tests that rely on disabled-at-1 must be explicit):

```tsx
it('- button is disabled at quantity 1 when minControlAmount=1 (shopping mode)', async () => {
  await renderWithRouter(
    <ItemCard
      item={mockItem}
      tags={[]}
      tagTypes={[]}
      mode="shopping"
      isChecked={true}
      onCheckboxToggle={vi.fn()}
      controlAmount={1}
      minControlAmount={1}
      onAmountChange={vi.fn()}
    />,
  )

  const minusBtn = screen.getByRole('button', {
    name: /Decrease quantity of Milk/i,
  })
  expect(minusBtn).toBeDisabled()
})
```

**Step 3: Run tests to verify they fail**

```bash
pnpm test src/components/ItemCard.test.tsx
```

Expected: new cooking mode tests FAIL with "cooking" not in type union or similar; minControlAmount test FAIL with button not disabled.

---

### Task 2: Implement cooking mode in ItemCard

**Files:**
- Modify: `src/components/ItemCard.tsx`

**Step 1: Add `'cooking'` to the mode type union**

Find:
```tsx
mode?: 'pantry' | 'shopping' | 'tag-assignment' | 'recipe-assignment'
```

Replace with:
```tsx
mode?: 'pantry' | 'shopping' | 'tag-assignment' | 'recipe-assignment' | 'cooking'
```

**Step 2: Add `'cooking'` to `isAmountControllable`**

Find:
```tsx
const isAmountControllable = ['shopping', 'recipe-assignment'].includes(mode)
```

Replace with:
```tsx
const isAmountControllable = ['shopping', 'recipe-assignment', 'cooking'].includes(mode)
```

**Step 3: Change `minControlAmount` default from `1` to `0`**

Find:
```tsx
  minControlAmount = 1,
```

Replace with:
```tsx
  minControlAmount = 0,
```

**Step 4: Update the three tag/vendor/recipe hiding gates**

Each of the three badge sections has a condition like `mode !== 'shopping'`. Update all three to also hide in cooking mode. Find each one:

```tsx
{tags.length > 0 && mode !== 'shopping' && showTags && (
```
```tsx
{vendors.length > 0 && mode !== 'shopping' && showTags && (
```
```tsx
{recipes.length > 0 && mode !== 'shopping' && showTags && (
```

Replace `mode !== 'shopping'` with `!['shopping', 'cooking'].includes(mode)` in all three:

```tsx
{tags.length > 0 && !['shopping', 'cooking'].includes(mode) && showTags && (
```
```tsx
{vendors.length > 0 && !['shopping', 'cooking'].includes(mode) && showTags && (
```
```tsx
{recipes.length > 0 && !['shopping', 'cooking'].includes(mode) && showTags && (
```

**Step 5: Run tests to verify they pass**

```bash
pnpm test src/components/ItemCard.test.tsx
```

Expected: all tests PASS.

**Step 6: Commit**

```bash
git add src/components/ItemCard.tsx src/components/ItemCard.test.tsx
git commit -m "feat(item-card): add cooking mode, change minControlAmount default to 0"
```

---

### Task 3: Add Storybook stories for cooking mode

**Files:**
- Modify: `src/components/ItemCard.stories.tsx`

**Step 1: Add two cooking mode stories**

Append before the final export in `src/components/ItemCard.stories.tsx`:

```tsx
export const CookingModeChecked: Story = {
  name: 'Cooking Mode — Item included',
  args: {
    item: {
      ...mockItem,
      name: 'Flour',
      packageUnit: 'kg',
      tagIds: ['tag-1'],
    },
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'cooking',
    isChecked: true,
    controlAmount: 4,
    onCheckboxToggle: () => console.log('Toggle item'),
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}

export const CookingModeUnchecked: Story = {
  name: 'Cooking Mode — Item excluded (optional)',
  args: {
    item: {
      ...mockItem,
      name: 'Bacon',
      packageUnit: 'pack',
      tagIds: ['tag-1'],
    },
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'cooking',
    isChecked: false,
    controlAmount: 2,
    onCheckboxToggle: () => console.log('Toggle item'),
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}
```

**Step 2: Verify Storybook compiles**

```bash
pnpm storybook --ci --smoke-test 2>/dev/null || echo "Note: if smoke-test not supported, run pnpm storybook manually to verify"
```

If smoke-test is not supported, just proceed — visual check can be done separately.

**Step 3: Commit**

```bash
git add src/components/ItemCard.stories.tsx
git commit -m "feat(item-card): add Storybook stories for cooking mode"
```

---

### Task 4: Write failing tests for cooking page per-item checkboxes

**Files:**
- Modify: `src/routes/cooking.test.tsx`

**Step 1: Update existing aria-label references**

The current custom buttons used `Increase Flour` / `Decrease Flour`. After using ItemCard, the aria-labels become `Increase quantity of Flour` / `Decrease quantity of Flour`. Update all occurrences in `src/routes/cooking.test.tsx`:

Find (3 occurrences):
```tsx
screen.getByLabelText('Increase Flour')
```
Replace with:
```tsx
screen.getByRole('button', { name: /Increase quantity of Flour/i })
```

Find (2 occurrences):
```tsx
screen.getByLabelText('Decrease Flour')
```
Replace with:
```tsx
screen.getByRole('button', { name: /Decrease quantity of Flour/i })
```

**Step 2: Add failing tests for per-item checkbox behavior**

Append to the `describe('Use (Cooking) Page')` block:

```tsx
it('user can uncheck an optional item in an expanded recipe', async () => {
  // Given a recipe with two items
  const flour = await makeItem('Flour', 1, 5)
  const bacon = await makeItem('Bacon', 1, 3)
  await createRecipe({
    name: 'Quiche',
    items: [
      { itemId: flour.id, defaultAmount: 2 },
      { itemId: bacon.id, defaultAmount: 1 },
    ],
  })

  renderPage()
  const user = userEvent.setup()

  // When user checks the recipe
  await waitFor(() => {
    expect(screen.getByLabelText('Quiche')).toBeInTheDocument()
  })
  await user.click(screen.getByLabelText('Quiche'))

  // Then both items appear as checked
  await waitFor(() => {
    expect(
      screen.getByRole('checkbox', { name: /Remove Flour/i }),
    ).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: /Remove Bacon/i }),
    ).toBeChecked()
  })

  // When user unchecks Bacon (optional ingredient)
  await user.click(screen.getByRole('checkbox', { name: /Remove Bacon/i }))

  // Then Bacon is unchecked
  await waitFor(() => {
    expect(
      screen.getByRole('checkbox', { name: /Add Bacon/i }),
    ).not.toBeChecked()
  })
})

it('unchecked items are excluded from consumption', async () => {
  // Given a recipe with two items
  const flour = await makeItem('Flour', 1, 5)
  const bacon = await makeItem('Bacon', 1, 3)
  await createRecipe({
    name: 'Quiche',
    items: [
      { itemId: flour.id, defaultAmount: 2 },
      { itemId: bacon.id, defaultAmount: 1 },
    ],
  })

  renderPage()
  const user = userEvent.setup()

  // When user checks the recipe
  await waitFor(() => {
    expect(screen.getByLabelText('Quiche')).toBeInTheDocument()
  })
  await user.click(screen.getByLabelText('Quiche'))

  // And unchecks Bacon
  await waitFor(() => {
    expect(
      screen.getByRole('checkbox', { name: /Remove Bacon/i }),
    ).toBeInTheDocument()
  })
  await user.click(screen.getByRole('checkbox', { name: /Remove Bacon/i }))

  // And confirms Done
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /done/i })).not.toBeDisabled()
  })
  await user.click(screen.getByRole('button', { name: /done/i }))
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole('button', { name: /confirm/i }))

  // Then Flour's quantity is reduced
  await waitFor(async () => {
    const updatedFlour = await db.items.get(flour.id)
    const total =
      (updatedFlour?.packedQuantity ?? 0) + (updatedFlour?.unpackedQuantity ?? 0)
    expect(total).toBeLessThan(5)
  })

  // But Bacon's quantity is unchanged
  await waitFor(async () => {
    const updatedBacon = await db.items.get(bacon.id)
    expect(updatedBacon?.packedQuantity).toBe(3)
  })
})
```

**Step 3: Run tests to verify failures**

```bash
pnpm test src/routes/cooking.test.tsx
```

Expected: updated aria-label tests FAIL (element not found), per-item checkbox tests FAIL (no item checkboxes exist yet).

---

### Task 5: Update cooking page — state and data flow

**Files:**
- Modify: `src/routes/cooking.tsx`

**Step 1: Add `useTags` and `useTagTypes` imports**

Find in the hooks import line:
```tsx
import { useAddInventoryLog, useItems, useUpdateItem } from '@/hooks'
```

Replace with:
```tsx
import { useAddInventoryLog, useItems, useTags, useTagTypes, useUpdateItem } from '@/hooks'
```

**Step 2: Add `checkedItemIds` state and hook calls inside `CookingPage`**

Find these two existing hook calls near the top of `CookingPage`:
```tsx
  const { data: items = [] } = useItems()
  const updateItem = useUpdateItem()
```

Add after them:
```tsx
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
```

Find:
```tsx
  const [checkedRecipeIds, setCheckedRecipeIds] = useState<Set<string>>(
    new Set(),
  )
```

Add after it:
```tsx
  // Map<recipeId, Set<itemId>> — tracks which items are included per recipe
  const [checkedItemIds, setCheckedItemIds] = useState<Map<string, Set<string>>>(
    new Map(),
  )
```

**Step 3: Update `handleToggleRecipe` to populate/clear `checkedItemIds`**

Find the "Check: populate with defaultAmounts" block inside `handleToggleRecipe`:
```tsx
    } else {
      // Check: populate with defaultAmounts
      const recipeAmountMap = new Map<string, number>()
      for (const ri of recipe.items) {
        recipeAmountMap.set(ri.itemId, ri.defaultAmount)
      }
      const newAmounts = new Map(sessionAmounts)
      newAmounts.set(recipeId, recipeAmountMap)
      setSessionAmounts(newAmounts)

      setCheckedRecipeIds(new Set([...checkedRecipeIds, recipeId]))
    }
```

Replace with:
```tsx
    } else {
      // Check: populate with defaultAmounts and mark all items included
      const recipeAmountMap = new Map<string, number>()
      const recipeItemSet = new Set<string>()
      for (const ri of recipe.items) {
        recipeAmountMap.set(ri.itemId, ri.defaultAmount)
        recipeItemSet.add(ri.itemId)
      }
      const newAmounts = new Map(sessionAmounts)
      newAmounts.set(recipeId, recipeAmountMap)
      setSessionAmounts(newAmounts)

      const newCheckedItemIds = new Map(checkedItemIds)
      newCheckedItemIds.set(recipeId, recipeItemSet)
      setCheckedItemIds(newCheckedItemIds)

      setCheckedRecipeIds(new Set([...checkedRecipeIds, recipeId]))
    }
```

Find the "Uncheck: remove from state" block:
```tsx
    if (checkedRecipeIds.has(recipeId)) {
      // Uncheck: remove from state
      const newAmounts = new Map(sessionAmounts)
      newAmounts.delete(recipeId)
      setSessionAmounts(newAmounts)

      const newChecked = new Set(checkedRecipeIds)
      newChecked.delete(recipeId)
      setCheckedRecipeIds(newChecked)
```

Replace with:
```tsx
    if (checkedRecipeIds.has(recipeId)) {
      // Uncheck: remove from state
      const newAmounts = new Map(sessionAmounts)
      newAmounts.delete(recipeId)
      setSessionAmounts(newAmounts)

      const newCheckedItemIds = new Map(checkedItemIds)
      newCheckedItemIds.delete(recipeId)
      setCheckedItemIds(newCheckedItemIds)

      const newChecked = new Set(checkedRecipeIds)
      newChecked.delete(recipeId)
      setCheckedRecipeIds(newChecked)
```

**Step 4: Add `handleToggleItem` function**

Add after `handleAdjustAmount`:
```tsx
  const handleToggleItem = (recipeId: string, itemId: string) => {
    const newCheckedItemIds = new Map(checkedItemIds)
    const itemSet = new Set(newCheckedItemIds.get(recipeId) ?? [])
    if (itemSet.has(itemId)) {
      itemSet.delete(itemId)
    } else {
      itemSet.add(itemId)
    }
    newCheckedItemIds.set(recipeId, itemSet)
    setCheckedItemIds(newCheckedItemIds)
  }
```

**Step 5: Update `totalByItemId` to filter by `checkedItemIds`**

Find the `totalByItemId` useMemo:
```tsx
  const totalByItemId = useMemo(() => {
    const totals = new Map<string, number>()
    for (const recipeId of checkedRecipeIds) {
      const recipeAmounts = sessionAmounts.get(recipeId) ?? new Map()
      for (const [itemId, amount] of recipeAmounts) {
        if (amount > 0) {
          totals.set(itemId, (totals.get(itemId) ?? 0) + amount)
        }
      }
    }
    return totals
  }, [checkedRecipeIds, sessionAmounts])
```

Replace with:
```tsx
  const totalByItemId = useMemo(() => {
    const totals = new Map<string, number>()
    for (const recipeId of checkedRecipeIds) {
      const recipeAmounts = sessionAmounts.get(recipeId) ?? new Map()
      const included = checkedItemIds.get(recipeId) ?? new Set()
      for (const [itemId, amount] of recipeAmounts) {
        if (amount > 0 && included.has(itemId)) {
          totals.set(itemId, (totals.get(itemId) ?? 0) + amount)
        }
      }
    }
    return totals
  }, [checkedRecipeIds, sessionAmounts, checkedItemIds])
```

**Step 6: Also clear `checkedItemIds` on cancel**

Find in `handleConfirmCancel`:
```tsx
  const handleConfirmCancel = () => {
    setCheckedRecipeIds(new Set())
    setSessionAmounts(new Map())
    setShowCancelDialog(false)
  }
```

Replace with:
```tsx
  const handleConfirmCancel = () => {
    setCheckedRecipeIds(new Set())
    setSessionAmounts(new Map())
    setCheckedItemIds(new Map())
    setShowCancelDialog(false)
  }
```

And in `handleConfirmDone`, after `setShowDoneDialog(false)`:
```tsx
    setCheckedRecipeIds(new Set())
    setSessionAmounts(new Map())
    setShowDoneDialog(false)
```

Replace with:
```tsx
    setCheckedRecipeIds(new Set())
    setSessionAmounts(new Map())
    setCheckedItemIds(new Map())
    setShowDoneDialog(false)
```

---

### Task 6: Replace custom item rows with ItemCard in cooking page

**Files:**
- Modify: `src/routes/cooking.tsx`

**Step 1: Add ItemCard import**

Find:
```tsx
import { Toolbar } from '@/components/Toolbar'
```

Replace with:
```tsx
import { ItemCard } from '@/components/ItemCard'
import { Toolbar } from '@/components/Toolbar'
```

**Step 2: Remove unused imports**

The `Minus` and `Plus` icons from `lucide-react` are no longer needed in the item rows (ItemCard handles its own icons). Check if they're still used by the `handleAdjustAmount` logic or any other JSX. They are NOT used after this change. Remove them:

Find:
```tsx
import { Minus, Plus } from 'lucide-react'
```

Replace with:
```tsx
import { Plus } from 'lucide-react'
```

(`Plus` is still used for the "New Recipe" button.)

**Step 3: Replace the expanded item list with ItemCards**

Find the expanded item list block:
```tsx
                  {/* Expanded item list when checked */}
                  {isChecked && recipeAmounts && (
                    <div className="space-y-2 pl-7">
                      {recipe.items.length === 0 && (
                        <p className="text-sm text-foreground-muted">
                          No items in this recipe.
                        </p>
                      )}
                      {recipe.items.map((ri) => {
                        const item = items.find((i) => i.id === ri.itemId)
                        if (!item) return null
                        const amount =
                          recipeAmounts.get(ri.itemId) ?? ri.defaultAmount
                        const unit =
                          item.targetUnit === 'measurement'
                            ? (item.measurementUnit ?? '')
                            : (item.packageUnit ?? '') // intentionally blank when unit is unset

                        return (
                          <div
                            key={ri.itemId}
                            className="flex items-center gap-2"
                          >
                            <span className="flex-1 text-sm">{item.name}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="neutral-outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() =>
                                  handleAdjustAmount(recipe.id, ri.itemId, -1)
                                }
                                aria-label={`Decrease ${item.name}`}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-16 text-center text-sm tabular-nums">
                                {amount} {unit}
                              </span>
                              <Button
                                variant="neutral-outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() =>
                                  handleAdjustAmount(recipe.id, ri.itemId, 1)
                                }
                                aria-label={`Increase ${item.name}`}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
```

Replace with:
```tsx
                  {/* Expanded item list when checked — rendered as flat ItemCards below this card */}
```

Then find the closing of the recipe `<Card>` block — after `</Card>` for the recipe header, add the flat ItemCard list. The structure should look like:

```tsx
              <Card key={recipe.id}>
                <CardContent>
                  {/* Recipe header row */}
                  <div className="flex items-center gap-3">
                    ...
                  </div>
                </CardContent>
              </Card>
              {isChecked && recipeAmounts && (
                <div className="space-y-px pl-7">
                  {recipe.items.length === 0 && (
                    <p className="text-sm text-foreground-muted px-4">
                      No items in this recipe.
                    </p>
                  )}
                  {recipe.items.map((ri) => {
                    const item = items.find((i) => i.id === ri.itemId)
                    if (!item) return null
                    const itemTags = tags.filter((t) =>
                      item.tagIds.includes(t.id),
                    )
                    const amount = recipeAmounts.get(ri.itemId) ?? ri.defaultAmount
                    const isItemChecked =
                      checkedItemIds.get(recipe.id)?.has(ri.itemId) ?? true

                    return (
                      <ItemCard
                        key={ri.itemId}
                        item={item}
                        tags={itemTags}
                        tagTypes={tagTypes}
                        mode="cooking"
                        isChecked={isItemChecked}
                        onCheckboxToggle={() =>
                          handleToggleItem(recipe.id, ri.itemId)
                        }
                        controlAmount={amount}
                        onAmountChange={(delta) =>
                          handleAdjustAmount(recipe.id, ri.itemId, delta)
                        }
                      />
                    )
                  })}
                </div>
              )}
```

Note: The `return (...)` for the recipe map now wraps both the recipe card and the ItemCard list in a `<div key={recipe.id}>` or a React Fragment. Use a React Fragment:

```tsx
          {sortedRecipes.map((recipe) => {
            const isChecked = checkedRecipeIds.has(recipe.id)
            const recipeAmounts = sessionAmounts.get(recipe.id)

            return (
              <React.Fragment key={recipe.id}>
                <Card>
                  <CardContent>
                    {/* Recipe header row */}
                    ...
                  </CardContent>
                </Card>
                {isChecked && recipeAmounts && (
                  <div className="space-y-px pl-7">
                    ...ItemCards...
                  </div>
                )}
              </React.Fragment>
            )
          })}
```

Add `import React from 'react'` at the top if not already present. TanStack Router projects typically have React in scope already via JSX transform — check the top of the file and only add the import if needed. If `React.Fragment` isn't available, use `<>...</>` syntax instead.

**Step 4: Run all tests**

```bash
pnpm test src/routes/cooking.test.tsx
```

Expected: All tests PASS including the new per-item checkbox tests.

**Step 5: Run full test suite**

```bash
pnpm test
```

Expected: All tests PASS.

**Step 6: Commit**

```bash
git add src/routes/cooking.tsx
git commit -m "feat(cooking): replace custom item rows with ItemCard in cooking mode"
```

---

### Task 7: Commit test and story updates together

**Step 1: Commit the test and story changes**

```bash
git add src/routes/cooking.test.tsx src/components/ItemCard.stories.tsx
git commit -m "test(cooking): add per-item checkbox tests; feat(item-card): add cooking mode stories"
```

---

### Final verification

```bash
pnpm test
pnpm build
```

Both should succeed with no errors.
