import { createFileRoute } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { useItem, useTags, useTagTypes, useUpdateItem } from '@/hooks'
import { useItemLayout } from '@/hooks/useItemLayout'
import { sortTagsByName } from '@/lib/tagSortUtils'

export const Route = createFileRoute('/items/$id/tags')({
  component: TagsTab,
})

function TagsTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const updateItem = useUpdateItem()
  const { data: tagTypes = [] } = useTagTypes()
  const { data: allTags = [] } = useTags()
  const { registerDirtyState } = useItemLayout()

  // Tags tab never has unsaved changes (saves immediately)
  useEffect(() => {
    registerDirtyState(false)
  }, [registerDirtyState])

  const toggleTag = (tagId: string) => {
    if (!item) return

    const newTagIds = item.tagIds.includes(tagId)
      ? item.tagIds.filter((id) => id !== tagId)
      : [...item.tagIds, tagId]

    // Immediate save with optimistic update
    updateItem.mutate({ id, updates: { tagIds: newTagIds } })
  }

  if (!item) return null

  return (
    <div className="space-y-6 max-w-2xl">
      {tagTypes.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          No tags yet. Create tags in Settings.
        </p>
      ) : (
        <div className="space-y-3">
          {[...tagTypes]
            .sort((a, b) =>
              a.name.localeCompare(b.name, undefined, {
                sensitivity: 'base',
              }),
            )
            .map((tagType) => {
              const typeTags = allTags.filter((t) => t.typeId === tagType.id)
              if (typeTags.length === 0) return null
              const sortedTypeTags = sortTagsByName(typeTags)

              return (
                <div
                  key={tagType.id}
                  className="first:mt-0 mt-6 first:pt-0 pt-3 first:border-t-0 border-t border-border"
                >
                  <p className="text-sm font-medium text-foreground-muted mb-1 capitalize">
                    {tagType.name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sortedTypeTags.map((tag) => {
                      const isSelected = item.tagIds.includes(tag.id)

                      return (
                        <Badge
                          key={tag.id}
                          variant={
                            isSelected ? tagType.color : 'neutral-outline'
                          }
                          className="cursor-pointer"
                          onClick={() => toggleTag(tag.id)}
                        >
                          {tag.name}
                          {isSelected && <X className="ml-1 h-3 w-3" />}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
