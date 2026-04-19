import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Settings, Settings2 } from 'lucide-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Toolbar } from '@/components/shared/Toolbar'
import { ViewToggle } from '@/components/shared/ViewToggle'
import { ShelfCard } from '@/components/shelf/ShelfCard'
import { ShelfList } from '@/components/shelf/ShelfList'
import { Button } from '@/components/ui/button'
import { useItems, useShelvesQuery } from '@/hooks'
import { useRecipes } from '@/hooks/useRecipes'
import { useTags } from '@/hooks/useTags'
import { matchesFilterConfig } from '@/lib/shelfUtils'
import { setPantryView } from '@/lib/viewPreference'
import type { Shelf } from '@/types'

export const Route = createFileRoute('/shelves/')({
  component: ShelvesPage,
})

export function ShelvesPage() {
  const navigate = useNavigate()

  const { data: shelves, isLoading: shelvesLoading } = useShelvesQuery()
  const { data: items, isLoading: itemsLoading } = useItems()
  const { data: recipes = [] } = useRecipes()
  const { data: tags = [] } = useTags()

  const handleViewChange = (view: 'list' | 'shelf') => {
    if (view === 'list') {
      setPantryView('list')
      navigate({ to: '/' })
    }
  }

  const handleShelfClick = (shelfId: string) => {
    navigate({ to: '/shelves/$shelfId', params: { shelfId } })
  }

  const handleUnsortedClick = () => {
    navigate({ to: '/shelves/$shelfId', params: { shelfId: 'unsorted' } })
  }

  const getItemCount = (shelfId: string): number => {
    if (!items || !shelves) return 0

    const shelf = shelves.find((s) => s.id === shelfId)
    if (!shelf) return 0

    if (shelf.type === 'selection') {
      return shelf.itemIds?.length ?? 0
    }

    // Filter shelf: count items matching filterConfig
    const { filterConfig } = shelf
    if (!filterConfig) return items.length

    return (items ?? []).filter((item) =>
      matchesFilterConfig(item, filterConfig, recipes, tags),
    ).length
  }

  const getUnsortedCount = (): number => {
    if (!items || !shelves) return 0

    // Items in any selection shelf's itemIds
    const selectionItemIds = new Set<string>()
    for (const shelf of shelves) {
      if (shelf.type === 'selection' && shelf.itemIds) {
        for (const id of shelf.itemIds) selectionItemIds.add(id)
      }
    }

    // Items matched by any filter shelf
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
      (item) =>
        !selectionItemIds.has(item.id) && !filterMatchedIds.has(item.id),
    ).length
  }

  const isLoading = shelvesLoading || itemsLoading

  if (isLoading) {
    return (
      <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
        <div>
          <Toolbar>
            <ViewToggle current="shelf" onChange={handleViewChange} />
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

  // Unsorted shelf (hardcoded, system-managed)
  const unsortedShelf: Shelf = {
    id: 'unsorted',
    name: 'Unsorted',
    type: 'system',
    order: Number.MAX_SAFE_INTEGER,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <div>
        <Toolbar>
          <ViewToggle current="shelf" onChange={handleViewChange} />
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
        />
        {/* Unsorted shelf — always last, not draggable */}
        <ShelfCard
          shelf={unsortedShelf}
          itemCount={getUnsortedCount()}
          onClick={handleUnsortedClick}
        />
      </div>
    </div>
  )
}
