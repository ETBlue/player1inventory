// src/components/ItemListToolbar.tsx

import { ArrowDown, ArrowUp, Filter, Plus, Search, Tags, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemFilters } from '@/components/item/ItemFilters'
import { FilterStatus } from '@/components/shared/FilterStatus'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useTags } from '@/hooks/useTags'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import {
  filterItems,
  filterItemsByRecipes,
  filterItemsByVendors,
} from '@/lib/filterUtils'
import type { SortDirection, SortField } from '@/lib/sortUtils'
import type { Item, Recipe, Vendor } from '@/types'

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
  // When true: hides the Filters toggle button (caller renders filters externally)
  hideFiltersToggle?: boolean
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
  hideFiltersToggle,
}: ItemListToolbarProps) {
  const { t } = useTranslation()

  const sortLabels: Record<SortField, string> = {
    expiring: t('itemListToolbar.sortExpiringSoon'),
    name: t('itemListToolbar.sortName'),
    stock: t('itemListToolbar.sortStock'),
    purchased: t('itemListToolbar.sortLastPurchased'),
  }

  const { data: tags = [] } = useTags()
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

  // Pass tags to enable descendant expansion (selecting a parent tag matches its children too)
  const tagFiltered = filterItems(items, filterState, tags)
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
            {t('itemListToolbar.sortBy')}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="default"
                variant="neutral-ghost"
                aria-label={t('itemListToolbar.sortByCriteria')}
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
                {t('itemListToolbar.sortExpiringSoon')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={sortBy === 'name' ? 'bg-background-elevated' : ''}
                onClick={() => handleCriteriaChange('name')}
              >
                {t('itemListToolbar.sortName')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={sortBy === 'stock' ? 'bg-background-elevated' : ''}
                onClick={() => handleCriteriaChange('stock')}
              >
                {t('itemListToolbar.sortStock')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={
                  sortBy === 'purchased' ? 'bg-background-elevated' : ''
                }
                onClick={() => handleCriteriaChange('purchased')}
              >
                {t('itemListToolbar.sortLastPurchased')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="icon"
            variant="neutral-ghost"
            onClick={handleDirectionToggle}
            aria-label={t('itemListToolbar.toggleSortDirection')}
            className="lg:w-auto lg:px-3"
          >
            {sortDirection === 'asc' ? <ArrowUp /> : <ArrowDown />}
            <span className="hidden lg:inline">
              {sortDirection === 'asc' ? t('common.asc') : t('common.desc')}
            </span>
          </Button>
        </div>

        {isTagsToggleEnabled && (
          <Button
            size="icon"
            variant={isTagsVisible ? 'neutral' : 'neutral-ghost'}
            onClick={() => setIsTagsVisible(!isTagsVisible)}
            aria-label={t('itemListToolbar.toggleTags')}
            className="lg:w-auto lg:px-3"
          >
            <Tags />
            <span className="hidden lg:inline">{t('common.tags')}</span>
          </Button>
        )}

        {!hideFiltersToggle && (
          <Button
            size="icon"
            variant={isFiltersVisible ? 'neutral' : 'neutral-ghost'}
            onClick={() => setIsFiltersVisible(!isFiltersVisible)}
            aria-label={t('itemListToolbar.toggleFilters')}
            className="lg:w-auto lg:px-3"
          >
            <Filter />
            <span className="hidden lg:inline">{t('common.filters')}</span>
          </Button>
        )}

        <Button
          size="icon"
          variant={searchVisible ? 'neutral' : 'neutral-ghost'}
          onClick={() => {
            if (searchVisible) {
              setSearch('')
            }
            setSearchVisible((v) => !v)
          }}
          aria-label={t('itemListToolbar.toggleSearch')}
          className="lg:w-auto lg:px-3"
        >
          <Search />
          <span className="hidden lg:inline">{t('common.search')}</span>
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
        <>
          <div className="h-px bg-accessory-default" />

          <div className="flex items-center gap-2 px-3">
            <Input
              placeholder={t('itemListToolbar.searchPlaceholder')}
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
                  aria-label={t('itemListToolbar.clearSearch')}
                >
                  <X />
                </Button>
                {onCreateFromSearch && !hasExactMatch && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onCreateFromSearch(search.trim())}
                    aria-label={t('itemListToolbar.createItem')}
                  >
                    <Plus />
                    {t('itemListToolbar.create')}
                  </Button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
