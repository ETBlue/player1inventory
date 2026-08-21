import { Link, useNavigate } from '@tanstack/react-router'
import { ChefHat, Lock, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GroupByToggle } from '@/components/shared/GroupByToggle'
import { GroupCard } from '@/components/shared/GroupCard'
import { ListSectionDivider } from '@/components/shared/ListSectionDivider'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { LocationSwitcher } from '@/components/shared/LocationSwitcher'
import { Toolbar } from '@/components/shared/Toolbar'
import { ViewToggle } from '@/components/shared/ViewToggle'
import { Button } from '@/components/ui/button'
import { useItems, useStockedItems } from '@/hooks'
import { useRecipes } from '@/hooks/useRecipes'
import {
  getItemPackUnits,
  isEmptyStock,
  isInactive,
  isLowStock,
} from '@/lib/quantityUtils'
import { setPantryView, setStoredGroupBy } from '@/lib/viewPreference'
import type { PantryItem, Recipe } from '@/types'

export function RecipeGroupView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: recipes = [], isLoading: recipesLoading } = useRecipes()
  const { data: items = [], isLoading: itemsLoading } = useStockedItems()
  // Only used to tell "every item anywhere belongs to a recipe" from "unfiled
  // items exist but none are stocked here" — `items` above cannot see the latter.
  const { data: allItems = [], isLoading: allItemsLoading } = useItems()

  const isLoading = recipesLoading || itemsLoading || allItemsLoading

  const getAllRecipeItemIds = () =>
    new Set(recipes.flatMap((r) => r.items.map((ri) => ri.itemId)))

  const getRecipeItems = (recipeId: string): PantryItem[] => {
    if (recipeId === 'unsorted') {
      const allIds = getAllRecipeItemIds()
      return items.filter((i) => !allIds.has(i.id))
    }
    const recipe = recipes.find((r) => r.id === recipeId)
    if (!recipe) return []
    const ids = new Set(recipe.items.map((ri) => ri.itemId))
    return items.filter((i) => ids.has(i.id))
  }

  const getItemCount = (recipeId: string) => getRecipeItems(recipeId).length

  const getOutOfStockCount = (recipeId: string) =>
    getRecipeItems(recipeId).filter(isEmptyStock).length

  const getLowStockCount = (recipeId: string) =>
    getRecipeItems(recipeId).filter(isLowStock).length

  const getActiveCount = (recipeId: string) =>
    getRecipeItems(recipeId).filter((i) => !isInactive(i)).length

  const getPackTotals = (recipeId: string) =>
    getRecipeItems(recipeId).reduce(
      (acc, item) => {
        const { packed, target, refill } = getItemPackUnits(item)
        return {
          totalPacked: acc.totalPacked + packed,
          totalTarget: acc.totalTarget + target,
          totalRefill: acc.totalRefill + refill,
        }
      },
      { totalPacked: 0, totalTarget: 0, totalRefill: 0 },
    )

  const unsortedItems = getRecipeItems('unsorted')

  // A recipe is "stocked here" when at least one of its items has stock in the
  // active location. `items` comes from useStockedItems(), which is already
  // location-scoped (and falls back to the full list in cloud mode), so a zero
  // count is the signal — no stockId guard or cloud bypass belongs here.
  //
  // Partitioning with two filters rather than a sort: filter preserves relative
  // order, so the view's existing (incidental) recipe order survives within
  // each half instead of being replaced by a stocked-ness sort.
  const stockedRecipes = recipes.filter((r) => getItemCount(r.id) > 0)
  const unstockedRecipes = recipes.filter((r) => getItemCount(r.id) === 0)

  // The "Not added to recipe" bucket's zero is ambiguous: it means either every
  // item anywhere belongs to some recipe (genuinely empty — stay hidden) or
  // unfiled items exist but are stocked in other locations (render, below the
  // divider).
  const allRecipeItemIds = getAllRecipeItemIds()
  const hasUnsortedAnywhere = allItems.some((i) => !allRecipeItemIds.has(i.id))
  const unsortedSinks = hasUnsortedAnywhere && unsortedItems.length === 0
  const unstockedGroupCount = unstockedRecipes.length + (unsortedSinks ? 1 : 0)

  const renderRecipeCard = (recipe: Recipe) => {
    const totals = getPackTotals(recipe.id)
    return (
      <GroupCard
        key={recipe.id}
        name={recipe.name}
        icon={<ChefHat className="h-4 w-4 text-foreground-muted" />}
        itemCount={getItemCount(recipe.id)}
        outOfStockCount={getOutOfStockCount(recipe.id)}
        lowStockCount={getLowStockCount(recipe.id)}
        activeCount={getActiveCount(recipe.id)}
        totalPackedQuantity={totals.totalPacked}
        totalTargetInPacks={totals.totalTarget}
        totalRefillInPacks={totals.totalRefill}
        onClick={() =>
          navigate({
            to: '/',
            search: { groupBy: 'recipe', id: recipe.id },
          })
        }
      />
    )
  }

  const renderUnsortedCard = () => {
    const totals = getPackTotals('unsorted')
    return (
      <GroupCard
        icon={<Lock className="h-4 w-4 text-foreground-muted" />}
        name="Not added to recipe"
        itemCount={unsortedItems.length}
        outOfStockCount={getOutOfStockCount('unsorted')}
        lowStockCount={getLowStockCount('unsorted')}
        activeCount={getActiveCount('unsorted')}
        totalPackedQuantity={totals.totalPacked}
        totalTargetInPacks={totals.totalTarget}
        totalRefillInPacks={totals.totalRefill}
        onClick={() =>
          navigate({
            to: '/',
            search: { groupBy: 'recipe', id: 'unsorted' },
          })
        }
      />
    )
  }

  if (isLoading) {
    return (
      <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
        <div>
          <Toolbar>
            <LocationSwitcher />
            <ViewToggle current="group" onChange={() => {}} />
            <GroupByToggle current="recipe" onChange={() => {}} />
            <div className="flex-1" />
            <Button
              size="icon"
              className="lg:w-auto lg:px-3"
              aria-label={t('settings.recipes.manage')}
              disabled
              asChild
            >
              <span>
                <Settings />
                <span className="hidden lg:inline">
                  {t('settings.recipes.manage')}
                </span>
              </span>
            </Button>
          </Toolbar>
        </div>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <div>
        <Toolbar>
          <LocationSwitcher />
          <ViewToggle
            current="group"
            onChange={(view) => {
              if (view === 'list') {
                setPantryView('list')
                navigate({ to: '/', search: {} })
              }
            }}
          />
          <GroupByToggle
            current="recipe"
            onChange={(g) => {
              setStoredGroupBy(g)
              navigate({ to: '/', search: { groupBy: g } })
            }}
          />
          <div className="flex-1" />
          <Button
            size="icon"
            variant="neutral-ghost"
            className="lg:w-auto lg:px-3"
            asChild
          >
            <Link
              to="/settings/recipes"
              aria-label={t('settings.recipes.manage')}
            >
              <Settings />
              <span className="hidden lg:inline">
                {t('settings.recipes.manage')}
              </span>
            </Link>
          </Button>
        </Toolbar>
      </div>
      <div className="overflow-y-auto flex flex-col gap-px">
        {stockedRecipes.map(renderRecipeCard)}
        {hasUnsortedAnywhere && !unsortedSinks && renderUnsortedCard()}
        {unstockedGroupCount > 0 && (
          <ListSectionDivider>
            {t('common.notStockedHere', { count: unstockedGroupCount })}
          </ListSectionDivider>
        )}
        {unstockedRecipes.map(renderRecipeCard)}
        {unsortedSinks && renderUnsortedCard()}
      </div>
    </div>
  )
}
