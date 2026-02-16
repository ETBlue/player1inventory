import { createFileRoute } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AddTagDialog } from '@/components/AddTagDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  useCreateTag,
  useItem,
  useTags,
  useTagTypes,
  useUpdateItem,
} from '@/hooks'
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
  const [addTagDialog, setAddTagDialog] = useState<string | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const createTag = useCreateTag()

  // Tags tab never has unsaved changes (saves immediately)
  useEffect(() => {
    registerDirtyState(false)
  }, [registerDirtyState])

  const handleAddTag = () => {
    if (addTagDialog && newTagName.trim()) {
      createTag.mutate({
        name: newTagName.trim(),
        typeId: addTagDialog,
      })
      setNewTagName('')
      setAddTagDialog(null)
    }
  }

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
                    <Button
                      variant="neutral-ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setAddTagDialog(tagType.id)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Tag
                    </Button>
                  </div>
                </div>
              )
            })}
        </div>
      )}
      <AddTagDialog
        open={!!addTagDialog}
        tagName={newTagName}
        onTagNameChange={setNewTagName}
        onAdd={handleAddTag}
        onClose={() => setAddTagDialog(null)}
      />
    </div>
  )
}
