import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import React, { useMemo, useState } from 'react'
import { ItemCard } from '@/components/ItemCard'
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
import {
  useAddInventoryLog,
  useItems,
  useTags,
  useTagTypes,
  useUpdateItem,
} from '@/hooks'
import { useItemSortData } from '@/hooks/useItemSortData'
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
  // tags and tagTypes are passed to ItemCard for API consistency;
  // tag badges are suppressed in cooking mode by ItemCard itself
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()

  // recipeId -> (itemId -> currentAmount)
  const [sessionAmounts, setSessionAmounts] = useState<
    Map<string, Map<string, number>>
  >(new Map())
  const [expandedRecipeIds, setExpandedRecipeIds] = useState<Set<string>>(
    new Set(),
  )
  const [sessionServings, setSessionServings] = useState<Map<string, number>>(
    new Map(),
  )
  // Map<recipeId, Set<itemId>> — tracks which items are included per recipe
  const [checkedItemIds, setCheckedItemIds] = useState<
    Map<string, Set<string>>
  >(new Map())
  const [showDoneDialog, setShowDoneDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  const { expiryDates } = useItemSortData(items)

  const sortedRecipes = useMemo(
    () =>
      [...recipes].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    [recipes],
  )

  // Initializes amounts and servings for a recipe (idempotent — no-op if already initialized)
  const initializeAmountsAndServings = (
    recipeId: string,
    recipe: (typeof recipes)[0],
    currentAmounts: Map<string, Map<string, number>>,
    currentServings: Map<string, number>,
  ) => {
    if (currentAmounts.has(recipeId)) {
      return { amounts: currentAmounts, servings: currentServings }
    }
    const recipeAmountMap = new Map<string, number>()
    for (const ri of recipe.items) {
      recipeAmountMap.set(ri.itemId, ri.defaultAmount)
    }
    return {
      amounts: new Map(currentAmounts).set(recipeId, recipeAmountMap),
      servings: new Map(currentServings).set(recipeId, 1),
    }
  }

  // Returns the default checked item set for a recipe (items with defaultAmount > 0)
  const getDefaultCheckedItems = (recipe: (typeof recipes)[0]): Set<string> => {
    const set = new Set<string>()
    for (const ri of recipe.items) {
      if (ri.defaultAmount > 0) set.add(ri.itemId)
    }
    return set
  }

  const handleToggleExpand = (recipeId: string) => {
    const recipe = recipes.find((r) => r.id === recipeId)
    if (!recipe) return

    const newExpanded = new Set(expandedRecipeIds)
    if (newExpanded.has(recipeId)) {
      newExpanded.delete(recipeId)
      setExpandedRecipeIds(newExpanded)
      return
    }

    // Expanding — initialize amounts/servings if first time (checkedItemIds untouched)
    newExpanded.add(recipeId)
    const { amounts, servings } = initializeAmountsAndServings(
      recipeId,
      recipe,
      sessionAmounts,
      sessionServings,
    )
    setExpandedRecipeIds(newExpanded)
    setSessionAmounts(amounts)
    setSessionServings(servings)
  }

  const handleToggleRecipeCheckbox = (recipeId: string) => {
    const recipe = recipes.find((r) => r.id === recipeId)
    if (!recipe) return

    // Initialize amounts/servings if first time interacting
    const { amounts, servings } = initializeAmountsAndServings(
      recipeId,
      recipe,
      sessionAmounts,
      sessionServings,
    )
    setSessionAmounts(amounts)
    setSessionServings(servings)

    // Derive current check state using the same tri-state logic as the render
    const currentChecked = checkedItemIds.get(recipeId) ?? new Set()
    const checkedCount = currentChecked.size
    const totalItemCount = recipe.items.length
    const currentCheckState: boolean | 'indeterminate' =
      totalItemCount === 0
        ? false
        : checkedCount === 0
          ? false
          : checkedCount === totalItemCount
            ? true
            : 'indeterminate'

    const updatedItemIds = new Map(checkedItemIds)
    // When fully checked → uncheck all; otherwise (unchecked or indeterminate) → check default items
    if (currentCheckState === true) {
      updatedItemIds.set(recipeId, new Set())
    } else {
      updatedItemIds.set(recipeId, getDefaultCheckedItems(recipe))
    }
    setCheckedItemIds(updatedItemIds)
  }

  const handleAdjustServings = (recipeId: string, delta: number) => {
    const current = sessionServings.get(recipeId) ?? 1
    const next = Math.max(1, current + delta)
    setSessionServings(new Map(sessionServings).set(recipeId, next))
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

  // Aggregate total amounts per item across all checked recipes
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
    setExpandedRecipeIds(new Set())
    setSessionServings(new Map())
    setSessionAmounts(new Map())
    setCheckedItemIds(new Map())
    setShowDoneDialog(false)
  }

  const handleConfirmCancel = () => {
    setExpandedRecipeIds(new Set())
    setSessionServings(new Map())
    setSessionAmounts(new Map())
    setCheckedItemIds(new Map())
    setShowCancelDialog(false)
  }

  const anyChecked = [...checkedItemIds.values()].some((set) => set.size > 0)
  const recipesBeingConsumed = [...checkedItemIds.values()].filter(
    (set) => set.size > 0,
  ).length

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
          size="icon"
          onClick={() => navigate({ to: '/settings/recipes/new' })}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </Toolbar>

      {sortedRecipes.length === 0 ? (
        <p className="text-foreground-muted text-sm px-4">
          No recipes yet. Create your first recipe to get started.
        </p>
      ) : (
        <div className="space-y-px pb-4">
          {sortedRecipes.map((recipe) => {
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

            return (
              <React.Fragment key={recipe.id}>
                <Card>
                  <CardContent className="p-0">
                    {/* Row 1: checkbox | [name ··· chevron] | [serving stepper] */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Checkbox
                        id={`recipe-${recipe.id}`}
                        checked={recipeCheckState}
                        onCheckedChange={() =>
                          handleToggleRecipeCheckbox(recipe.id)
                        }
                        aria-label={recipe.name}
                      />
                      <button
                        type="button"
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${recipe.name}`}
                        className="flex-1 flex items-center justify-between text-left font-medium capitalize"
                        onClick={() => handleToggleExpand(recipe.id)}
                      >
                        {/* biome-ignore lint/a11y/noStaticElementInteractions: name click navigates independently from the expand button */}
                        {/* biome-ignore lint/a11y/useKeyWithClickEvents: name click navigates independently from the expand button */}
                        <span
                          className="hover:underline cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate({
                              to: '/settings/recipes/$id',
                              params: { id: recipe.id },
                            })
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
                      {/* Serving stepper — always reserved, empty when no items checked */}
                      <div className="flex items-center gap-1 w-20 justify-end">
                        {recipeCheckState !== false && (
                          <>
                            <Button
                              variant="neutral-outline"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="Decrease servings"
                              onClick={() =>
                                handleAdjustServings(recipe.id, -1)
                              }
                              disabled={
                                (sessionServings.get(recipe.id) ?? 1) <= 1
                              }
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
                              aria-label="Increase servings"
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
                </Card>
                {isExpanded && recipeAmounts && (
                  <div className="space-y-px">
                    {recipe.items.length === 0 && (
                      <p className="text-sm text-foreground-muted px-4">
                        No items in this recipe.
                      </p>
                    )}
                    {[...recipe.items]
                      .sort((a, b) => {
                        const dateA = expiryDates?.get(a.itemId)
                        const dateB = expiryDates?.get(b.itemId)
                        if (!dateA && !dateB) return 0
                        if (!dateA) return 1
                        if (!dateB) return -1
                        return dateA.getTime() - dateB.getTime()
                      })
                      .map((ri) => {
                        const item = items.find((i) => i.id === ri.itemId)
                        if (!item) return null
                        const itemTags = tags.filter((t) =>
                          item.tagIds.includes(t.id),
                        )
                        const amount =
                          recipeAmounts.get(ri.itemId) ?? ri.defaultAmount
                        // checkedItemIds is always populated when recipe is initialized (see initializeRecipe)
                        // ?? true is a safety fallback in case this invariant ever breaks
                        const isItemChecked =
                          checkedItemIds.get(recipe.id)?.has(ri.itemId) ?? true

                        return (
                          <div
                            key={ri.itemId}
                            className={
                              isItemChecked ? 'bg-background-surface' : ''
                            }
                          >
                            <ItemCard
                              item={item}
                              tags={itemTags}
                              tagTypes={tagTypes}
                              mode="cooking"
                              showTags={false}
                              showTagSummary={false}
                              isChecked={isItemChecked}
                              onCheckboxToggle={() =>
                                handleToggleItem(recipe.id, ri.itemId)
                              }
                              controlAmount={amount}
                              onAmountChange={(delta) =>
                                handleAdjustAmount(recipe.id, ri.itemId, delta)
                              }
                            />
                          </div>
                        )
                      })}
                  </div>
                )}
              </React.Fragment>
            )
          })}
        </div>
      )}

      {/* Done Confirmation Dialog */}
      <AlertDialog open={showDoneDialog} onOpenChange={setShowDoneDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Consume from {recipesBeingConsumed} recipe
              {recipesBeingConsumed !== 1 ? 's' : ''}?
            </AlertDialogTitle>
          </AlertDialogHeader>
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
          </AlertDialogHeader>
          <AlertDialogDescription>
            All recipe selections and amount adjustments will be reset.
          </AlertDialogDescription>
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
