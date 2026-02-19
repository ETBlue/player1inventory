// src/components/ItemFilters.tsx

import { Link } from '@tanstack/react-router'
import { Pencil } from 'lucide-react'
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
  onFilterChange: (newState: FilterState) => void
}

export function ItemFilters({
  tagTypes,
  tags,
  items,
  filterState,
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

  return (
    <div className="flex flex-wrap items-center gap-1 mx-1 py-1">
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
  )
}
