import { createFileRoute } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AddNameDialog } from '@/components/AddNameDialog'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  useCreateTag,
  useItem,
  useTagsWithDepth,
  useTagTypes,
  useUpdateItem,
} from '@/hooks'
import { useAddTagType } from '@/hooks/useAddTagType'
import type { TagColor } from '@/types'

export const Route = createFileRoute('/items/$id/tags')({
  component: TagsTab,
})

function TagTypeSection({
  tagType,
  item,
  onToggle,
  onAddTag,
}: {
  tagType: { id: string; name: string; color: TagColor }
  item: { tagIds: string[] }
  onToggle: (tagId: string) => void
  onAddTag: (typeId: string) => void
}) {
  const { data: tagsWithDepth = [] } = useTagsWithDepth(tagType.id)

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center my-2">
        <div className="h-px bg-accessory-emphasized" />
        <h2 className="text-sm font-medium uppercase">{tagType.name}</h2>
        <div className="h-px bg-accessory-emphasized" />
      </div>

      <div className="space-y-1">
        {tagsWithDepth.map((tag) => {
          const isSelected = item.tagIds.includes(tag.id)
          const depth = tag.depth ?? 0
          return (
            <div
              key={tag.id}
              className="relative"
              style={depth > 0 ? { marginLeft: depth * 16 } : undefined}
            >
              {Array.from({ length: depth }, (_, i) => i * 16 + 8).map(
                (leftPx) => (
                  <div
                    key={`connector-at-${leftPx}px`}
                    className="border-r border-accessory-emphasized absolute"
                    style={{
                      right: 'auto',
                      top: '-14px',
                      bottom: '10px',
                      left: `-${leftPx}px`,
                    }}
                  />
                ),
              )}
              {depth > 0 && (
                <div className="absolute w-2 h-px bg-accessory-emphasized -left-2 top-3" />
              )}
              <Badge
                role="button"
                aria-pressed={isSelected}
                variant={isSelected ? tagType.color : `${tagType.color}-tint`}
                className={`cursor-pointer z-10 relative`}
                onClick={() => onToggle(tag.id)}
              >
                {tag.name}
                {isSelected && <X className="ml-1 h-3 w-3" />}
              </Badge>
            </div>
          )
        })}
        <Button
          variant="neutral-ghost"
          size="sm"
          className="px-0 py-0 gap-1 text-xs -my-1"
          onClick={() => onAddTag(tagType.id)}
        >
          <Plus />
          New Tag
        </Button>
      </div>
    </div>
  )
}

function TagsTab() {
  const { t } = useTranslation()
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const updateItem = useUpdateItem()
  const { data: tagTypes = [] } = useTagTypes()
  const [addTagDialog, setAddTagDialog] = useState<string | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const createTag = useCreateTag()
  const [newTagTypeOpen, setNewTagTypeOpen] = useState(false)
  const [newTagTypeName, setNewTagTypeName] = useState('')
  const addTagType = useAddTagType()

  const handleAddTag = async () => {
    if (addTagDialog && newTagName.trim()) {
      const newTag = await createTag.mutateAsync({
        name: newTagName.trim(),
        typeId: addTagDialog,
      })
      if (newTag?.id && item) {
        // Immediately assign the new tag to the current item
        updateItem.mutate({
          id,
          updates: { tagIds: [...item.tagIds, newTag.id] },
        })
      }
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
    <div className="space-y-6 max-w-2xl mx-auto">
      {tagTypes.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <EmptyState
            title={t('items.tags.empty.title')}
            description={t('items.tags.empty.description')}
          />
          <Button
            variant="neutral-outline"
            onClick={() => setNewTagTypeOpen(true)}
          >
            {t('items.tags.newTagType.button')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {[...tagTypes]
            .sort((a, b) =>
              a.name.localeCompare(b.name, undefined, {
                sensitivity: 'base',
              }),
            )
            .map((tagType) => (
              <TagTypeSection
                key={tagType.id}
                tagType={tagType}
                item={item}
                onToggle={toggleTag}
                onAddTag={setAddTagDialog}
              />
            ))}
          {item.tagIds.length === 0 && (
            <EmptyState
              title={t('items.tags.assignEmpty.title')}
              description={t('items.tags.assignEmpty.description')}
            />
          )}
        </div>
      )}
      <AddNameDialog
        open={!!addTagDialog}
        title="Add Tag"
        submitLabel="Add Tag"
        name={newTagName}
        placeholder="e.g., Dairy, Frozen"
        onNameChange={setNewTagName}
        onAdd={handleAddTag}
        onClose={() => setAddTagDialog(null)}
      />
      <AddNameDialog
        open={newTagTypeOpen}
        title={t('items.tags.newTagType.dialogTitle')}
        submitLabel={t('common.add')}
        name={newTagTypeName}
        onNameChange={setNewTagTypeName}
        onAdd={async () => {
          if (!newTagTypeName.trim()) return
          await addTagType({ name: newTagTypeName.trim() })
          setNewTagTypeName('')
          setNewTagTypeOpen(false)
        }}
        onClose={() => {
          setNewTagTypeName('')
          setNewTagTypeOpen(false)
        }}
      />
    </div>
  )
}
