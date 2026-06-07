import { Link, useNavigate } from '@tanstack/react-router'
import { Settings, Settings2 } from 'lucide-react'
import { GroupByToggle } from '@/components/shared/GroupByToggle'
import { GroupCard } from '@/components/shared/GroupCard'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Toolbar } from '@/components/shared/Toolbar'
import { ViewToggle } from '@/components/shared/ViewToggle'
import { ShelfList } from '@/components/shelf/ShelfList'
import { Button } from '@/components/ui/button'
import { useItems, useShelvesQuery } from '@/hooks'
import { useRecipes } from '@/hooks/useRecipes'
import { useTags } from '@/hooks/useTags'
import {
  getCurrentQuantity,
  getItemPackUnits,
  isInactive,
} from '@/lib/quantityUtils'
import { matchesFilterConfig } from '@/lib/shelfUtils'
import { setPantryView, setStoredGroupBy } from '@/lib/viewPreference'
import type { Item, Shelf } from '@/types'

export function ShelfGroupView() {
  const navigate = useNavigate()

  const { data: shelves, isLoading: shelvesLoading } = useShelvesQuery()
  const { data: items, isLoading: itemsLoading } = useItems()
  const { data: recipes = [] } = useRecipes()
  const { data: tags = [] } = useTags()

  const handleShelfClick = (shelfId: string) => {
    navigate({ to: '/', search: { groupBy: 'shelf', id: shelfId } })
  }

  const handleUnsortedClick = () => {
    navigate({ to: '/', search: { groupBy: 'shelf', id: 'unsorted' } })
  }

  const getShelfItems = (shelfId: string): Item[] => {
    if (!items || !shelves) return []

    const shelf = shelves.find((s: Shelf) => s.id === shelfId)
    if (!shelf) return []

    if (shelf.type === 'selection') {
      const ids = new Set(shelf.itemIds ?? [])
      return items.filter((item: Item) => ids.has(item.id))
    }

    const { filterConfig } = shelf
    if (!filterConfig) return items

    return items.filter((item: Item) =>
      matchesFilterConfig(item, filterConfig, recipes, tags),
    )
  }

  const getItemCount = (shelfId: string): number => {
    if (!items || !shelves) return 0

    const shelf = shelves.find((s) => s.id === shelfId)
    if (!shelf) return 0

    if (shelf.type === 'selection') {
      return shelf.itemIds?.length ?? 0
    }

    const { filterConfig } = shelf
    if (!filterConfig) return items.length

    return (items ?? []).filter((item) =>
      matchesFilterConfig(item, filterConfig, recipes, tags),
    ).length
  }

  const getOutOfStockCount = (shelfId: string): number => {
    return getShelfItems(shelfId).filter(
      (item) =>
        !isInactive(item) && getCurrentQuantity(item) < item.refillThreshold,
    ).length
  }

  const getLowStockCount = (shelfId: string): number => {
    return getShelfItems(shelfId).filter((item) => {
      const qty = getCurrentQuantity(item)
      return (
        !isInactive(item) &&
        item.refillThreshold > 0 &&
        qty === item.refillThreshold
      )
    }).length
  }

  const getActiveCount = (shelfId: string): number => {
    return getShelfItems(shelfId).filter((item) => !isInactive(item)).length
  }

  const getShelfPackTotals = (shelfId: string) => {
    return getShelfItems(shelfId).reduce(
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
  }

  const getUnsortedItems = (): Item[] => {
    if (!items || !shelves) return []

    const selectionItemIds = new Set<string>()
    for (const shelf of shelves) {
      if (shelf.type === 'selection' && shelf.itemIds) {
        for (const id of shelf.itemIds) selectionItemIds.add(id)
      }
    }

    const filterMatchedIds = new Set<string>()
    for (const shelf of shelves) {
      if (shelf.type === 'filter' && shelf.filterConfig) {
        for (const item of items) {
          if (matchesFilterConfig(item, shelf.filterConfig, recipes, tags)) {
            filterMatchedIds.add(item.id)
          }
        }
      }
    }

    return items.filter(
      (item: Item) =>
        !selectionItemIds.has(item.id) && !filterMatchedIds.has(item.id),
    )
  }

  const getUnsortedCount = (): number => getUnsortedItems().length

  const getUnsortedOutOfStockCount = (): number =>
    getUnsortedItems().filter(
      (item) =>
        !isInactive(item) && getCurrentQuantity(item) < item.refillThreshold,
    ).length

  const getUnsortedLowStockCount = (): number =>
    getUnsortedItems().filter((item) => {
      const qty = getCurrentQuantity(item)
      return (
        !isInactive(item) &&
        item.refillThreshold > 0 &&
        qty === item.refillThreshold
      )
    }).length

  const getUnsortedActiveCount = (): number =>
    getUnsortedItems().filter((item) => !isInactive(item)).length

  const getUnsortedPackTotals = () => {
    return getUnsortedItems().reduce(
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
  }

  const isLoading = shelvesLoading || itemsLoading

  if (isLoading) {
    return (
      <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
        <div>
          <Toolbar>
            <ViewToggle current="group" onChange={() => {}} />
            <GroupByToggle current="shelf" onChange={() => {}} />
            <div className="flex-1" />
            <Button
              size="icon"
              className="lg:w-auto lg:px-3"
              aria-label="Manage shelves"
              disabled
              asChild
            >
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

  const sortedShelves = [...(shelves ?? [])].sort((a, b) => a.order - b.order)

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
            current="shelf"
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
            <Link to="/settings/shelves" aria-label="Manage shelves">
              <Settings />
              <span className="hidden lg:inline">Manage</span>
            </Link>
          </Button>
        </Toolbar>
      </div>
      <div className="overflow-y-auto flex flex-col gap-px">
        <ShelfList
          shelves={sortedShelves}
          onShelfClick={handleShelfClick}
          getItemCount={getItemCount}
          getOutOfStockCount={getOutOfStockCount}
          getLowStockCount={getLowStockCount}
          getActiveCount={getActiveCount}
          getPackTotals={getShelfPackTotals}
        />
        {(() => {
          const unsortedPackTotals = getUnsortedPackTotals()
          return (
            <GroupCard
              name="Not in shelf"
              itemCount={getUnsortedCount()}
              outOfStockCount={getUnsortedOutOfStockCount()}
              lowStockCount={getUnsortedLowStockCount()}
              activeCount={getUnsortedActiveCount()}
              onClick={handleUnsortedClick}
              totalPackedQuantity={unsortedPackTotals.totalPacked}
              totalTargetInPacks={unsortedPackTotals.totalTarget}
              totalRefillInPacks={unsortedPackTotals.totalRefill}
            />
          )
        })()}
      </div>
    </div>
  )
}
