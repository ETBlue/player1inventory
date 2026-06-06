import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Search,
  Settings,
  Tags,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { ItemCard } from '@/components/item/ItemCard'
import { QuickUpdateDialog } from '@/components/item/QuickUpdateDialog'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useItems, useUpdateItem } from '@/hooks'
import { useItemSortData } from '@/hooks/useItemSortData'
import { useSortFilter } from '@/hooks/useSortFilter'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { useVendors } from '@/hooks/useVendors'
import { isInactive } from '@/lib/quantityUtils'
import { type SortDirection, type SortField, sortItems } from '@/lib/sortUtils'
import type { Item } from '@/types'

const sortLabels: Record<string, string> = {
  name: 'Name',
  stock: 'Stock',
  expiring: 'Expiring',
  purchased: 'Last purchased',
}

interface VendorDetailViewProps {
  vendorId: string
}

export function VendorDetailView({ vendorId }: VendorDetailViewProps) {
  const navigate = useNavigate()
  const isUnsorted = vendorId === 'unsorted'

  const { data: allItems = [], isLoading: isItemsLoading } = useItems()
  const { data: vendors = [], isLoading: isVendorsLoading } = useVendors()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()

  const updateItem = useUpdateItem()

  const {
    sortBy: localSortBy,
    sortDirection: localSortDirection,
    setSortBy,
    setSortDirection,
  } = useSortFilter('vendor-detail', { defaultSortBy: 'name' })

  const sortBy: SortField = localSortBy
  const sortDirection: SortDirection = localSortDirection

  const { search, setSearch, isTagsVisible, setIsTagsVisible } =
    useUrlSearchAndFilters()

  const [searchVisible, setSearchVisible] = useState(() => !!search.trim())
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set())
  const [quickUpdateItemId, setQuickUpdateItemId] = useState<string | null>(
    null,
  )
  const quickUpdateItem =
    allItems.find((i) => i.id === quickUpdateItemId) ?? null

  const vendor = vendors.find((v) => v.id === vendorId)

  const { quantities, expiryDates, purchaseDates } = useItemSortData(allItems)

  const inScopeItems = useMemo((): Item[] => {
    if (isUnsorted) {
      return allItems.filter((i) => !i.vendorIds || i.vendorIds.length === 0)
    }
    return allItems.filter((i) => i.vendorIds?.includes(vendorId))
  }, [isUnsorted, allItems, vendorId])

  const sortedItems = useMemo((): Item[] => {
    return sortItems(
      inScopeItems,
      quantities ?? new Map(),
      expiryDates ?? new Map(),
      purchaseDates ?? new Map(),
      sortBy,
      sortDirection,
    )
  }, [
    inScopeItems,
    quantities,
    expiryDates,
    purchaseDates,
    sortBy,
    sortDirection,
  ])

  const trimmedSearch = search.trim()

  const displayedItems = useMemo(() => {
    if (!trimmedSearch) return sortedItems
    return sortedItems.filter((item) =>
      item.name.toLowerCase().includes(trimmedSearch.toLowerCase()),
    )
  }, [sortedItems, trimmedSearch])

  const handleSortChange = (field: SortField, dir: SortDirection) => {
    setSortBy(field)
    setSortDirection(dir)
  }

  const isLoading = isItemsLoading || isVendorsLoading

  if (isLoading) {
    return <LoadingSpinner />
  }

  const title = isUnsorted ? 'Unsorted' : (vendor?.name ?? 'Vendor')

  const recipeMap = new Map<string, []>()

  const renderItemCard = (item: Item) => (
    <ItemCard
      key={item.id}
      item={item}
      tags={tags.filter((t) => item.tagIds.includes(t.id))}
      tagTypes={tagTypes}
      vendors={vendors.filter((v) => item.vendorIds?.includes(v.id) ?? false)}
      recipes={recipeMap.get(item.id) ?? []}
      showTags={isTagsVisible}
      disabled={pendingItemIds.has(item.id)}
      isPending={pendingItemIds.has(item.id)}
      onQuickUpdate={() => setQuickUpdateItemId(item.id)}
    />
  )

  const activeDisplayed = displayedItems.filter((item) => !isInactive(item))
  const inactiveDisplayed = displayedItems.filter((item) => isInactive(item))

  return (
    <div className="h-screen grid grid-rows-[auto_1fr]">
      <div>
        <Toolbar className="border-b-1">
          <Button
            variant="neutral-ghost"
            size="icon"
            className="lg:w-auto lg:mr-3"
            onClick={() => navigate({ to: '/', search: { groupBy: 'vendor' } })}
            aria-label="Go back"
          >
            <ArrowLeft />
            <span className="hidden lg:inline">Go back</span>
          </Button>
          <h1 className="text-base font-regular truncate flex-1 normal-case">
            {title}
          </h1>
          <div className="flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="default"
                  variant="neutral-ghost"
                  aria-label="Sort by"
                  className="px-2 font-normal"
                >
                  {sortLabels[sortBy]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {(['expiring', 'name', 'stock', 'purchased'] as const).map(
                  (field) => (
                    <DropdownMenuItem
                      key={field}
                      className={
                        sortBy === field ? 'bg-background-elevated' : ''
                      }
                      onClick={() => handleSortChange(field, sortDirection)}
                    >
                      {sortLabels[field]}
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="icon"
              variant="neutral-ghost"
              onClick={() =>
                handleSortChange(
                  sortBy,
                  sortDirection === 'asc' ? 'desc' : 'asc',
                )
              }
              aria-label="Toggle sort direction"
              className="lg:w-auto lg:px-3"
            >
              {sortDirection === 'asc' ? <ArrowUp /> : <ArrowDown />}
              <span className="hidden lg:inline">
                {sortDirection === 'asc' ? 'Asc' : 'Desc'}
              </span>
            </Button>
          </div>
          <Button
            size="icon"
            variant={isTagsVisible ? 'neutral' : 'neutral-ghost'}
            onClick={() => setIsTagsVisible(!isTagsVisible)}
            aria-label="Toggle tags"
            className="lg:w-auto lg:px-3"
          >
            <Tags />
            <span className="hidden lg:inline">Tags</span>
          </Button>
          <Button
            size="icon"
            variant={searchVisible ? 'neutral' : 'neutral-ghost'}
            onClick={() => {
              if (searchVisible) {
                setSearch('')
              }
              setSearchVisible((v) => !v)
            }}
            aria-label="Toggle search"
            className="lg:w-auto lg:px-3"
          >
            <Search />
            <span className="hidden lg:inline">Search</span>
          </Button>
          {!isUnsorted && (
            <Link
              to="/settings/vendors/$id"
              params={{ id: vendorId }}
              aria-label="Vendor settings"
            >
              <Button
                variant="neutral-ghost"
                size="icon"
                tabIndex={-1}
                aria-hidden={true}
              >
                <Settings />
              </Button>
            </Link>
          )}
        </Toolbar>

        {searchVisible && (
          <>
            <div className="h-px bg-accessory-default" />
            <div className="flex items-center gap-2 px-3">
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearch('')
                    setSearchVisible(false)
                  }
                }}
                className="border-none shadow-none bg-transparent h-auto py-2 text-sm"
                autoFocus
              />
              {search && (
                <Button
                  size="icon"
                  variant="neutral-ghost"
                  className="h-6 w-6 shrink-0"
                  onClick={() => {
                    setSearch('')
                    setSearchVisible(false)
                  }}
                  aria-label="Clear search"
                >
                  <X />
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="overflow-y-auto">
        <div className="h-px bg-accessory-default" />
        <div className="flex flex-col gap-px">
          {activeDisplayed.map(renderItemCard)}
          {inactiveDisplayed.length > 0 && (
            <div className="bg-background-surface px-3 py-2 text-foreground-muted text-center text-sm">
              {inactiveDisplayed.length} inactive item
              {inactiveDisplayed.length !== 1 ? 's' : ''}
            </div>
          )}
          {inactiveDisplayed.map(renderItemCard)}
          {sortedItems.length === 0 && (
            <div className="text-center py-12 text-foreground-muted">
              <p className="font-medium">No items</p>
              <p className="text-sm mt-1">
                {isUnsorted
                  ? 'All items are assigned to vendors'
                  : 'No items are assigned to this vendor'}
              </p>
            </div>
          )}
        </div>
      </div>
      {quickUpdateItem && (
        <QuickUpdateDialog
          item={quickUpdateItem}
          isOpen={true}
          onClose={() => setQuickUpdateItemId(null)}
          onSubmit={async ({ packedQuantity, unpackedQuantity }) => {
            setPendingItemIds((prev) => new Set(prev).add(quickUpdateItem.id))
            try {
              await updateItem.mutateAsync({
                id: quickUpdateItem.id,
                updates: { packedQuantity, unpackedQuantity },
              })
              setQuickUpdateItemId(null)
            } finally {
              setPendingItemIds((prev) => {
                const next = new Set(prev)
                next.delete(quickUpdateItem.id)
                return next
              })
            }
          }}
        />
      )}
    </div>
  )
}
