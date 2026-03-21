// src/components/ItemListToolbar.tsx

import { ArrowDown, ArrowUp, Filter, Plus, Search, Tags, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { FilterStatus } from '@/components/FilterStatus'
import { ItemFilters } from '@/components/item/ItemFilters'
import { Toolbar } from '@/components/Toolbar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import {
  filterItems,
  filterItemsByRecipes,
  filterItemsByVendors,
} from '@/lib/filterUtils'
import type { SortDirection, SortField } from '@/lib/sortUtils'
import type { Item, Recipe, Vendor } from '@/types'

const sortLabels: Record<SortField, string> = {
  expiring: 'Expiring',
  name: 'Name',
  stock: 'Stock',
  purchased: 'Purchased',
}

interface ItemListToolbarProps {
  // Sort (from useSortFilter)
  sortBy: SortField
  sortDirection: SortDirection
  onSortChange: (field: SortField, direction: SortDirection) => void

  // Tags toggle — only shown when this prop is provided
  // (shopping page omits it; pantry + assignment pages include it)
  isTagsToggleEnabled?: boolean

  // Items — for FilterStatus counts and ItemFilters available options
  items?: Item[]

  // Toolbar Row 1 customization
  className?: string // passed to <Toolbar>
  leading?: ReactNode // left of controls row
  children?: ReactNode // right of controls row (add item, etc.)

  // Search/create callbacks — triggered when search has no exact name match
  onSearchSubmit?: (query: string) => void
  onCreateFromSearch?: (query: string) => void
  hasExactMatch?: boolean // pass true when searchedItems contains an exact case-insensitive match
  vendors?: Vendor[]
  recipes?: Recipe[]
  hideVendorFilter?: boolean
  hideRecipeFilter?: boolean
}

export function ItemListToolbar({
  sortBy,
  sortDirection,
  onSortChange,
  isTagsToggleEnabled,
  items = [],
  className,
  leading,
  children,
  onSearchSubmit,
  onCreateFromSearch,
  hasExactMatch,
  vendors,
  recipes,
  hideVendorFilter,
  hideRecipeFilter,
}: ItemListToolbarProps) {
  const {
    search,
    filterState,
    selectedVendorIds,
    selectedRecipeIds,
    isFiltersVisible,
    isTagsVisible,
    setSearch,
    setIsFiltersVisible,
    setIsTagsVisible,
    clearAllFilters,
  } = useUrlSearchAndFilters()

  // searchVisible is internal state, initialized to true when q is non-empty.
  // The effect ensures the search row opens when navigating back to a URL with ?q=
  // (the lazy initializer may fire before the router state catches up on SPA navigation).
  const [searchVisible, setSearchVisible] = useState(() => search !== '')
  useEffect(() => {
    if (search) setSearchVisible(true)
  }, [search])

  const hasActiveFilters =
    Object.values(filterState).some((tagIds) => tagIds.length > 0) ||
    selectedVendorIds.length > 0 ||
    selectedRecipeIds.length > 0

  const tagFiltered = filterItems(items, filterState)
  const vendorFiltered = filterItemsByVendors(tagFiltered, selectedVendorIds)
  const filteredCount = filterItemsByRecipes(
    vendorFiltered,
    selectedRecipeIds,
    recipes ?? [],
  ).length
  const totalCount = items.length

  const handleCriteriaChange = (field: SortField) => {
    onSortChange(field, sortDirection)
  }

  const handleDirectionToggle = () => {
    onSortChange(sortBy, sortDirection === 'asc' ? 'desc' : 'asc')
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const createOrSearch = onCreateFromSearch ?? onSearchSubmit
      if (createOrSearch && !hasExactMatch && search.trim()) {
        createOrSearch(search.trim())
      }
    }
    if (e.key === 'Escape') {
      setSearch('')
    }
  }

  return (
    <>
      {/* Row 1: always visible toolbar */}
      <Toolbar {...(className !== undefined ? { className } : {})}>
        {leading}

        <div className="flex items-center">
          <span className="hidden lg:inline text-sm text-foreground-muted">
            Sort by
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="default"
                variant="neutral-ghost"
                aria-label="Sort by criteria"
                className="px-2 font-normal"
              >
                {sortLabels[sortBy]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                className={
                  sortBy === 'expiring' ? 'bg-background-elevated' : ''
                }
                onClick={() => handleCriteriaChange('expiring')}
              >
                Expiring soon
              </DropdownMenuItem>
              <DropdownMenuItem
                className={sortBy === 'name' ? 'bg-background-elevated' : ''}
                onClick={() => handleCriteriaChange('name')}
              >
                Name
              </DropdownMenuItem>
              <DropdownMenuItem
                className={sortBy === 'stock' ? 'bg-background-elevated' : ''}
                onClick={() => handleCriteriaChange('stock')}
              >
                Stock
              </DropdownMenuItem>
              <DropdownMenuItem
                className={
                  sortBy === 'purchased' ? 'bg-background-elevated' : ''
                }
                onClick={() => handleCriteriaChange('purchased')}
              >
                Last purchased
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="icon"
            variant="neutral-ghost"
            onClick={handleDirectionToggle}
            aria-label="Toggle sort direction"
            className="lg:w-auto lg:px-3"
          >
            {sortDirection === 'asc' ? <ArrowUp /> : <ArrowDown />}
            <span className="hidden lg:inline ml-1">
              {sortDirection === 'asc' ? 'Asc' : 'Desc'}
            </span>
          </Button>
        </div>

        {isTagsToggleEnabled && (
          <Button
            size="icon"
            variant={isTagsVisible ? 'neutral' : 'neutral-ghost'}
            onClick={() => setIsTagsVisible(!isTagsVisible)}
            aria-label="Toggle tags"
            className="lg:w-auto lg:px-3"
          >
            <Tags />
            <span className="hidden lg:inline ml-1">Tags</span>
          </Button>
        )}

        <Button
          size="icon"
          variant={isFiltersVisible ? 'neutral' : 'neutral-ghost'}
          onClick={() => setIsFiltersVisible(!isFiltersVisible)}
          aria-label="Toggle filters"
          className="lg:w-auto lg:px-3"
        >
          <Filter />
          <span className="hidden lg:inline ml-1">Filters</span>
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
          <span className="hidden lg:inline ml-1">Search</span>
        </Button>

        {children && (
          <>
            <span className="flex-1" />
            {children}
          </>
        )}
      </Toolbar>

      {/* Row 3: filters — disabled while searching */}
      {isFiltersVisible && (
        <>
          <div className="h-px bg-accessory-default" />
          <ItemFilters
            items={items}
            disabled={!!search}
            vendors={vendors ?? []}
            recipes={recipes ?? []}
            hideVendorFilter={hideVendorFilter ?? false}
            hideRecipeFilter={hideRecipeFilter ?? false}
          />
        </>
      )}

      {/* Row 4: filter status — grey out while searching */}
      {(isFiltersVisible || hasActiveFilters) && (
        <FilterStatus
          filteredCount={filteredCount}
          totalCount={totalCount}
          hasActiveFilters={hasActiveFilters}
          onClearAll={clearAllFilters}
          disabled={!!search}
        />
      )}

      {/* Row 2: search input */}
      {searchVisible && (
        <div className="flex items-center gap-2 border-t border-accessory-default px-3">
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="border-none shadow-none bg-transparent h-auto py-2 text-sm"
            autoFocus
          />
          {search && (
            <>
              <Button
                size="icon"
                variant="neutral-ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <X />
              </Button>
              {onCreateFromSearch && !hasExactMatch && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onCreateFromSearch(search.trim())}
                  aria-label="Create item"
                >
                  <Plus />
                  Create
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
