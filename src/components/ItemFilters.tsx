// src/components/ItemFilters.tsx

import { X } from 'lucide-react'
import { TagTypeDropdown } from '@/components/TagTypeDropdown'
import { Button } from '@/components/ui/button'
import { calculateTagCount, type FilterState } from '@/lib/filterUtils'
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
  // Filter to only tag types that have tags
  const tagTypesWithTags = tagTypes.filter((tagType) =>
    tags.some((tag) => tag.typeId === tagType.id),
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {tagTypesWithTags.map((tagType) => {
          const tagTypeId = tagType.id
          const typeTags = tags.filter((tag) => tag.typeId === tagTypeId)
          const selectedTagIds = filterState[tagTypeId] || []

          // Calculate dynamic counts for each tag
          const tagCounts = typeTags.map((tag) =>
            calculateTagCount(tag.id, tagTypeId, items, filterState),
          )

          return (
            <TagTypeDropdown
              key={tagTypeId}
              tagType={tagType}
              tags={typeTags}
              selectedTagIds={selectedTagIds}
              tagCounts={tagCounts}
              onToggleTag={(tagId) => handleToggleTag(tagTypeId, tagId)}
              onClear={() => handleClearTagType(tagTypeId)}
            />
          )
        })}
        {hasActiveFilters && (
          <Button
            variant="neutral-ghost"
            size="sm"
            className="gap-1"
            onClick={handleClearAll}
          >
            <X className="h-4 w-4 mr-1" />
            Clear all
          </Button>
        )}
      </div>
      <div className="text-sm text-foreground-muted">
        Showing {filteredCount} of {totalCount} items
      </div>
    </div>
  )
}
