# Cooking Page: Expand/Collapse + Serving Count Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to expand/collapse recipe cards independently of checking them, and set a per-recipe serving multiplier that scales all ingredient amounts.

**Architecture:** All changes are confined to `src/routes/cooking.tsx`. State is refactored: `checkedRecipeIds` is removed, `expandedRecipeIds` and `sessionServings` are added. `sessionAmounts` now stores per-serving amounts. The recipe checkbox becomes a tri-state control derived from `checkedItemIds`. Total consumed = `servings × per-serving amount`.

**Tech Stack:** React 19, `@tanstack/react-router`, Vitest + React Testing Library, shadcn/ui (`Checkbox`), lucide-react (`ChevronDown`, `ChevronRight`)

---

### Task 1: Update existing tests to reflect new expand/check separation

The old model coupled "check" with "expand". Tests that check a recipe and then interact with its items must now also expand the recipe. Update the test file before touching implementation so you have a clear target.

**Files:**
- Modify: `src/routes/cooking.test.tsx`

**Step 1: Update "user can check a recipe and see item amounts expanded"**

This test should now test that items appear when the recipe is **expanded**, not just checked. Replace the test:

```tsx
it('user can expand a recipe to see its items', async () => {
  // Given a recipe with an item
  const item = await makeItem('Flour', 2)
  await createRecipe({
    name: 'Pasta',
    items: [{ itemId: item.id, defaultAmount: 4 }],
  })

  renderPage()
  const user = userEvent.setup()

  // When user expands the recipe (chevron button)
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Expand Pasta/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))

  // Then the item list is visible
  await waitFor(() => {
    expect(screen.getByText('Flour')).toBeInTheDocument()
  })
})

it('user can collapse an expanded recipe to hide its items', async () => {
  // Given a recipe with an item, expanded
  const item = await makeItem('Flour', 2)
  await createRecipe({
    name: 'Pasta',
    items: [{ itemId: item.id, defaultAmount: 4 }],
  })

  renderPage()
  const user = userEvent.setup()

  // When user expands
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Expand Pasta/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))

  await waitFor(() => {
    expect(screen.getByText('Flour')).toBeInTheDocument()
  })

  // And collapses
  await user.click(screen.getByRole('button', { name: /Collapse Pasta/i }))

  // Then items are hidden
  await waitFor(() => {
    expect(screen.queryByText('Flour')).not.toBeInTheDocument()
  })
})

it('checking a recipe without expanding does not show items', async () => {
  // Given a recipe with an item
  const item = await makeItem('Flour', 2)
  await createRecipe({
    name: 'Pasta',
    items: [{ itemId: item.id, defaultAmount: 4 }],
  })

  renderPage()
  const user = userEvent.setup()

  // When user checks the recipe (without expanding)
  await waitFor(() => {
    expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
  })
  await user.click(screen.getByLabelText('Pasta'))

  // Then items are NOT visible (not expanded)
  await waitFor(() => {
    expect(screen.queryByText('Flour')).not.toBeInTheDocument()
  })
})
```

**Step 2: Update "Done and Cancel buttons become enabled when a recipe is checked"**

The old test uses a recipe with no items. With the new model `anyChecked` is based on checked items, so a recipe with 0 items doesn't enable Done/Cancel. Add an item:

```tsx
it('Done and Cancel buttons become enabled when a recipe is checked', async () => {
  // Given a recipe with an item
  const item = await makeItem('Flour', 1)
  await createRecipe({
    name: 'Pasta',
    items: [{ itemId: item.id, defaultAmount: 2 }],
  })

  renderPage()
  const user = userEvent.setup()

  // When user checks the recipe
  await waitFor(() => {
    expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
  })
  await user.click(screen.getByLabelText('Pasta'))

  // Then Done and Cancel are enabled
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /done/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /cancel/i })).not.toBeDisabled()
  })
})
```

**Step 3: Update tests that interact with items to expand first**

Every test that clicks the recipe checkbox and then interacts with items must now expand first. Add an expand step before checking in each of these tests:

- "user can adjust item amount with + button"
- "user can adjust item amount down to 0 with - button"
- "user can confirm consumption and inventory is reduced"
- "items with amount=0 are skipped on consumption"
- "user can see items with defaultAmount 0 start unchecked"
- "user can uncheck an optional item in an expanded recipe"
- "unchecked items are excluded from consumption"
- "user sees expiration but not tag badges when cooking a recipe"

Pattern to add after `renderPage()` and before checking the recipe:

```tsx
// Expand the recipe first
await waitFor(() => {
  expect(screen.getByRole('button', { name: /Expand Pasta/i })).toBeInTheDocument()
})
await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))
```

Also update the `aria-label` lookup in "user can cancel and selections are cleared" — that test has no items but clicks cancel. Since it checks a recipe with no items, the Done/Cancel buttons won't enable. Update it to use a recipe with an item (same pattern as the Done/Cancel test above).

**Step 4: Run tests (expect failures)**

```bash
pnpm test src/routes/cooking.test.tsx
```

Expected: most tests fail. This gives us a clear target.

**Step 5: Commit updated tests**

```bash
git add src/routes/cooking.test.tsx
git commit -m "test(cooking): update tests for expand/check separation"
```

---

### Task 2: Refactor state model in cooking.tsx

**Files:**
- Modify: `src/routes/cooking.tsx`

**Step 1: Replace state declarations**

Find the state block (lines 46–56) and replace:

```tsx
// Remove:
const [checkedRecipeIds, setCheckedRecipeIds] = useState<Set<string>>(new Set())

// Add:
const [expandedRecipeIds, setExpandedRecipeIds] = useState<Set<string>>(new Set())
const [sessionServings, setSessionServings] = useState<Map<string, number>>(new Map())
```

`sessionAmounts` and `checkedItemIds` stay as-is.

**Step 2: Add `initializeRecipe` helper (inline, before handlers)**

```tsx
const initializeRecipe = (
  recipeId: string,
  recipe: (typeof recipes)[0],
  currentAmounts: Map<string, Map<string, number>>,
  currentCheckedItemIds: Map<string, Set<string>>,
  currentServings: Map<string, number>,
) => {
  if (currentAmounts.has(recipeId)) {
    return { amounts: currentAmounts, itemIds: currentCheckedItemIds, servings: currentServings }
  }
  const recipeAmountMap = new Map<string, number>()
  const recipeItemSet = new Set<string>()
  for (const ri of recipe.items) {
    recipeAmountMap.set(ri.itemId, ri.defaultAmount)
    if (ri.defaultAmount > 0) recipeItemSet.add(ri.itemId)
  }
  return {
    amounts: new Map(currentAmounts).set(recipeId, recipeAmountMap),
    itemIds: new Map(currentCheckedItemIds).set(recipeId, recipeItemSet),
    servings: new Map(currentServings).set(recipeId, 1),
  }
}
```

**Step 3: Replace `handleToggleRecipe` with two new handlers**

```tsx
const handleToggleExpand = (recipeId: string) => {
  const recipe = recipes.find((r) => r.id === recipeId)
  if (!recipe) return

  const newExpanded = new Set(expandedRecipeIds)
  if (newExpanded.has(recipeId)) {
    newExpanded.delete(recipeId)
    setExpandedRecipeIds(newExpanded)
    return
  }

  // Expanding — initialize state if first time
  newExpanded.add(recipeId)
  const { amounts, itemIds, servings } = initializeRecipe(
    recipeId, recipe, sessionAmounts, checkedItemIds, sessionServings,
  )
  setExpandedRecipeIds(newExpanded)
  setSessionAmounts(amounts)
  setCheckedItemIds(itemIds)
  setSessionServings(servings)
}

const handleToggleRecipeCheckbox = (recipeId: string) => {
  const recipe = recipes.find((r) => r.id === recipeId)
  if (!recipe) return

  // Initialize if first time interacting
  const { amounts, itemIds, servings } = initializeRecipe(
    recipeId, recipe, sessionAmounts, checkedItemIds, sessionServings,
  )
  setSessionAmounts(amounts)
  setSessionServings(servings)

  // Derive current check state from local itemIds (not yet committed to state)
  const currentChecked = itemIds.get(recipeId) ?? new Set()
  const allChecked =
    recipe.items.length > 0 && currentChecked.size === recipe.items.length

  const updatedItemIds = new Map(itemIds)
  if (allChecked) {
    updatedItemIds.set(recipeId, new Set())
  } else {
    updatedItemIds.set(recipeId, new Set(recipe.items.map((ri) => ri.itemId)))
  }
  setCheckedItemIds(updatedItemIds)
}

const handleAdjustServings = (recipeId: string, delta: number) => {
  const current = sessionServings.get(recipeId) ?? 1
  const next = Math.max(1, current + delta)
  setSessionServings(new Map(sessionServings).set(recipeId, next))
}
```

**Step 4: Update `anyChecked`**

```tsx
// Old:
const anyChecked = checkedRecipeIds.size > 0

// New:
const anyChecked = [...checkedItemIds.values()].some((set) => set.size > 0)
```

**Step 5: Update `totalByItemId`**

```tsx
const totalByItemId = useMemo(() => {
  const totals = new Map<string, number>()
  for (const [recipeId, recipeAmounts] of sessionAmounts) {
    const servings = sessionServings.get(recipeId) ?? 1
    const included = checkedItemIds.get(recipeId) ?? new Set()
    for (const [itemId, amount] of recipeAmounts) {
      if (amount > 0 && included.has(itemId)) {
        totals.set(itemId, (totals.get(itemId) ?? 0) + servings * amount)
      }
    }
  }
  return totals
}, [sessionAmounts, sessionServings, checkedItemIds])
```

**Step 6: Update reset handlers**

In `handleConfirmDone` and `handleConfirmCancel`, replace:
```tsx
setCheckedRecipeIds(new Set())
```
with:
```tsx
setExpandedRecipeIds(new Set())
setSessionServings(new Map())
```

**Step 7: Run tests**

```bash
pnpm test src/routes/cooking.test.tsx
```

Expected: some pass, some still fail (UI not updated yet).

**Step 8: Commit state refactor**

```bash
git add src/routes/cooking.tsx
git commit -m "refactor(cooking): replace checkedRecipeIds with expandedRecipeIds and sessionServings"
```

---

### Task 3: Update recipe card UI — chevron and expand/collapse

**Files:**
- Modify: `src/routes/cooking.tsx`

**Step 1: Add `ChevronDown` and `ChevronRight` to imports**

```tsx
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
```

**Step 2: Update the recipe card render**

Inside `sortedRecipes.map(...)`, update the derived variables:

```tsx
const isChecked = checkedRecipeIds.has(recipe.id)  // DELETE this line
const isExpanded = expandedRecipeIds.has(recipe.id)
const recipeAmounts = sessionAmounts.get(recipe.id)
const checkedCount = checkedItemIds.get(recipe.id)?.size ?? 0
const totalItemCount = recipe.items.length

// Tri-state for recipe checkbox
const recipeCheckState: boolean | 'indeterminate' =
  totalItemCount === 0
    ? false
    : checkedCount === 0
      ? false
      : checkedCount === totalItemCount
        ? true
        : 'indeterminate'
```

**Step 3: Update recipe header row**

Replace the existing `<CardContent>` block with:

```tsx
<CardContent className="p-0">
  {/* Row 1: checkbox | [name ··· chevron] | [serving stepper] */}
  <div className="flex items-center gap-3 px-4 py-3">
    <Checkbox
      id={`recipe-${recipe.id}`}
      checked={recipeCheckState}
      onCheckedChange={() => handleToggleRecipeCheckbox(recipe.id)}
      aria-label={recipe.name}
    />
    <button
      type="button"
      className="flex-1 flex items-center justify-between text-left font-medium hover:underline capitalize"
      onClick={() => handleToggleExpand(recipe.id)}
    >
      <span>{recipe.name}</span>
      {isExpanded ? (
        <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
      ) : (
        <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
      )}
    </button>
    {/* Serving stepper — always reserved, empty when no items checked */}
    <div className="flex items-center gap-1 w-20 justify-end">
      {recipeCheckState !== false && (
        <>
          <Button
            variant="neutral-outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => handleAdjustServings(recipe.id, -1)}
            disabled={(sessionServings.get(recipe.id) ?? 1) <= 1}
          >
            −
          </Button>
          <span className="text-sm w-4 text-center">
            {sessionServings.get(recipe.id) ?? 1}
          </span>
          <Button
            variant="neutral-outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => handleAdjustServings(recipe.id, 1)}
          >
            +
          </Button>
        </>
      )}
    </div>
  </div>

  {/* Row 2: subtitle */}
  <div className="px-4 pb-2 pl-10 text-sm text-foreground-muted">
    {totalItemCount} item{totalItemCount !== 1 ? 's' : ''}
    {checkedCount > 0 ? `, ${checkedCount} selected` : ''}
  </div>
</CardContent>
```

Note: the `pl-10` aligns Row 2 under the recipe name (past the checkbox).

**Step 4: Update aria-label on chevron button**

The expand button inside the flex container needs an accessible label for tests. Change the `<button>` to use `aria-label`:

```tsx
<button
  type="button"
  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${recipe.name}`}
  className="flex-1 flex items-center justify-between text-left font-medium hover:underline capitalize"
  onClick={() => handleToggleExpand(recipe.id)}
>
```

**Step 5: Update item list visibility**

Change the condition for showing the items list:

```tsx
// Old:
{isChecked && recipeAmounts && (

// New:
{isExpanded && recipeAmounts && (
```

Also remove the old item count span (now in subtitle):
```tsx
// Delete:
{!isChecked && (
  <span className="text-sm text-foreground-muted">
    {recipe.items.length} item{recipe.items.length !== 1 ? 's' : ''}
  </span>
)}
```

**Step 6: Update recipe name from link to separate element**

The recipe name was previously a `<button>` that navigated to the detail page. Now the chevron button wraps name+chevron. Move the navigate link back to just the name text:

```tsx
<button
  type="button"
  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${recipe.name}`}
  className="flex-1 flex items-center justify-between text-left font-medium capitalize"
  onClick={() => handleToggleExpand(recipe.id)}
>
  <span
    className="hover:underline cursor-pointer"
    onClick={(e) => {
      e.stopPropagation()
      navigate({ to: '/settings/recipes/$id', params: { id: recipe.id } })
    }}
  >
    {recipe.name}
  </span>
  {isExpanded ? (
    <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
  ) : (
    <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
  )}
</button>
```

**Step 7: Run tests**

```bash
pnpm test src/routes/cooking.test.tsx
```

Expected: most tests pass now.

**Step 8: Commit UI changes**

```bash
git add src/routes/cooking.tsx
git commit -m "feat(cooking): add expand/collapse per recipe with chevron and subtitle"
```

---

### Task 4: Write and pass serving count tests

**Files:**
- Modify: `src/routes/cooking.test.tsx`

**Step 1: Add serving count tests**

```tsx
it('user can see the serving stepper when a recipe is checked', async () => {
  // Given a recipe with an item
  const item = await makeItem('Flour', 1)
  await createRecipe({
    name: 'Pasta',
    items: [{ itemId: item.id, defaultAmount: 2 }],
  })

  renderPage()
  const user = userEvent.setup()

  // When user checks the recipe
  await waitFor(() => {
    expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
  })
  await user.click(screen.getByLabelText('Pasta'))

  // Then serving stepper shows with default of 1
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /increase.*serving/i })).toBeInTheDocument()
  })
})

it('serving count starts at 1 and can be increased', async () => {
  // Given a recipe with an item
  const item = await makeItem('Flour', 1)
  await createRecipe({
    name: 'Pasta',
    items: [{ itemId: item.id, defaultAmount: 2 }],
  })

  renderPage()
  const user = userEvent.setup()

  // When user checks and clicks +
  await waitFor(() => {
    expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
  })
  await user.click(screen.getByLabelText('Pasta'))

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /increase.*serving/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole('button', { name: /increase.*serving/i }))

  // Then serving count shows 2
  await waitFor(() => {
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})

it('serving count cannot go below 1', async () => {
  // Given a recipe with an item, checked (serving = 1)
  const item = await makeItem('Flour', 1)
  await createRecipe({
    name: 'Pasta',
    items: [{ itemId: item.id, defaultAmount: 2 }],
  })

  renderPage()
  const user = userEvent.setup()

  await waitFor(() => {
    expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
  })
  await user.click(screen.getByLabelText('Pasta'))

  // Then − button is disabled at 1
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /decrease.*serving/i })).toBeDisabled()
  })
})

it('serving count multiplies ingredient amounts on consumption', async () => {
  // Given a recipe: Flour with defaultAmount=2, packedQuantity=10
  const item = await makeItem('Flour', 1, 10)
  await createRecipe({
    name: 'Pasta',
    items: [{ itemId: item.id, defaultAmount: 2 }],
  })

  renderPage()
  const user = userEvent.setup()

  // When user checks the recipe and sets servings to 3
  await waitFor(() => {
    expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
  })
  await user.click(screen.getByLabelText('Pasta'))

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /increase.*serving/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole('button', { name: /increase.*serving/i })) // 2
  await user.click(screen.getByRole('button', { name: /increase.*serving/i })) // 3

  // And clicks Done and confirms
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /done/i })).not.toBeDisabled()
  })
  await user.click(screen.getByRole('button', { name: /done/i }))
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole('button', { name: /confirm/i }))

  // Then Flour is reduced by 3 × 2 = 6 (from 10 to 4)
  await waitFor(async () => {
    const updated = await db.items.get(item.id)
    const total = (updated?.packedQuantity ?? 0) + (updated?.unpackedQuantity ?? 0)
    expect(total).toBe(4)
  })
})
```

**Step 2: Update serving stepper aria-labels in cooking.tsx**

To match the tests above, add `aria-label` to the serving ±buttons:

```tsx
<Button
  aria-label="Decrease servings"
  ...
>
  −
</Button>
<Button
  aria-label="Increase servings"
  ...
>
  +
</Button>
```

**Step 3: Run tests**

```bash
pnpm test src/routes/cooking.test.tsx
```

Expected: all tests pass.

**Step 4: Commit**

```bash
git add src/routes/cooking.tsx src/routes/cooking.test.tsx
git commit -m "feat(cooking): add serving count stepper per recipe"
```

---

### Task 5: Write and pass tri-state checkbox tests

**Files:**
- Modify: `src/routes/cooking.test.tsx`

**Step 1: Add tests**

```tsx
it('recipe checkbox shows indeterminate when only some items are checked', async () => {
  // Given a recipe with two items
  const flour = await makeItem('Flour', 1, 5)
  const salt = await makeItem('Salt', 1, 3)
  await createRecipe({
    name: 'Pasta',
    items: [
      { itemId: flour.id, defaultAmount: 2 },
      { itemId: salt.id, defaultAmount: 1 },
    ],
  })

  renderPage()
  const user = userEvent.setup()

  // Expand and check all
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Expand Pasta/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))
  await user.click(screen.getByLabelText('Pasta'))

  // Uncheck one item
  await waitFor(() => {
    expect(screen.getByRole('checkbox', { name: /Remove Salt/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole('checkbox', { name: /Remove Salt/i }))

  // Then the recipe checkbox is indeterminate
  await waitFor(() => {
    const recipeCheckbox = screen.getByLabelText('Pasta')
    expect(recipeCheckbox).toHaveAttribute('data-state', 'indeterminate')
  })
})

it('clicking indeterminate recipe checkbox checks all items', async () => {
  // Given a recipe with two items, one unchecked (indeterminate state)
  const flour = await makeItem('Flour', 1, 5)
  const salt = await makeItem('Salt', 1, 3)
  await createRecipe({
    name: 'Pasta',
    items: [
      { itemId: flour.id, defaultAmount: 2 },
      { itemId: salt.id, defaultAmount: 1 },
    ],
  })

  renderPage()
  const user = userEvent.setup()

  // Expand, check all, uncheck one item
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Expand Pasta/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))
  await user.click(screen.getByLabelText('Pasta'))
  await waitFor(() => {
    expect(screen.getByRole('checkbox', { name: /Remove Salt/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole('checkbox', { name: /Remove Salt/i }))

  // When user clicks the indeterminate recipe checkbox
  await user.click(screen.getByLabelText('Pasta'))

  // Then both items are checked
  await waitFor(() => {
    expect(screen.getByRole('checkbox', { name: /Remove Flour/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Remove Salt/i })).toBeChecked()
  })
})

it('expand/collapse does not affect check state', async () => {
  // Given a recipe with an item, expanded and checked
  const item = await makeItem('Flour', 1)
  await createRecipe({
    name: 'Pasta',
    items: [{ itemId: item.id, defaultAmount: 2 }],
  })

  renderPage()
  const user = userEvent.setup()

  // Expand and check
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Expand Pasta/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))
  await user.click(screen.getByLabelText('Pasta'))

  // Done and Cancel are enabled
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /done/i })).not.toBeDisabled()
  })

  // Collapse the recipe
  await user.click(screen.getByRole('button', { name: /Collapse Pasta/i }))

  // Done and Cancel remain enabled (check state persists)
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /done/i })).not.toBeDisabled()
  })
})
```

**Step 2: Run tests**

```bash
pnpm test src/routes/cooking.test.tsx
```

Expected: all pass.

**Step 3: Run full test suite**

```bash
pnpm test
```

Expected: no regressions.

**Step 4: Commit**

```bash
git add src/routes/cooking.test.tsx
git commit -m "test(cooking): add tri-state checkbox and expand/collapse persistence tests"
```

---

### Task 6: Final check

**Step 1: Run all tests**

```bash
pnpm test
```

Expected: all pass, no regressions.

**Step 2: Run lint**

```bash
pnpm lint
```

Fix any issues, then commit if needed.
