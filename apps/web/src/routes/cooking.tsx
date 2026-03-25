import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Check, ChevronDown, ChevronLeft, Minus, Plus, X } from 'lucide-react'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemCard } from '@/components/item/ItemCard'
import { CookingControlBar } from '@/components/recipe/CookingControlBar'
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
import { useRecipes, useUpdateRecipeLastCookedAt } from '@/hooks/useRecipes'
import {
  consumeItem,
  getCurrentQuantity,
  getPackedTotal,
  roundToStep,
} from '@/lib/quantityUtils'

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-100 dark:bg-yellow-800 rounded-sm not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export const Route = createFileRoute('/cooking')({
  component: CookingPage,
  validateSearch: (search: Record<string, unknown>) => ({
    sort:
      search.sort === 'recent' || search.sort === 'count'
        ? (search.sort as 'recent' | 'count')
        : ('name' as const),
    dir: search.dir === 'desc' ? ('desc' as const) : ('asc' as const),
    q: typeof search.q === 'string' ? search.q : '',
    expanded: typeof search.expanded === 'string' ? search.expanded : '',
  }),
})

function CookingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { sort, dir, q, expanded } = Route.useSearch()
  const { data: recipes = [] } = useRecipes()
  const { data: items = [] } = useItems()
  const updateItem = useUpdateItem()
  const addInventoryLog = useAddInventoryLog()
  const updateRecipeLastCookedAt = useUpdateRecipeLastCookedAt()
  // tags and tagTypes are passed to ItemCard for API consistency;
  // tag badges are suppressed in cooking mode by ItemCard itself
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()

  // recipeId -> (itemId -> currentAmount)
  const [sessionAmounts, setSessionAmounts] = useState<
    Map<string, Map<string, number>>
  >(new Map())
  const expandedRecipeIds = useMemo(
    () => new Set(expanded ? expanded.split(',') : []),
    [expanded],
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

  const sortedRecipes = useMemo(() => {
    const sorted = [...recipes].sort((a, b) => {
      if (sort === 'recent') {
        // Undefined (never cooked) always sorts last regardless of direction
        if (!a.lastCookedAt && !b.lastCookedAt) return 0
        if (!a.lastCookedAt) return 1
        if (!b.lastCookedAt) return -1
        const aTime = a.lastCookedAt.getTime()
        const bTime = b.lastCookedAt.getTime()
        // asc = most recently cooked first (mirrors "Expiring" where asc = soonest first)
        return dir === 'asc' ? bTime - aTime : aTime - bTime
      }
      if (sort === 'count') {
        const diff = a.items.length - b.items.length
        return dir === 'asc' ? diff : -diff
      }
      // Default: name
      const cmp = a.name.localeCompare(b.name, undefined, {
        sensitivity: 'base',
      })
      return dir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [recipes, sort, dir])

  const lowerQuery = q.toLowerCase().trim()

  const displayRecipes = lowerQuery
    ? sortedRecipes.filter((recipe) => {
        const titleMatch = recipe.name.toLowerCase().includes(lowerQuery)
        const itemMatch = recipe.items.some((ri) => {
          const item = items.find((i) => i.id === ri.itemId)
          return item?.name.toLowerCase().includes(lowerQuery)
        })
        return titleMatch || itemMatch
      })
    : sortedRecipes

  const getSearchMatchedItemIds = (
    recipe: (typeof recipes)[0],
  ): Set<string> | null => {
    if (!lowerQuery) return null
    const matched = recipe.items
      .filter((ri) => {
        const item = items.find((i) => i.id === ri.itemId)
        return item?.name.toLowerCase().includes(lowerQuery)
      })
      .map((ri) => ri.itemId)
    return matched.length > 0 ? new Set(matched) : null
  }

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

    const newSet = new Set(expandedRecipeIds)
    if (newSet.has(recipeId)) {
      newSet.delete(recipeId)
      navigate({
        to: '/cooking',
        search: (prev) => ({
          sort: prev.sort ?? 'name',
          dir: prev.dir ?? 'asc',
          q: prev.q ?? '',
          expanded: [...newSet].join(','),
        }),
        replace: true,
      })
      return
    }

    // Expanding — initialize amounts/servings if first time (checkedItemIds untouched)
    newSet.add(recipeId)
    const { amounts, servings } = initializeAmountsAndServings(
      recipeId,
      recipe,
      sessionAmounts,
      sessionServings,
    )
    navigate({
      to: '/cooking',
      search: (prev) => ({
        sort: prev.sort ?? 'name',
        dir: prev.dir ?? 'asc',
        q: prev.q ?? '',
        expanded: [...newSet].join(','),
      }),
      replace: true,
    })
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

    // Toggle based on default items (defaultAmount > 0); fall back to all items if none have defaults
    const currentChecked = checkedItemIds.get(recipeId) ?? new Set()
    const defaultItems = recipe.items.filter((ri) => ri.defaultAmount > 0)
    const effectiveItems = defaultItems.length > 0 ? defaultItems : recipe.items
    const allEffectiveChecked =
      effectiveItems.length > 0 &&
      effectiveItems.every((ri) => currentChecked.has(ri.itemId))

    const updatedItemIds = new Map(checkedItemIds)
    if (allEffectiveChecked) {
      // All effective items checked → uncheck all
      updatedItemIds.set(recipeId, new Set())
    } else {
      // Some or none checked → check all effective items
      const toCheck =
        defaultItems.length > 0
          ? getDefaultCheckedItems(recipe)
          : new Set(recipe.items.map((ri) => ri.itemId))
      updatedItemIds.set(recipeId, toCheck)
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
    const next = roundToStep(Math.max(0, current + delta * step), step)
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

    // Build item → contributing recipe names for log notes
    const recipeNamesByItemId = new Map<string, string[]>()
    for (const [recipeId, itemSet] of checkedItemIds) {
      const recipe = recipes.find((r) => r.id === recipeId)
      if (!recipe) continue
      for (const itemId of itemSet) {
        const names = recipeNamesByItemId.get(itemId) ?? []
        names.push(recipe.name)
        recipeNamesByItemId.set(itemId, names)
      }
    }

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

      const recipeNames = recipeNamesByItemId.get(itemId) ?? []
      const note =
        recipeNames.length > 0
          ? t('cooking.log.consumedVia', { recipes: recipeNames.join(', ') })
          : t('cooking.log.consumedViaRecipe')

      await addInventoryLog.mutateAsync({
        itemId,
        delta: -totalAmount,
        quantity: getPackedTotal(updatedItem), // post-consumption packed total
        occurredAt: now,
        note,
      })
    }

    // Record lastCookedAt for each recipe that had items checked
    const cookedRecipeIds = [...checkedItemIds.entries()]
      .filter(([, itemSet]) => itemSet.size > 0)
      .map(([recipeId]) => recipeId)
    await Promise.all(
      cookedRecipeIds.map((id) => updateRecipeLastCookedAt.mutateAsync(id)),
    )

    // Reset session state (expand/collapse is preserved)
    setSessionServings(new Map())
    setSessionAmounts(new Map())
    setCheckedItemIds(new Map())
    setShowDoneDialog(false)
  }

  const handleConfirmCancel = () => {
    // Reset session state (expand/collapse is preserved)
    setSessionServings(new Map())
    setSessionAmounts(new Map())
    setCheckedItemIds(new Map())
    setShowCancelDialog(false)
  }

  const anyChecked = [...checkedItemIds.values()].some((set) => set.size > 0)
  const recipesBeingConsumed = [...checkedItemIds.values()].filter(
    (set) => set.size > 0,
  ).length
  const selectedRecipeNames = [...checkedItemIds.entries()]
    .filter(([, set]) => set.size > 0)
    .map(([recipeId]) => recipes.find((r) => r.id === recipeId)?.name ?? '')
    .filter(Boolean)
  const totalServings = [...checkedItemIds.entries()]
    .filter(([, set]) => set.size > 0)
    .reduce((sum, [recipeId]) => sum + (sessionServings.get(recipeId) ?? 1), 0)

  return (
    <div>
      <Toolbar className="justify-between">
        <span className="flex-1">
          {t('cooking.toolbar.servingCount', { count: totalServings })}
        </span>
        {anyChecked && (
          <Button
            variant="destructive-ghost"
            onClick={() => setShowCancelDialog(true)}
          >
            <X /> {t('common.cancel')}
          </Button>
        )}
        <Button disabled={!anyChecked} onClick={() => setShowDoneDialog(true)}>
          <Check /> {t('common.done')}
        </Button>
      </Toolbar>

      <CookingControlBar
        allExpanded={
          recipes.length > 0 && expandedRecipeIds.size === recipes.length
        }
        onExpandAll={() =>
          navigate({
            to: '/cooking',
            search: (prev) => ({
              sort: prev.sort ?? 'name',
              dir: prev.dir ?? 'asc',
              q: prev.q ?? '',
              expanded: recipes.map((r) => r.id).join(','),
            }),
            replace: true,
          })
        }
        onCollapseAll={() =>
          navigate({
            to: '/cooking',
            search: (prev) => ({
              sort: prev.sort ?? 'name',
              dir: prev.dir ?? 'asc',
              q: prev.q ?? '',
              expanded: '',
            }),
            replace: true,
          })
        }
      />
      <div className="h-px bg-accessory-default" />

      {sortedRecipes.length === 0 ? (
        <div className="text-center py-16 text-foreground-muted flex flex-col items-center gap-6">
          <div>
            <p>{t('cooking.empty.title')}</p>
            <p className="text-sm mt-1">{t('cooking.empty.description')}</p>
          </div>
          <Link to="/settings/recipes/new" search={{ name: '' }}>
            <Button size="lg" className="px-8">
              <Plus />
              {t('cooking.empty.createButton')}
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-px pb-4">
          {displayRecipes.map((recipe) => {
            const searchMatchedItemIds = getSearchMatchedItemIds(recipe)
            const isExpanded = searchMatchedItemIds
              ? true
              : expandedRecipeIds.has(recipe.id)
            const recipeAmounts = sessionAmounts.get(recipe.id)
            const checkedCount = checkedItemIds.get(recipe.id)?.size ?? 0
            const totalItemCount = recipe.items.length

            // Tri-state for recipe checkbox — based on default items (defaultAmount > 0);
            // falls back to all items when none have a default amount
            const defaultItemIds = new Set(
              recipe.items
                .filter((ri) => ri.defaultAmount > 0)
                .map((ri) => ri.itemId),
            )
            const effectiveItemIds =
              defaultItemIds.size > 0
                ? defaultItemIds
                : new Set(recipe.items.map((ri) => ri.itemId))
            const checkedEffectiveCount = [
              ...(checkedItemIds.get(recipe.id) ?? new Set()),
            ].filter((id) => effectiveItemIds.has(id)).length
            const recipeCheckState: boolean | 'indeterminate' =
              effectiveItemIds.size === 0
                ? false
                : checkedEffectiveCount === 0
                  ? false
                  : checkedEffectiveCount === effectiveItemIds.size
                    ? true
                    : 'indeterminate'

            return (
              <React.Fragment key={recipe.id}>
                <div
                  className={recipeCheckState ? 'bg-background-surface' : ''}
                >
                  <Card className="relative mr-28">
                    <CardContent>
                      {/* Row 1: checkbox | [name button] | [chevron button] | [serving stepper] */}
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`recipe-${recipe.id}`}
                          checked={recipeCheckState}
                          onCheckedChange={() =>
                            handleToggleRecipeCheckbox(recipe.id)
                          }
                          aria-label={recipe.name}
                        />
                        {/* Name: navigates to recipe detail */}
                        <button
                          type="button"
                          className="flex-1 text-left font-medium capitalize hover:underline truncate"
                          onClick={() =>
                            navigate({
                              to: '/settings/recipes/$id',
                              params: { id: recipe.id },
                            })
                          }
                        >
                          {highlight(recipe.name, q)}
                        </button>
                        {/* Chevron: toggles expand/collapse */}
                        <button
                          type="button"
                          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${recipe.name}`}
                          className="shrink-0 text-foreground-muted hover:text-foreground"
                          onClick={() => handleToggleExpand(recipe.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronLeft className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {/* Serving stepper — always reserved, empty when no items checked */}
                      {recipeCheckState !== false && (
                        <div className="flex items-center items-stretch absolute -right-26 top-1.5">
                          <Button
                            variant="neutral-outline"
                            className="rounded-tr-none rounded-br-none"
                            size="icon"
                            aria-label="Decrease servings"
                            onClick={() => handleAdjustServings(recipe.id, -1)}
                            disabled={
                              (sessionServings.get(recipe.id) ?? 1) <= 1
                            }
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="flex items-center justify-center text-sm text-center w-[2rem] border-b border-t border-accessory-emphasized">
                            {sessionServings.get(recipe.id) ?? 1}
                          </span>
                          <Button
                            variant="neutral-outline"
                            className="rounded-tl-none rounded-bl-none"
                            size="icon"
                            aria-label="Increase servings"
                            onClick={() => handleAdjustServings(recipe.id, 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      )}

                      {/* Row 2: subtitle */}
                      <div className="mx-6 text-sm text-foreground-muted">
                        {totalItemCount} item{totalItemCount !== 1 ? 's' : ''}
                        {checkedCount > 0
                          ? `, ${t('cooking.recipe.itemCount', { count: checkedCount })}`
                          : ''}
                        {recipeCheckState !== false
                          ? `, × ${sessionServings.get(recipe.id) ?? 1}`
                          : ''}
                      </div>
                    </CardContent>
                  </Card>
                </div>
                {isExpanded && (
                  <div className="space-y-px">
                    {recipe.items.length === 0 && (
                      <p className="text-sm text-foreground-muted px-4">
                        {t('cooking.recipe.noItems')}
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
                      .filter((ri) =>
                        searchMatchedItemIds
                          ? searchMatchedItemIds.has(ri.itemId)
                          : true,
                      )
                      .map((ri) => {
                        const item = items.find((i) => i.id === ri.itemId)
                        if (!item) return null
                        const itemTags = tags.filter((t) =>
                          item.tagIds.includes(t.id),
                        )
                        const amount =
                          recipeAmounts?.get(ri.itemId) ?? ri.defaultAmount
                        const isItemChecked =
                          checkedItemIds.get(recipe.id)?.has(ri.itemId) ?? false

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
                              highlightedName={
                                q ? highlight(item.name, q) : undefined
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
              {t('cooking.doneDialog.title', {
                count: recipesBeingConsumed,
                names: selectedRecipeNames.join(', '),
              })}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('cooking.doneDialog.description')}
            {insufficientItems.length > 0 && (
              <span className="block mt-2 text-destructive">
                {t('cooking.doneDialog.warningHeader')}
                {insufficientItems.map(({ item, requested, available }) => (
                  <span key={item.id} className="block">
                    {item.name}: {requested} {t('cooking.doneDialog.requested')}
                    , {available} {t('cooking.doneDialog.available')}
                  </span>
                ))}
              </span>
            )}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.back')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDone}>
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('cooking.cancelDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('cooking.cancelDialog.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.back')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel}>
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
