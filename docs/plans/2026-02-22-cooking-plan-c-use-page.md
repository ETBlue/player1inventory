# Cooking Feature — Plan C: Use Page + Navigation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the "Use" page at `/cooking` with recipe selection, inline amount adjustment, and confirmed bulk consumption, plus a 4th bottom navigation item.

**Architecture:** `/cooking` is a standalone route. State is pure React (`useState`) — no persistence needed (session-scoped selections). Consumption: clone item → `consumeItem(clone, amount)` → `updateItem(packedQuantity, unpackedQuantity)` + `addInventoryLog(delta: -amount, note: 'consumed via recipe')`. Navigation: add `UtensilsCrossed` icon to `Navigation.tsx`.

**Tech Stack:** TanStack Router, TanStack Query, React 19, `consumeItem` from `@/lib/quantityUtils`, `useUpdateItem` + `useAddInventoryLog` + `useUpdateRecipe` hooks, Vitest + React Testing Library

**Prerequisite:** Plans A and B must be complete before starting Plan C.

**Key consumption facts from existing code:**
- Pantry `onConsume`: clones item, calls `consumeItem(clone, amount)`, then `updateItem({ packedQuantity, unpackedQuantity })` — **no log entry** is created
- For cooking, we explicitly DO add a log entry (as per design) with `delta: -amount`
- `useAddInventoryLog` and `useUpdateItem` hooks are both already available

---

### Task 1: Add "Use" nav item to Navigation

**Files:**
- Modify: `src/components/Navigation.tsx`

**Step 1: Add `UtensilsCrossed` to the lucide-react import**

Find:
```ts
import { Home, Settings, ShoppingCart } from 'lucide-react'
```

Replace with:
```ts
import { Home, Settings, ShoppingCart, UtensilsCrossed } from 'lucide-react'
```

**Step 2: Add the "Use" nav item between Shopping and Settings**

Find:
```ts
const navItems = [
  { to: '/', label: 'Pantry', icon: Home },
  { to: '/shopping', label: 'Cart', icon: ShoppingCart },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const
```

Replace with:
```ts
const navItems = [
  { to: '/', label: 'Pantry', icon: Home },
  { to: '/shopping', label: 'Cart', icon: ShoppingCart },
  { to: '/cooking', label: 'Use', icon: UtensilsCrossed },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const
```

**Step 3: Verify build**

Run: `pnpm build 2>&1 | head -20`
Expected: No errors. (The `/cooking` route doesn't exist yet — router may warn but shouldn't break build.)

**Step 4: Commit**

```bash
git add src/components/Navigation.tsx
git commit -m "feat(cooking): add Use nav item to bottom navigation"
```

---

### Task 2: Create the Use page route

**Files:**
- Create: `src/routes/cooking.tsx`

**Step 1: Create the route file**

This is the most complex component in the feature. Read carefully before implementing.

**State:**
- `checkedRecipeIds: Set<string>` — which recipes are currently selected
- `sessionAmounts: Map<recipeId, Map<itemId, number>>` — per-recipe per-item consumption amounts (populated from `recipe.items[].defaultAmount` when recipe is checked)
- `showDoneDialog: boolean` — confirmation dialog for Done
- `showCancelDialog: boolean` — confirmation dialog for Cancel

**On recipe check:** populate `sessionAmounts[recipe.id]` with `{ itemId → defaultAmount }` for all items in that recipe.

**On recipe uncheck:** remove `sessionAmounts[recipe.id]` and remove recipe from `checkedRecipeIds`.

**On Done confirm:** for each checked recipe, aggregate total amounts per item (skip amount=0 items), then for each item: clone → `consumeItem(clone, total)` → `updateItem` → `addInventoryLog(delta: -total, note: 'consumed via recipe')`. Then reset all state.

**On Cancel confirm:** clear all state.

**Insufficient stock warning:** before the Done dialog, compute which items will go below 0 and show them in the dialog body. User can still confirm.

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Minus, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Toolbar } from '@/components/Toolbar'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { useAddInventoryLog, useItems, useUpdateItem } from '@/hooks'
import { useRecipes } from '@/hooks/useRecipes'
import { consumeItem, getCurrentQuantity } from '@/lib/quantityUtils'

export const Route = createFileRoute('/cooking')({
  component: CookingPage,
})

function CookingPage() {
  const navigate = useNavigate()
  const { data: recipes = [] } = useRecipes()
  const { data: items = [] } = useItems()
  const updateItem = useUpdateItem()
  const addInventoryLog = useAddInventoryLog()

  // recipeId -> (itemId -> currentAmount)
  const [sessionAmounts, setSessionAmounts] = useState<
    Map<string, Map<string, number>>
  >(new Map())
  const [checkedRecipeIds, setCheckedRecipeIds] = useState<Set<string>>(
    new Set(),
  )
  const [showDoneDialog, setShowDoneDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  const sortedRecipes = useMemo(
    () =>
      [...recipes].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    [recipes],
  )

  const handleToggleRecipe = (recipeId: string) => {
    const recipe = recipes.find((r) => r.id === recipeId)
    if (!recipe) return

    if (checkedRecipeIds.has(recipeId)) {
      // Uncheck: remove from state
      const newAmounts = new Map(sessionAmounts)
      newAmounts.delete(recipeId)
      setSessionAmounts(newAmounts)

      const newChecked = new Set(checkedRecipeIds)
      newChecked.delete(recipeId)
      setCheckedRecipeIds(newChecked)
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
  }

  const handleAdjustAmount = (
    recipeId: string,
    itemId: string,
    delta: number,
  ) => {
    const newAmounts = new Map(sessionAmounts)
    const recipeAmounts = new Map(newAmounts.get(recipeId) ?? [])
    const current = recipeAmounts.get(itemId) ?? 0
    const item = items.find((i) => i.id === itemId)
    const step = (item?.consumeAmount ?? 0) > 0 ? (item?.consumeAmount ?? 1) : 1
    const next = Math.max(0, current + delta * step)
    recipeAmounts.set(itemId, next)
    newAmounts.set(recipeId, recipeAmounts)
    setSessionAmounts(newAmounts)
  }

  // Aggregate total amounts per item across all checked recipes
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

  // Items that would go below 0 after consumption
  const insufficientItems = useMemo(() => {
    return Array.from(totalByItemId.entries())
      .filter(([itemId, amount]) => {
        const item = items.find((i) => i.id === itemId)
        if (!item) return false
        return getCurrentQuantity(item) < amount
      })
      .map(([itemId, amount]) => {
        const item = items.find((i) => i.id === itemId)!
        return {
          item,
          requested: amount,
          available: getCurrentQuantity(item),
        }
      })
  }, [totalByItemId, items])

  const handleConfirmDone = async () => {
    const now = new Date()

    for (const [itemId, totalAmount] of totalByItemId) {
      const item = items.find((i) => i.id === itemId)
      if (!item) continue

      const updatedItem = { ...item }
      consumeItem(updatedItem, totalAmount)

      await updateItem.mutateAsync({
        id: itemId,
        updates: {
          packedQuantity: updatedItem.packedQuantity,
          unpackedQuantity: updatedItem.unpackedQuantity,
        },
      })

      await addInventoryLog.mutateAsync({
        itemId,
        delta: -totalAmount,
        occurredAt: now,
        note: 'consumed via recipe',
      })
    }

    // Reset state
    setCheckedRecipeIds(new Set())
    setSessionAmounts(new Map())
    setShowDoneDialog(false)
  }

  const handleConfirmCancel = () => {
    setCheckedRecipeIds(new Set())
    setSessionAmounts(new Map())
    setShowCancelDialog(false)
  }

  const anyChecked = checkedRecipeIds.size > 0

  return (
    <div className="space-y-4">
      <Toolbar className="justify-between">
        <div className="flex items-center gap-2">
          <Button
            disabled={!anyChecked}
            onClick={() => setShowDoneDialog(true)}
          >
            Done
          </Button>
          <Button
            variant="neutral-outline"
            disabled={!anyChecked}
            onClick={() => setShowCancelDialog(true)}
          >
            Cancel
          </Button>
        </div>
        <Button
          variant="neutral-ghost"
          onClick={() => navigate({ to: '/settings/recipes/new' })}
        >
          <Plus className="h-4 w-4" />
          New Recipe
        </Button>
      </Toolbar>

      {sortedRecipes.length === 0 ? (
        <p className="text-foreground-muted text-sm px-4">
          No recipes yet. Create your first recipe to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {sortedRecipes.map((recipe) => {
            const isChecked = checkedRecipeIds.has(recipe.id)
            const recipeAmounts = sessionAmounts.get(recipe.id)

            return (
              <Card key={recipe.id}>
                <CardContent className="p-4 space-y-3">
                  {/* Recipe header row */}
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id={`recipe-${recipe.id}`}
                      checked={isChecked}
                      onCheckedChange={() => handleToggleRecipe(recipe.id)}
                      aria-label={recipe.name}
                    />
                    <button
                      type="button"
                      className="flex-1 text-left font-medium hover:underline"
                      onClick={() =>
                        navigate({
                          to: '/settings/recipes/$id',
                          params: { id: recipe.id },
                        })
                      }
                    >
                      {recipe.name}
                    </button>
                    {!isChecked && (
                      <span className="text-sm text-foreground-muted">
                        {recipe.items.length} item
                        {recipe.items.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

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
                        const amount = recipeAmounts.get(ri.itemId) ?? ri.defaultAmount
                        const step =
                          (item.consumeAmount ?? 0) > 0
                            ? (item.consumeAmount ?? 1)
                            : 1
                        const unit =
                          item.targetUnit === 'measurement'
                            ? (item.measurementUnit ?? '')
                            : (item.packageUnit ?? '')

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
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Done Confirmation Dialog */}
      <AlertDialog open={showDoneDialog} onOpenChange={setShowDoneDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Consume from {checkedRecipeIds.size} recipe
              {checkedRecipeIds.size !== 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will reduce your inventory.
              {insufficientItems.length > 0 && (
                <span className="block mt-2 text-destructive">
                  Warning — insufficient stock:
                  {insufficientItems.map(({ item, requested, available }) => (
                    <span key={item.id} className="block">
                      {item.name}: {requested} requested, {available} available
                    </span>
                  ))}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDone}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard all selections?</AlertDialogTitle>
            <AlertDialogDescription>
              All recipe selections and amount adjustments will be reset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

**Step 2: Regenerate route tree**

```bash
pnpm exec tsr generate
```

**Step 3: Verify build**

Run: `pnpm build 2>&1 | head -20`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/routes/cooking.tsx src/routeTree.gen.ts
git commit -m "feat(cooking): add Use page with recipe selection and consumption"
```

---

### Task 3: Write tests for the Use page

**Files:**
- Create: `src/routes/cooking.test.tsx`

**Step 1: Create the test file**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem, createRecipe } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Use (Cooking) Page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.recipes.clear()
    await db.inventoryLogs.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    sessionStorage.clear()
  })

  const renderPage = () => {
    const history = createMemoryHistory({ initialEntries: ['/cooking'] })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  const makeItem = (name: string, consumeAmount = 1, packedQuantity = 5) =>
    createItem({
      name,
      targetUnit: 'package',
      targetQuantity: 10,
      refillThreshold: 2,
      packedQuantity,
      unpackedQuantity: 0,
      consumeAmount,
      tagIds: [],
    })

  it('user can see the empty state when no recipes exist', async () => {
    // Given no recipes
    renderPage()

    // Then the empty state is shown
    await waitFor(() => {
      expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument()
    })
  })

  it('user can see the recipe list', async () => {
    // Given two recipes exist
    await createRecipe({ name: 'Pasta Dinner' })
    await createRecipe({ name: 'Omelette' })

    renderPage()

    // Then both recipes appear
    await waitFor(() => {
      expect(screen.getByText('Pasta Dinner')).toBeInTheDocument()
      expect(screen.getByText('Omelette')).toBeInTheDocument()
    })
  })

  it('Done and Cancel buttons are disabled when no recipes are checked', async () => {
    // Given a recipe exists
    await createRecipe({ name: 'Pasta' })

    renderPage()

    // Then Done and Cancel are disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
    })
  })

  it('user can check a recipe and see item amounts expanded', async () => {
    // Given a recipe with an item
    const item = await makeItem('Flour', 2)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 4 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user checks the recipe
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    // Then the item list is expanded with its default amount
    await waitFor(() => {
      expect(screen.getByText('Flour')).toBeInTheDocument()
      expect(screen.getByText(/4/)).toBeInTheDocument()
    })
  })

  it('Done and Cancel buttons become enabled when a recipe is checked', async () => {
    // Given a recipe exists
    await createRecipe({ name: 'Pasta' })

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
      expect(
        screen.getByRole('button', { name: /cancel/i }),
      ).not.toBeDisabled()
    })
  })

  it('user can adjust item amount with + button', async () => {
    // Given a recipe with an item (consumeAmount = 2, defaultAmount = 4)
    const item = await makeItem('Flour', 2)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 4 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user checks the recipe
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    // And clicks the + button for Flour
    await waitFor(() => {
      expect(screen.getByLabelText('Increase Flour')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Increase Flour'))

    // Then the amount increases by consumeAmount (4 + 2 = 6)
    await waitFor(() => {
      expect(screen.getByText(/6/)).toBeInTheDocument()
    })
  })

  it('user can adjust item amount down to 0 with - button', async () => {
    // Given a recipe with an item (consumeAmount = 2, defaultAmount = 2)
    const item = await makeItem('Flour', 2)
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

    // And clicks the - button
    await waitFor(() => {
      expect(screen.getByLabelText('Decrease Flour')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Decrease Flour'))

    // Then the amount is 0 (not negative)
    await waitFor(() => {
      expect(screen.getByText(/^0/)).toBeInTheDocument()
    })
  })

  it('user can confirm consumption and inventory is reduced', async () => {
    // Given a recipe with an item (packedQuantity = 5)
    const item = await makeItem('Flour', 1, 5)
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

    // And clicks Done
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).not.toBeDisabled()
    })
    await user.click(screen.getByRole('button', { name: /done/i }))

    // Then the confirmation dialog appears
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /consume from 1 recipe/i }),
      ).toBeInTheDocument()
    })

    // When user confirms
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    // Then the item's quantity is reduced in the database
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      // packedQuantity = 5, defaultAmount = 2, consumeItem reduces unpackedQuantity
      // Since unpackedQuantity = 0 and packedQuantity = 5:
      // consumeItem opens packages: 5 - ceil(2) = 5 - 2 = 3 packed, unpackedQuantity = 2 - 2 = 0
      expect(updated).toBeDefined()
      const total =
        (updated?.packedQuantity ?? 0) + (updated?.unpackedQuantity ?? 0)
      expect(total).toBeLessThan(5) // Some quantity was consumed
    })

    // And a log entry is created
    await waitFor(async () => {
      const logs = await db.inventoryLogs
        .filter((l) => l.itemId === item.id)
        .toArray()
      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0].note).toBe('consumed via recipe')
      expect(logs[0].delta).toBeLessThan(0)
    })

    // And the recipes are deselected (Done/Cancel disabled again)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).toBeDisabled()
    })
  })

  it('user can cancel and selections are cleared', async () => {
    // Given a recipe that is checked
    await createRecipe({ name: 'Pasta' })

    renderPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /cancel/i }),
      ).not.toBeDisabled()
    })

    // When user clicks Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Then the confirmation dialog appears
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /discard all selections/i }),
      ).toBeInTheDocument()
    })

    // When user confirms
    await user.click(screen.getByRole('button', { name: /discard/i }))

    // Then all recipes are deselected
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
    })
  })

  it('items with amount=0 are skipped on consumption', async () => {
    // Given a recipe with one item, defaultAmount = 2
    const item = await makeItem('Flour', 2, 5)
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

    // And decrements the amount to 0
    await waitFor(() => {
      expect(screen.getByLabelText('Decrease Flour')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Decrease Flour'))

    // And confirms Done
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).not.toBeDisabled()
    })
    await user.click(screen.getByRole('button', { name: /done/i }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /confirm/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    // Then the item's quantity is NOT reduced (amount was 0)
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.packedQuantity).toBe(5) // unchanged
    })

    // And no log entry is created
    const logs = await db.inventoryLogs
      .filter((l) => l.itemId === item.id)
      .toArray()
    expect(logs).toHaveLength(0)
  })
})
```

**Step 2: Run tests**

```bash
pnpm test src/routes/cooking.test.tsx 2>&1 | tail -30
```
Expected: All tests PASS.

**Step 3: Run full test suite**

```bash
pnpm test 2>&1 | tail -10
```
Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/routes/cooking.test.tsx
git commit -m "feat(cooking): add Use page integration tests"
```

---

### Task 4: Export useRecipes from hooks index (optional cleanup)

**Files:**
- Modify: `src/hooks/index.ts`

Currently `useRecipes` is imported directly from `@/hooks/useRecipes` (not re-exported from `@/hooks`). If you want consistency with the other hooks, add:

```ts
export * from './useRecipes'
```

to `src/hooks/index.ts`.

This is optional — the feature works either way. Add it only if it improves consistency with the rest of the codebase.

**Step 1: Check if other hooks follow this pattern**

Read `src/hooks/index.ts`. If all hooks are re-exported from index, add useRecipes. If some are not (e.g., `useVendors` is imported directly in routes), leave it as-is.

Looking at the current `src/hooks/index.ts`, it does NOT include `useVendors`. Routes import `useVendors` directly from `@/hooks/useVendors`. So skip this task — keep the same pattern.

---

### Plan C Complete

Run the full test suite one final time:

```bash
pnpm test 2>&1 | tail -10
```

Expected: All tests pass. The cooking feature is complete:
- ✅ Bottom nav has 4 items: Pantry | Shopping | Use | Settings
- ✅ `/cooking` shows all recipes, supports selection and amount adjustment
- ✅ Done confirms and reduces inventory + creates log entries
- ✅ Cancel resets all selections
- ✅ `/settings/recipes` manages recipe CRUD
- ✅ Recipe detail has Info tab (edit name) and Items tab (manage items + defaultAmount)
- ✅ All operations cascade correctly (deleteItem removes from recipes)
