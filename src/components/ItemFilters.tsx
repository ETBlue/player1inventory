// src/components/ItemFilters.tsx

import { Link } from '@tanstack/react-router'
import { ChevronDown, Pencil, X } from 'lucide-react'
import { TagTypeDropdown } from '@/components/TagTypeDropdown'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { calculateTagCount } from '@/lib/filterUtils'
import { sortTagsByName } from '@/lib/tagSortUtils'
import { cn } from '@/lib/utils'
import type { Item, Recipe, Vendor } from '@/types'

interface ItemFiltersProps {
  items: Item[] // search-scoped items for available tag option computation
  disabled?: boolean
  vendors?: Vendor[]
  recipes?: Recipe[]
  hideVendorFilter?: boolean
  hideRecipeFilter?: boolean
}

export function ItemFilters({
  items,
  disabled,
  vendors = [],
  recipes = [],
  hideVendorFilter,
  hideRecipeFilter,
}: ItemFiltersProps) {
  const { data: tagTypes = [] } = useTagTypes()
  const { data: tags = [] } = useTags()
  const {
    filterState,
    setFilterState,
    selectedVendorIds,
    selectedRecipeIds,
    toggleVendorId,
    toggleRecipeId,
    clearVendorIds,
    clearRecipeIds,
  } = useUrlSearchAndFilters()

  // Filter to only tag types that have tags, then sort alphabetically
  const tagTypesWithTags = tagTypes
    .filter((tagType) => tags.some((tag) => tag.typeId === tagType.id))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )

  const showVendors = !hideVendorFilter && vendors.length > 0
  const showRecipes = !hideRecipeFilter && recipes.length > 0

  // Don't render if nothing to show
  if (tagTypesWithTags.length === 0 && !showVendors && !showRecipes) return null

  const handleToggleTag = (tagTypeId: string, tagId: string) => {
    const currentTags = filterState[tagTypeId] || []
    const newTags = currentTags.includes(tagId)
      ? currentTags.filter((id) => id !== tagId)
      : [...currentTags, tagId]

    setFilterState({
      ...filterState,
      [tagTypeId]: newTags,
    })
  }

  const handleClearTagType = (tagTypeId: string) => {
    const newState = { ...filterState }
    delete newState[tagTypeId]
    setFilterState(newState)
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 mx-1 py-1',
        disabled ? 'opacity-50 pointer-events-none' : '',
      )}
    >
      {tagTypesWithTags.map((tagType) => {
        const tagTypeId = tagType.id
        const typeTags = tags.filter((tag) => tag.typeId === tagTypeId)
        const sortedTypeTags = sortTagsByName(typeTags)
        const selectedTagIds = filterState[tagTypeId] || []

        // Calculate dynamic counts for each tag
        const tagCounts = sortedTypeTags.map((tag) =>
          calculateTagCount(tag.id, tagTypeId, items, filterState),
        )

        return (
          <TagTypeDropdown
            key={tagTypeId}
            tagType={tagType}
            tags={sortedTypeTags}
            selectedTagIds={selectedTagIds}
            tagCounts={tagCounts}
            onToggleTag={(tagId) => handleToggleTag(tagTypeId, tagId)}
            onClear={() => handleClearTagType(tagTypeId)}
          />
        )
      })}

      {showVendors && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant={
                selectedVendorIds.length > 0 ? 'neutral' : 'neutral-ghost'
              }
              size="xs"
              className="gap-1"
            >
              Vendors
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {vendors.map((vendor) => {
              const count = items.filter((item) =>
                item.vendorIds?.includes(vendor.id),
              ).length
              return (
                <DropdownMenuCheckboxItem
                  key={vendor.id}
                  checked={selectedVendorIds.includes(vendor.id)}
                  onCheckedChange={() => toggleVendorId(vendor.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <div className="flex items-center justify-between w-full">
                    <span>{vendor.name}</span>
                    <span className="text-foreground-muted text-xs ml-2">
                      ({count})
                    </span>
                  </div>
                </DropdownMenuCheckboxItem>
              )
            })}
            {selectedVendorIds.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={clearVendorIds}>
                  <X className="h-4 w-4" />
                  <span className="text-xs">Clear</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {showRecipes && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant={
                selectedRecipeIds.length > 0 ? 'neutral' : 'neutral-ghost'
              }
              size="xs"
              className="gap-1"
            >
              Recipes
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {recipes.map((recipe) => {
              const count = items.filter((item) =>
                recipe.items.some((ri) => ri.itemId === item.id),
              ).length
              return (
                <DropdownMenuCheckboxItem
                  key={recipe.id}
                  checked={selectedRecipeIds.includes(recipe.id)}
                  onCheckedChange={() => toggleRecipeId(recipe.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <div className="flex items-center justify-between w-full">
                    <span>{recipe.name}</span>
                    <span className="text-foreground-muted text-xs ml-2">
                      ({count})
                    </span>
                  </div>
                </DropdownMenuCheckboxItem>
              )
            })}
            {selectedRecipeIds.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={clearRecipeIds}>
                  <X className="h-4 w-4" />
                  <span className="text-xs">Clear</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Link to="/settings/tags">
        <Button size="xs" variant="neutral-ghost">
          <Pencil />
          Edit
        </Button>
      </Link>
    </div>
  )
}
