// src/components/ItemFilters.tsx

import { Link } from '@tanstack/react-router'
import { Pencil, X } from 'lucide-react'
import { TagTypeDropdown } from '@/components/TagTypeDropdown'
import { Button } from '@/components/ui/button'
import { calculateTagCount, type FilterState } from '@/lib/filterUtils'
import { sortTagsByName } from '@/lib/tagSortUtils'
import type { Item, Tag, TagType } from '@/types'

interface ItemFiltersProps {
  tagTypes: TagType[]
  tags: Tag[]
  items: Item[]
  filterState: FilterState
  filteredCount: number
  totalCount: number
  onFilterChange: (newState: FilterState) => void
}

export function ItemFilters({
  tagTypes,
  tags,
  items,
  filterState,
  filteredCount,
  totalCount,
  onFilterChange,
}: ItemFiltersProps) {
  // Filter to only tag types that have tags, then sort alphabetically
  const tagTypesWithTags = tagTypes
    .filter((tagType) => tags.some((tag) => tag.typeId === tagType.id))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )

  // Don't render if no tag types with tags
  if (tagTypesWithTags.length === 0) return null

  const hasActiveFilters = Object.values(filterState).some(
    (tagIds) => tagIds.length > 0,
  )

  const handleToggleTag = (tagTypeId: string, tagId: string) => {
    const currentTags = filterState[tagTypeId] || []
    const newTags = currentTags.includes(tagId)
      ? currentTags.filter((id) => id !== tagId)
      : [...currentTags, tagId]

    onFilterChange({
      ...filterState,
      [tagTypeId]: newTags,
    })
  }

  const handleClearTagType = (tagTypeId: string) => {
    const newState = { ...filterState }
    delete newState[tagTypeId]
    onFilterChange(newState)
  }

  const handleClearAll = () => {
    onFilterChange({})
  }

  return (
    <div className="space-y-1 py-1">
      <div className="flex flex-wrap items-center gap-1 mx-1">
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
        <Link to="/settings/tags">
          <Button size="xs" variant="neutral-ghost">
            <Pencil />
            Edit
          </Button>
        </Link>
      </div>
      <div className="flex items-center h-6">
        <div className="ml-3 text-xs text-foreground-muted">
          Showing {filteredCount} of {totalCount} items
        </div>
        <div className="flex-1" />
        {hasActiveFilters && (
          <Button variant="neutral-ghost" size="xs" onClick={handleClearAll}>
            <X />
            Clear filter
          </Button>
        )}
      </div>
    </div>
  )
}
