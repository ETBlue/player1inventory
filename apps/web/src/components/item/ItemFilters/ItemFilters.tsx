// src/components/ItemFilters.tsx

import { Link } from '@tanstack/react-router'
import { ChevronDown, CookingPot, Pencil, Store, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TagTypeDropdown } from '@/components/tag/TagTypeDropdown'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTags, useTagsWithDepth, useTagTypes } from '@/hooks/useTags'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { calculateTagCount } from '@/lib/filterUtils'
import { cn } from '@/lib/utils'
import type { Item, Recipe, Tag, TagType, Vendor } from '@/types'

// ---------------------------------------------------------------------------
// Shared prop types
// ---------------------------------------------------------------------------

interface ItemFiltersBaseProps {
  items: Item[] // search-scoped items for available tag option computation
  disabled?: boolean
  vendors?: Vendor[]
  recipes?: Recipe[]
  hideVendorFilter?: boolean
  hideRecipeFilter?: boolean
  /** When true, hides the "Edit Tags" link. Use in contexts without router navigation (e.g. onboarding). */
  hideEditTagsLink?: boolean
}

// Props for the DB-driven (default) variant — no overrides needed
interface ItemFiltersDbProps extends ItemFiltersBaseProps {
  tagTypes?: undefined
  tags?: undefined
  tagsWithDepth?: undefined
  filterState?: undefined
  onFilterStateChange?: undefined
}

// Props for the controlled (props-driven) variant — all data comes from outside
interface ItemFiltersControlledProps extends ItemFiltersBaseProps {
  /** Tag types to display. When provided, skips the DB hook. */
  tagTypes: TagType[]
  /** Flat list of all tags. When provided, skips the DB hook. */
  tags: Tag[]
  /** Depth-first ordered tags (same shape as useTagsWithDepth). When provided, skips the DB hook. */
  tagsWithDepth: Array<Tag & { depth: number }>
  /** Controlled filter state (tag type id → selected tag ids). When provided with onFilterStateChange, skips URL params. */
  filterState: Record<string, string[]>
  /** Called when the controlled filter state changes. */
  onFilterStateChange: (state: Record<string, string[]>) => void
}

export type ItemFiltersProps = ItemFiltersDbProps | ItemFiltersControlledProps

// ---------------------------------------------------------------------------
// Shared render logic
// ---------------------------------------------------------------------------

interface ItemFiltersRenderProps {
  items: Item[]
  disabled?: boolean
  vendors: Vendor[]
  recipes: Recipe[]
  hideVendorFilter?: boolean
  hideRecipeFilter?: boolean
  hideEditTagsLink?: boolean
  tagTypes: TagType[]
  tags: Tag[]
  tagsWithDepth: Array<Tag & { depth: number }>
  filterState: Record<string, string[]>
  setFilterState: (state: Record<string, string[]>) => void
  selectedVendorIds: string[]
  selectedRecipeIds: string[]
  toggleVendorId: (id: string) => void
  toggleRecipeId: (id: string) => void
  clearVendorIds: () => void
  clearRecipeIds: () => void
}

function ItemFiltersRenderer({
  items,
  disabled,
  vendors,
  recipes,
  hideVendorFilter,
  hideRecipeFilter,
  hideEditTagsLink,
  tagTypes,
  tags,
  tagsWithDepth,
  filterState,
  setFilterState,
  selectedVendorIds,
  selectedRecipeIds,
  toggleVendorId,
  toggleRecipeId,
  clearVendorIds,
  clearRecipeIds,
}: ItemFiltersRenderProps) {
  const { t } = useTranslation()

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
    const currentTags = filterState[tagTypeId] ?? []
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
              <Store />
              {t('settings.vendors.label')}
              {selectedVendorIds.length > 0 && (
                <span className="text-xs font-semibold">
                  {selectedVendorIds.length}
                </span>
              )}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
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
                  <span className="text-xs">{t('common.clear')}</span>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                to="/settings/vendors"
                className="flex items-center gap-1.5"
              >
                <Pencil className="h-4 w-4" />
                <span className="text-xs">{t('common.manage')}</span>
              </Link>
            </DropdownMenuItem>
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
              <CookingPot />
              {t('settings.recipes.label')}
              {selectedRecipeIds.length > 0 && (
                <span className="text-xs font-semibold">
                  {selectedRecipeIds.length}
                </span>
              )}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
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
                    <span className="capitalize">{recipe.name}</span>
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
                  <span className="text-xs">{t('common.clear')}</span>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                to="/settings/recipes"
                className="flex items-center gap-1.5"
              >
                <Pencil className="h-4 w-4" />
                <span className="text-xs">{t('common.manage')}</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {tagTypesWithTags.map((tagType) => {
        const tagTypeId = tagType.id
        // Use depth-first ordered tags for hierarchical display
        const orderedTypeTags = tagsWithDepth.filter(
          (tag) => tag.typeId === tagTypeId,
        )
        const selectedTagIds = filterState[tagTypeId] ?? []

        // Calculate dynamic counts for each tag, with descendant expansion
        const tagCounts = orderedTypeTags.map((tag) =>
          calculateTagCount(tag.id, tagTypeId, items, filterState, tags),
        )

        return (
          <TagTypeDropdown
            key={tagTypeId}
            tagType={tagType}
            tags={orderedTypeTags}
            selectedTagIds={selectedTagIds}
            tagCounts={tagCounts}
            onToggleTag={(tagId) => handleToggleTag(tagTypeId, tagId)}
            onClear={() => handleClearTagType(tagTypeId)}
          />
        )
      })}

      {!hideEditTagsLink && (
        <Link to="/settings/tags">
          <Button size="xs" variant="neutral-ghost">
            <Pencil />
            {t('itemFilters.editTags')}
          </Button>
        </Link>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DB-driven variant (default): reads tag data and filter state from hooks
// ---------------------------------------------------------------------------

function ItemFiltersDb({
  items,
  disabled,
  vendors = [],
  recipes = [],
  hideVendorFilter,
  hideRecipeFilter,
  hideEditTagsLink,
}: ItemFiltersDbProps) {
  const { data: tagTypes = [] } = useTagTypes()
  const { data: tags = [] } = useTags()
  const { data: tagsWithDepth = [] } = useTagsWithDepth()
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

  return (
    <ItemFiltersRenderer
      items={items}
      {...(disabled !== undefined && { disabled })}
      vendors={vendors}
      recipes={recipes}
      {...(hideVendorFilter !== undefined && { hideVendorFilter })}
      {...(hideRecipeFilter !== undefined && { hideRecipeFilter })}
      {...(hideEditTagsLink !== undefined && { hideEditTagsLink })}
      tagTypes={tagTypes}
      tags={tags}
      tagsWithDepth={tagsWithDepth}
      filterState={filterState}
      setFilterState={setFilterState}
      selectedVendorIds={selectedVendorIds}
      selectedRecipeIds={selectedRecipeIds}
      toggleVendorId={toggleVendorId}
      toggleRecipeId={toggleRecipeId}
      clearVendorIds={clearVendorIds}
      clearRecipeIds={clearRecipeIds}
    />
  )
}

// ---------------------------------------------------------------------------
// Controlled variant: all data and filter state come from props
// ---------------------------------------------------------------------------

function ItemFiltersControlled({
  items,
  disabled,
  vendors = [],
  recipes = [],
  hideVendorFilter,
  hideRecipeFilter,
  hideEditTagsLink,
  tagTypes,
  tags,
  tagsWithDepth,
  filterState,
  onFilterStateChange,
}: ItemFiltersControlledProps) {
  // Vendor/recipe filters are URL-based and not applicable in controlled mode.
  // Callers using controlled mode should pass hideVendorFilter/hideRecipeFilter.
  const noopToggle = (_id: string) => {}
  const noopClear = () => {}

  return (
    <ItemFiltersRenderer
      items={items}
      {...(disabled !== undefined && { disabled })}
      vendors={vendors}
      recipes={recipes}
      {...(hideVendorFilter !== undefined && { hideVendorFilter })}
      {...(hideRecipeFilter !== undefined && { hideRecipeFilter })}
      {...(hideEditTagsLink !== undefined && { hideEditTagsLink })}
      tagTypes={tagTypes}
      tags={tags}
      tagsWithDepth={tagsWithDepth}
      filterState={filterState}
      setFilterState={onFilterStateChange}
      selectedVendorIds={[]}
      selectedRecipeIds={[]}
      toggleVendorId={noopToggle}
      toggleRecipeId={noopToggle}
      clearVendorIds={noopClear}
      clearRecipeIds={noopClear}
    />
  )
}

// ---------------------------------------------------------------------------
// Public entry point: selects variant based on whether props are provided
// ---------------------------------------------------------------------------

export function ItemFilters(props: ItemFiltersProps) {
  if (
    props.tagTypes !== undefined &&
    props.tags !== undefined &&
    props.tagsWithDepth !== undefined &&
    props.filterState !== undefined &&
    props.onFilterStateChange !== undefined
  ) {
    return <ItemFiltersControlled {...(props as ItemFiltersControlledProps)} />
  }
  return <ItemFiltersDb {...(props as ItemFiltersDbProps)} />
}
