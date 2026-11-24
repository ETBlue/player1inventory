import { createFileRoute } from '@tanstack/react-router'
import { Loader2, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AddNameDialog } from '@/components/shared/AddNameDialog'
import { EmptyState } from '@/components/shared/EmptyState'
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
import { usePermissions } from '@/hooks/usePermissions'
import { showSaveError } from '@/lib/saveError'
import type { TagColor } from '@/types'

export const Route = createFileRoute('/items/$id/tags')({
  component: TagsTab,
})

function TagTypeSection({
  tagType,
  item,
  onToggle,
  onAddTag,
  loadingTagId,
  assigningTagIds = [],
  readOnly = false,
}: {
  tagType: { id: string; name: string; color: TagColor }
  item: { tagIds: string[] }
  onToggle: (tagId: string) => void
  /** Left out for a household member: no "New Tag" button. */
  onAddTag?: ((typeId: string) => void) | undefined
  loadingTagId?: string | null
  /**
   * New tags whose assign to the item is still being saved. They are already
   * in `item.tagIds` (the caller adds them), and are marked busy here.
   */
  assigningTagIds?: string[]
  /** A household member cannot toggle: the badges are aria-disabled. */
  readOnly?: boolean
}) {
  const { t } = useTranslation()
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
          const isLoading = loadingTagId === tag.id
          const isAssigning = assigningTagIds.includes(tag.id)
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
                aria-busy={isLoading || isAssigning}
                aria-disabled={readOnly || undefined}
                variant={
                  isSelected ? tagType.color : `${tagType.color}-inverse`
                }
                className={`${readOnly ? 'cursor-default' : 'cursor-pointer'} z-10 relative${isLoading ? ' pointer-events-none' : ''}`}
                onClick={() => onToggle(tag.id)}
              >
                {tag.name}
                {isLoading ? (
                  <Loader2 className="ml-1 h-3 w-3 animate-spin [transform-box:fill-box]" />
                ) : (
                  isSelected && <X className="ml-1 h-3 w-3" />
                )}
              </Badge>
            </div>
          )
        })}
        {onAddTag && (
          <Button
            variant="neutral-ghost"
            size="sm"
            className="px-0 py-0 gap-1 text-xs -my-1"
            onClick={() => onAddTag(tagType.id)}
          >
            <Plus />
            {t('items.tags.newTag.button')}
          </Button>
        )}
      </div>
    </div>
  )
}

function TagsTab() {
  const { t } = useTranslation()
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const updateItem = useUpdateItem()
  // A household member sees what is assigned and cannot change it
  // (households H5 task F.5): presses write nothing, the badges are
  // aria-disabled, and there is no "New …" button.
  const { canEditCatalog } = usePermissions()
  const { data: tagTypes = [] } = useTagTypes()
  const [addTagDialog, setAddTagDialog] = useState<string | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const createTag = useCreateTag()
  const [newTagTypeOpen, setNewTagTypeOpen] = useState(false)
  const [newTagTypeName, setNewTagTypeName] = useState('')
  const addTagType = useAddTagType()
  const [loadingTagId, setLoadingTagId] = useState<string | null>(null)
  // Issue #402: a new tag is created, then assigned to the item in a second
  // write. Between the two, the tag list already shows the new tag but the
  // item does not have it yet, so it showed as not selected for about a
  // second. Its id waits here until the assign is done, and the page shows it
  // as selected all that time. On a failed assign it is removed, so the
  // badge goes back to not selected.
  const [assigningTagIds, setAssigningTagIds] = useState<string[]>([])
  // What the user sees as assigned: the item's tags, plus new tags whose
  // assign is still being saved.
  const shownTagIds = item
    ? [
        ...item.tagIds,
        ...assigningTagIds.filter((tagId) => !item.tagIds.includes(tagId)),
      ]
    : []

  const handleAddTag = async () => {
    if (!addTagDialog || !newTagName.trim()) return
    let newTag: Awaited<ReturnType<typeof createTag.mutateAsync>>
    try {
      newTag = await createTag.mutateAsync({
        name: newTagName.trim(),
        typeId: addTagDialog,
      })
    } catch (err) {
      // The dialog stays open with the name, so the user can try again.
      // Before, this was an unhandled rejection with nothing on screen.
      showSaveError(err)
      return
    }
    // The tag exists now, so the dialog closes even if the assign below
    // fails: trying again would create the same tag a second time.
    setNewTagName('')
    setAddTagDialog(null)
    if (newTag?.id && item) {
      const newTagId = newTag.id
      setAssigningTagIds((ids) => [...ids, newTagId])
      // Immediately assign the new tag to the current item. The list keeps
      // any other new tag that is still being assigned.
      try {
        await updateItem.mutateAsync({
          id,
          updates: {
            tagIds: [...new Set([...shownTagIds, newTagId])],
          },
        })
      } catch (err) {
        showSaveError(err)
      } finally {
        // When the write has succeeded, the item already has the tag: local
        // `mutateAsync` waits for the refetch, and Apollo writes the answer
        // to its cache before it resolves.
        setAssigningTagIds((ids) => ids.filter((x) => x !== newTagId))
      }
    }
  }

  const toggleTag = async (tagId: string) => {
    // No toggle while a new tag is being assigned. Each write sends the
    // WHOLE list, so a second write at the same time could leave out the
    // other one's change, depending on which one the server takes last.
    if (
      !item ||
      !canEditCatalog ||
      loadingTagId !== null ||
      assigningTagIds.length > 0
    )
      return

    const newTagIds = item.tagIds.includes(tagId)
      ? item.tagIds.filter((id) => id !== tagId)
      : [...item.tagIds, tagId]

    setLoadingTagId(tagId)
    try {
      await updateItem.mutateAsync({ id, updates: { tagIds: newTagIds } })
    } catch (err) {
      // Shown, not left unhandled: this runs straight off a click
      showSaveError(err)
    } finally {
      setLoadingTagId(null)
    }
  }

  if (!item) return null

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      {tagTypes.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <EmptyState
            title={t('items.tags.empty.title')}
            description={t('items.tags.empty.description')}
          />
          {canEditCatalog && (
            <Button
              variant="neutral-outline"
              onClick={() => setNewTagTypeOpen(true)}
            >
              {t('items.tags.newTagType.button')}
            </Button>
          )}
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
                item={{ tagIds: shownTagIds }}
                onToggle={toggleTag}
                onAddTag={canEditCatalog ? setAddTagDialog : undefined}
                readOnly={!canEditCatalog}
                loadingTagId={loadingTagId}
                assigningTagIds={assigningTagIds}
              />
            ))}
          {shownTagIds.length === 0 && (
            <EmptyState
              title={t('items.tags.assignEmpty.title')}
              description={t('items.tags.assignEmpty.description')}
            />
          )}
        </div>
      )}
      <AddNameDialog
        open={!!addTagDialog}
        title={t('items.tags.newTag.dialogTitle')}
        submitLabel={t('items.tags.newTag.submitLabel')}
        name={newTagName}
        placeholder={t('items.tags.newTag.placeholder')}
        isPending={createTag.isPending}
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
          try {
            await addTagType({ name: newTagTypeName.trim() })
          } catch (err) {
            // The dialog stays open with the name, so the user can try again
            showSaveError(err)
            return
          }
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
