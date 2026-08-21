import { Link, useNavigate } from '@tanstack/react-router'
import { Lock, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GroupByToggle } from '@/components/shared/GroupByToggle'
import { GroupCard } from '@/components/shared/GroupCard'
import { ListSectionDivider } from '@/components/shared/ListSectionDivider'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { LocationSwitcher } from '@/components/shared/LocationSwitcher'
import { Toolbar } from '@/components/shared/Toolbar'
import { ViewToggle } from '@/components/shared/ViewToggle'
import { ShelfList } from '@/components/shelf/ShelfList'
import { Button } from '@/components/ui/button'
import { useShelvesQuery, useStockedItems } from '@/hooks'
import { useRecipes } from '@/hooks/useRecipes'
import { useTags } from '@/hooks/useTags'
import {
  getItemPackUnits,
  isEmptyStock,
  isInactive,
  isLowStock,
} from '@/lib/quantityUtils'
import { matchesFilterConfig } from '@/lib/shelfUtils'
import { setPantryView, setStoredGroupBy } from '@/lib/viewPreference'
import type { PantryItem, Shelf } from '@/types'

export function ShelfGroupView() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const { data: shelves, isLoading: shelvesLoading } = useShelvesQuery()
  const { data: items, isLoading: itemsLoading } = useStockedItems()
  const { data: recipes = [] } = useRecipes()
  const { data: tags = [] } = useTags()

  const handleShelfClick = (shelfId: string) => {
    navigate({ to: '/', search: { groupBy: 'shelf', id: shelfId } })
  }

  const handleUnsortedClick = () => {
    navigate({ to: '/', search: { groupBy: 'shelf', id: 'unsorted' } })
  }

  const getShelfItems = (shelfId: string): PantryItem[] => {
    if (!items || !shelves) return []

    const shelf = shelves.find((s: Shelf) => s.id === shelfId)
    if (!shelf) return []

    if (shelf.type === 'selection') {
      const ids = new Set(shelf.itemIds ?? [])
      return items.filter((item: PantryItem) => ids.has(item.id))
    }

    const { filterConfig } = shelf
    if (!filterConfig) return items

    return items.filter((item: PantryItem) =>
      matchesFilterConfig(item, filterConfig, recipes, tags),
    )
  }

  // Counts the shelf's items in the ACTIVE LOCATION, by reusing the resolved
  // list rather than re-deriving one. A selection shelf's raw `itemIds` is
  // location-blind: it includes items stocked only elsewhere, so counting it
  // advertised a total the card's own health counts (all `getShelfItems`-based)
  // never agreed with — and let a shelf sit below the "not stocked here"
  // divider still showing a non-zero count.
  const getItemCount = (shelfId: string): number =>
    getShelfItems(shelfId).length

  const getOutOfStockCount = (shelfId: string): number => {
    return getShelfItems(shelfId).filter(isEmptyStock).length
  }

  const getLowStockCount = (shelfId: string): number => {
    return getShelfItems(shelfId).filter(isLowStock).length
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

  const getUnsortedItems = (): PantryItem[] => {
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
      (item: PantryItem) =>
        !selectionItemIds.has(item.id) && !filterMatchedIds.has(item.id),
    )
  }

  const getUnsortedCount = (): number => getUnsortedItems().length

  const getUnsortedOutOfStockCount = (): number =>
    getUnsortedItems().filter(isEmptyStock).length

  const getUnsortedLowStockCount = (): number =>
    getUnsortedItems().filter(isLowStock).length

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
            <LocationSwitcher />
            <ViewToggle current="group" onChange={() => {}} />
            <GroupByToggle current="shelf" onChange={() => {}} />
            <div className="flex-1" />
            <Button
              size="icon"
              className="lg:w-auto lg:px-3"
              aria-label={t('settings.shelves.manage')}
              disabled
              asChild
            >
              <span>
                <Settings />
                <span className="hidden lg:inline">
                  {t('settings.shelves.manage')}
                </span>
              </span>
            </Button>
          </Toolbar>
        </div>
        <LoadingSpinner />
      </div>
    )
  }

  const sortedShelves = [...(shelves ?? [])].sort((a, b) => a.order - b.order)

  // A shelf is "stocked here" when at least one of its items has stock in the
  // active location. `getShelfItems` resolves against `useStockedItems()`,
  // which is already location-scoped (and falls back to the full list in cloud
  // mode), so an empty resolved list is the signal — no stockId guard or cloud
  // bypass belongs here.
  //
  // Partitioning with two filters rather than a sort: filter preserves relative
  // order, so the user's `order` sort survives within each half instead of
  // being overridden by a stocked-ness primary key.
  const isShelfStockedHere = (shelf: Shelf) =>
    getShelfItems(shelf.id).length > 0
  const stockedShelves = sortedShelves.filter(isShelfStockedHere)
  const unstockedShelves = sortedShelves.filter((s) => !isShelfStockedHere(s))

  // The Unsorted bucket is never hidden (it is the only route to items on no
  // shelf), but it does participate in the partition: with nothing here it
  // sinks below the divider rather than disappearing.
  const unsortedCount = getUnsortedCount()
  const unsortedSinks = unsortedCount === 0
  const unstockedGroupCount = unstockedShelves.length + (unsortedSinks ? 1 : 0)

  const renderShelfList = (list: Shelf[]) => (
    <ShelfList
      shelves={list}
      onShelfClick={handleShelfClick}
      getItemCount={getItemCount}
      getOutOfStockCount={getOutOfStockCount}
      getLowStockCount={getLowStockCount}
      getActiveCount={getActiveCount}
      getPackTotals={getShelfPackTotals}
    />
  )

  const renderUnsortedCard = () => {
    const unsortedPackTotals = getUnsortedPackTotals()
    return (
      <GroupCard
        name="Unsorted"
        icon={<Lock className="h-4 w-4 text-foreground-muted" />}
        itemCount={unsortedCount}
        outOfStockCount={getUnsortedOutOfStockCount()}
        lowStockCount={getUnsortedLowStockCount()}
        activeCount={getUnsortedActiveCount()}
        onClick={handleUnsortedClick}
        totalPackedQuantity={unsortedPackTotals.totalPacked}
        totalTargetInPacks={unsortedPackTotals.totalTarget}
        totalRefillInPacks={unsortedPackTotals.totalRefill}
      />
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
            <Link
              to="/settings/shelves"
              aria-label={t('settings.shelves.manage')}
            >
              <Settings />
              <span className="hidden lg:inline">
                {t('settings.shelves.manage')}
              </span>
            </Link>
          </Button>
        </Toolbar>
      </div>
      <div className="overflow-y-auto flex flex-col gap-px">
        {renderShelfList(stockedShelves)}
        {!unsortedSinks && renderUnsortedCard()}
        {unstockedGroupCount > 0 && (
          <ListSectionDivider>
            {t('common.notStockedHere', { count: unstockedGroupCount })}
          </ListSectionDivider>
        )}
        {renderShelfList(unstockedShelves)}
        {unsortedSinks && renderUnsortedCard()}
      </div>
    </div>
  )
}
