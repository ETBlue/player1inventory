// src/components/ItemListToolbar.tsx

import { ArrowDown, ArrowUp, Filter, Plus, Search, Tags, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { FilterStatus } from '@/components/FilterStatus'
import { ItemFilters } from '@/components/ItemFilters'
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
import { filterItems } from '@/lib/filterUtils'
import type { SortDirection, SortField } from '@/lib/sortUtils'
import type { Item } from '@/types'

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

  // Search/create callback — called when Enter pressed with no matching items
  onSearchSubmit?: (query: string) => void
  onCreateFromSearch?: (query: string) => void
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
}: ItemListToolbarProps) {
  const {
    search,
    filterState,
    isFiltersVisible,
    isTagsVisible,
    setSearch,
    setFilterState,
    setIsFiltersVisible,
    setIsTagsVisible,
  } = useUrlSearchAndFilters()

  // searchVisible is internal state, initialized to true when q is non-empty
  const [searchVisible, setSearchVisible] = useState(() => search !== '')

  const hasActiveFilters = Object.values(filterState).some(
    (tagIds) => tagIds.length > 0,
  )

  const filteredCount = filterItems(items, filterState).length
  const totalCount = items.length

  const queriedCount = search.trim()
    ? items.filter((item) =>
        item.name.toLowerCase().includes(search.toLowerCase()),
      ).length
    : items.length

  const handleCriteriaChange = (field: SortField) => {
    onSortChange(field, sortDirection)
  }

  const handleDirectionToggle = () => {
    onSortChange(sortBy, sortDirection === 'asc' ? 'desc' : 'asc')
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (onSearchSubmit && queriedCount === 0 && search.trim()) {
        onSearchSubmit(search.trim())
      }
    }
    if (e.key === 'Escape') {
      setSearch('')
      setSearchVisible(false)
    }
  }

  return (
    <>
      {/* Row 1: always visible toolbar */}
      <Toolbar className={className}>
        {leading}

        <div className="flex items-center">
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
          >
            {sortDirection === 'asc' ? <ArrowUp /> : <ArrowDown />}
          </Button>
        </div>

        {isTagsToggleEnabled && (
          <Button
            size="icon"
            variant={isTagsVisible ? 'neutral' : 'neutral-ghost'}
            onClick={() => setIsTagsVisible(!isTagsVisible)}
            aria-label="Toggle tags"
          >
            <Tags />
          </Button>
        )}

        <Button
          size="icon"
          variant={isFiltersVisible ? 'neutral' : 'neutral-ghost'}
          onClick={() => setIsFiltersVisible(!isFiltersVisible)}
          aria-label="Toggle filters"
        >
          <Filter />
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
        >
          <Search />
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
          <ItemFilters items={items} disabled={!!search} />
        </>
      )}

      {/* Row 4: filter status — grey out while searching */}
      {(isFiltersVisible || hasActiveFilters) && (
        <FilterStatus
          filteredCount={filteredCount}
          totalCount={totalCount}
          hasActiveFilters={hasActiveFilters}
          onClearAll={() => setFilterState({})}
          disabled={!!search}
        />
      )}

      {/* Row 2: search input */}
      {searchVisible && (
        <div className="flex items-center gap-2 border-t border-accessory-default px-3">
          <Search className="h-4 w-4 text-foreground-muted shrink-0" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="border-none shadow-none bg-transparent h-auto py-2 text-sm"
            autoFocus
          />
          {search &&
            (onCreateFromSearch && queriedCount === 0 ? (
              <Button
                size="icon"
                variant="neutral-ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => onCreateFromSearch(search.trim())}
                aria-label="Create item"
              >
                <Plus className="h-3 w-3" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="neutral-ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </Button>
            ))}
        </div>
      )}
    </>
  )
}
