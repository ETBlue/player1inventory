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
      .map(([itemId, amount]) => {
        const item = items.find((i) => i.id === itemId)
        if (!item) return null
        const available = getCurrentQuantity(item)
        if (available >= amount) return null
        return {
          item,
          requested: amount,
          available,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
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
    <div>
      <Toolbar className="justify-between">
        <div className="flex items-center gap-2">
          <Button
            disabled={!anyChecked}
            onClick={() => setShowDoneDialog(true)}
          >
            Done
          </Button>
          <Button
            variant="neutral-ghost"
            disabled={!anyChecked}
            onClick={() => setShowCancelDialog(true)}
          >
            Cancel
          </Button>
        </div>
        <Button
          variant="neutral-outline"
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
        <div className="space-y-px pb-4">
          {sortedRecipes.map((recipe) => {
            const isChecked = checkedRecipeIds.has(recipe.id)
            const recipeAmounts = sessionAmounts.get(recipe.id)

            return (
              <Card key={recipe.id}>
                <CardContent>
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
