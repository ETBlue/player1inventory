import { Link, useNavigate } from '@tanstack/react-router'
import { ChefHat, Settings, Settings2 } from 'lucide-react'
import { GroupByToggle } from '@/components/shared/GroupByToggle'
import { GroupCard } from '@/components/shared/GroupCard'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Toolbar } from '@/components/shared/Toolbar'
import { ViewToggle } from '@/components/shared/ViewToggle'
import { Button } from '@/components/ui/button'
import { useItems } from '@/hooks'
import { useRecipes } from '@/hooks/useRecipes'
import {
  getCurrentQuantity,
  getItemPackUnits,
  isInactive,
} from '@/lib/quantityUtils'
import { setPantryView, setStoredGroupBy } from '@/lib/viewPreference'
import type { Item } from '@/types'

export function RecipeGroupView() {
  const navigate = useNavigate()
  const { data: recipes = [], isLoading: recipesLoading } = useRecipes()
  const { data: items = [], isLoading: itemsLoading } = useItems()

  const isLoading = recipesLoading || itemsLoading

  const getAllRecipeItemIds = () =>
    new Set(recipes.flatMap((r) => r.items.map((ri) => ri.itemId)))

  const getRecipeItems = (recipeId: string): Item[] => {
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
    getRecipeItems(recipeId).filter(
      (i) => !isInactive(i) && getCurrentQuantity(i) < i.refillThreshold,
    ).length

  const getLowStockCount = (recipeId: string) =>
    getRecipeItems(recipeId).filter((i) => {
      const qty = getCurrentQuantity(i)
      return (
        !isInactive(i) && i.refillThreshold > 0 && qty === i.refillThreshold
      )
    }).length

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

  if (isLoading) {
    return (
      <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
        <div>
          <Toolbar>
            <ViewToggle current="group" onChange={() => {}} />
            <GroupByToggle current="recipe" onChange={() => {}} />
            <div className="flex-1" />
            <Button size="icon" className="lg:w-auto lg:px-3" disabled asChild>
              <span>
                <Settings2 />
                <span className="hidden lg:inline">Manage</span>
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
            <Link to="/settings/recipes" aria-label="Manage recipes">
              <Settings />
              <span className="hidden lg:inline">Manage</span>
            </Link>
          </Button>
        </Toolbar>
      </div>
      <div className="overflow-y-auto flex flex-col gap-px">
        {recipes.map((recipe) => {
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
        })}
        {unsortedItems.length > 0 &&
          (() => {
            const totals = getPackTotals('unsorted')
            return (
              <GroupCard
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
          })()}
      </div>
    </div>
  )
}
