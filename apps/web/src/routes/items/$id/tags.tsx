import { createFileRoute } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { TopBarSaveButton } from '@/components/item/TopBarSaveButton'
import { AddNameDialog } from '@/components/shared/AddNameDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  useCreateTag,
  useCreateTagType,
  useItem,
  useTags,
  useTagsWithDepth,
  useTagTypes,
  useUpdateItem,
} from '@/hooks'
import { usePermissions } from '@/hooks/usePermissions'
import { useRelationDraft } from '@/hooks/useRelationDraft'
import { useRelationTabSave } from '@/hooks/useRelationTabSave'
import { pressOnEnterOrSpace } from '@/lib/pressKeys'
import { showSaveError } from '@/lib/saveError'
import type { TagColor } from '@/types'

export const Route = createFileRoute('/items/$id/tags')({
  component: TagsTab,
})

function TagTypeSection({
  tagType,
  shownTagIds,
  onToggle,
  onAddTag,
  readOnly = false,
  saving = false,
}: {
  tagType: { id: string; name: string; color: TagColor }
  /** The tags shown as selected: the saved list with the draft applied. */
  shownTagIds: readonly string[]
  onToggle: (tagId: string) => void
  /** Left out for a household member: no "New Tag" button. */
  onAddTag?: ((typeId: string) => void) | undefined
  /** A household member cannot toggle: the badges are aria-disabled. */
  readOnly?: boolean
  /**
   * A Save is running. The badges are aria-disabled and a press does
   * nothing, so the list sent is the list on screen (owner answer 9A).
   */
  saving?: boolean
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
          const isSelected = shownTagIds.includes(tag.id)
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
                aria-disabled={readOnly || saving || undefined}
                // Reached by Tab and pressed with Enter or Space (owner
                // answer 8A). A read-only badge is not in the Tab order.
                tabIndex={readOnly ? undefined : 0}
                variant={
                  isSelected ? tagType.color : `${tagType.color}-inverse`
                }
                className={`${readOnly ? 'cursor-default' : 'cursor-pointer'} z-10 relative`}
                onClick={() => onToggle(tag.id)}
                onKeyDown={
                  readOnly
                    ? undefined
                    : pressOnEnterOrSpace(() => onToggle(tag.id))
                }
              >
                {tag.name}
                {isSelected && <X className="ml-1 h-3 w-3" />}
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
  // (households H5 task F.5): presses do nothing, the badges are
  // aria-disabled, and there is no "New …" button and no Save.
  const { canEditCatalog } = usePermissions()
  const { data: tagTypes = [] } = useTagTypes()
  const { data: allTags } = useTags()
  const [addTagDialog, setAddTagDialog] = useState<string | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const createTag = useCreateTag()
  const [newTagTypeOpen, setNewTagTypeOpen] = useState(false)
  const [newTagTypeName, setNewTagTypeName] = useState('')
  const createTagType = useCreateTagType()
  // A press changes only the screen; the top bar Save writes the list (item
  // relations Save, design
  // `docs/features/items/2026-11-27-item-relations-save-design.md`). The
  // draft replaces the issue #402 state (`assigningTagIds`) and the press
  // spinner (`loadingTagId`): a new tag goes into the draft the moment it is
  // created, so it shows as selected through the same rule as a press.
  const draft = useRelationDraft(
    item?.tagIds ?? [],
    allTags?.map((tag) => tag.id),
    { canEdit: canEditCatalog },
  )
  const saving = updateItem.isPending

  const save = async (): Promise<boolean> => {
    if (!item) return false
    // The list on screen now. Kept, so the end of the Save takes out of the
    // draft only what was sent: a row created while the Save runs stays.
    const sent = draft.shown
    try {
      // Cloud: a tag list is configuration, so no location is resolved and
      // this works in a household with no location
      await updateItem.mutateAsync({ id, updates: { tagIds: sent } })
    } catch (err) {
      // The draft stays, so the person can press Save again
      showSaveError(err, { catalog: true })
      return false
    }
    // The item already has the saved list here: local `mutateAsync` waits
    // for the refetch, and Apollo writes the answer to its cache first. So
    // emptying the draft does not flicker the badges back.
    draft.reset(sent)
    toast.success(t('items.detail.saved'))
    return true
  }

  const { canSave, saveSlot } = useRelationTabSave({
    dirty: draft.dirty,
    isPending: saving,
    canEdit: canEditCatalog,
    save,
  })

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
      showSaveError(err, { catalog: true })
      return
    }
    setNewTagName('')
    setAddTagDialog(null)
    // The tag is created at once (owner answer 1A), but only Save gives it
    // to the item. Until then it is shown as selected. Discard keeps the
    // tag, not assigned.
    if (newTag?.id) draft.add(newTag.id)
  }

  const toggleTag = (tagId: string) => {
    if (!item || !canEditCatalog || saving) return
    draft.press(tagId)
  }

  if (!item) return null

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <TopBarSaveButton
        saveSlot={saveSlot}
        onClick={save}
        disabled={!canSave}
        isLoading={saving}
      />
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
                shownTagIds={draft.shown}
                onToggle={toggleTag}
                onAddTag={canEditCatalog ? setAddTagDialog : undefined}
                readOnly={!canEditCatalog}
                saving={saving}
              />
            ))}
          {draft.shown.length === 0 && (
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
        isPending={createTagType.isPending}
        onNameChange={setNewTagTypeName}
        onAdd={async () => {
          if (!newTagTypeName.trim()) return
          try {
            await createTagType.mutateAsync({ name: newTagTypeName.trim() })
          } catch (err) {
            // The dialog stays open with the name, so the user can try again
            showSaveError(err, { catalog: true })
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
