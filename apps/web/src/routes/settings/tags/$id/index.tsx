import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/DeleteButton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useTagLayout } from '@/hooks/useTagLayout'
import {
  useDeleteTag,
  useItemCountByTag,
  useTags,
  useTagsWithDepth,
  useTagTypes,
  useUpdateTag,
} from '@/hooks/useTags'
import { getTagAndDescendantIds } from '@/lib/tagUtils'
import type { Tag } from '@/types'

export const Route = createFileRoute('/settings/tags/$id/')({
  component: TagInfoTab,
})

// Sentinel value used in the Select to represent "no parent" (top-level).
// Must not be empty string — Radix UI Select disallows empty string as SelectItem value.
const NO_PARENT = '__none__'

function TagInfoTab() {
  const { t } = useTranslation()
  const { id } = Route.useParams()
  const { data: tags = [] } = useTags()
  const { data: tagsWithDepth = [] } = useTagsWithDepth()
  const { data: tagTypes = [] } = useTagTypes()
  const tag = tags.find((tag) => tag.id === id)
  const updateTag = useUpdateTag()
  const { registerDirtyState } = useTagLayout()
  const { goBack } = useAppNavigation()
  const deleteTag = useDeleteTag()
  const { data: affectedItemCount = 0 } = useItemCountByTag(id)

  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState('')
  // parentId state: NO_PARENT sentinel = no parent (top-level)
  const [parentId, setParentId] = useState(NO_PARENT)
  const [savedAt, setSavedAt] = useState(0)
  const [isInitialized, setIsInitialized] = useState(false)
  // Parent-delete dialog: open when deleting a tag that has children
  const [parentDeleteOpen, setParentDeleteOpen] = useState(false)

  // Sync state when tag loads or after save
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally sync only on id change or after save
  useEffect(() => {
    if (tag) {
      setName(tag.name)
      setTypeId(tag.typeId)
      setParentId((tag as Tag & { parentId?: string }).parentId ?? NO_PARENT)
      setIsInitialized(true)
    }
  }, [tag?.id, savedAt])

  // Build parent options: all tags with same typeId, excluding self and descendants
  const excludedIds = new Set(getTagAndDescendantIds(id, tags))
  const parentOptions = tagsWithDepth.filter(
    (t) => t.typeId === typeId && !excludedIds.has(t.id),
  )

  const savedParentId =
    (tag as (Tag & { parentId?: string }) | undefined)?.parentId ?? NO_PARENT

  const isDirty =
    tag && isInitialized
      ? name !== tag.name || typeId !== tag.typeId || parentId !== savedParentId
      : false

  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const handleSave = async () => {
    if (!tag || !isDirty) return
    // Build updates; parentId is an extra optional field beyond the base Tag type.
    // Using a type assertion here because the DB layer and hooks support parentId
    // even though the shared Tag type (from @p1i/types) does not declare it.
    const updates = {
      name,
      typeId,
      // Pass undefined to clear parentId (DB layer uses modify/delete for this)
      parentId: parentId === NO_PARENT ? undefined : parentId,
    } as Parameters<typeof updateTag.mutateAsync>[0]['updates']
    await updateTag.mutateAsync({ id, updates })
    setSavedAt((n) => n + 1)
    goBack()
  }

  // Child tags of the current tag — determines whether to show the cascade/orphan dialog
  const childTags = tags.filter(
    (t) => (t as Tag & { parentId?: string }).parentId === id,
  )
  const hasChildren = childTags.length > 0

  const handleDeletePress = () => {
    if (hasChildren) {
      setParentDeleteOpen(true)
    }
    // If no children, DeleteButton handles its own confirmation dialog → onDelete callback
  }

  const handleDeleteNoChildren = async () => {
    await deleteTag.mutateAsync({ id })
    goBack()
  }

  const handleDeleteCascade = async () => {
    await deleteTag.mutateAsync({ id, deleteChildren: true })
    setParentDeleteOpen(false)
    goBack()
  }

  const handleDeleteOrphan = async () => {
    await deleteTag.mutateAsync({ id, deleteChildren: false })
    setParentDeleteOpen(false)
    goBack()
  }

  // Don't render until we have both tag and tagTypes loaded
  // This prevents Radix Select from clearing the value when options aren't available yet
  if (!tag || !isInitialized || tagTypes.length === 0) return null

  return (
    <div className="p-4">
      <form
        className="space-y-4 max-w-2xl mx-auto"
        onSubmit={(e) => {
          e.preventDefault()
          handleSave()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="tag-parent">
            {t('settings.tags.tag.parentLabel')}
          </Label>
          <Select value={parentId} onValueChange={setParentId}>
            <SelectTrigger id="tag-parent" className="capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PARENT}>
                {t('settings.tags.tag.parentNone')}
              </SelectItem>
              {parentOptions.map((option) => (
                <SelectItem
                  key={option.id}
                  value={option.id}
                  className="capitalize"
                  style={{ paddingLeft: `${(option.depth + 1) * 1}rem` }}
                >
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tag-type">{t('settings.tags.tag.typeLabel')}</Label>
          <Select
            value={typeId}
            onValueChange={(newTypeId) => {
              setTypeId(newTypeId)
              // Changing type invalidates the current parent (different type's tags),
              // so reset to no parent
              setParentId(NO_PARENT)
            }}
          >
            <SelectTrigger id="tag-type" className="capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...tagTypes]
                .sort((a, b) =>
                  a.name.localeCompare(b.name, undefined, {
                    sensitivity: 'base',
                  }),
                )
                .map((type) => (
                  <SelectItem
                    key={type.id}
                    value={type.id}
                    className="capitalize"
                  >
                    {type.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tag-name">{t('settings.tags.tag.nameLabel')}</Label>
          <Input
            id="tag-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="capitalize"
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={!isDirty || updateTag.isPending}
        >
          {updateTag.isPending ? t('common.saving') : t('common.save')}
        </Button>

        {hasChildren ? (
          <>
            <Button
              type="button"
              variant="destructive-ghost"
              className="w-full"
              onClick={handleDeletePress}
            >
              {t('common.delete')}
            </Button>

            <AlertDialog
              open={parentDeleteOpen}
              onOpenChange={(open) => {
                // Reset to closed on dismiss — always starts fresh
                if (!open) setParentDeleteOpen(false)
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('settings.tags.tag.deleteParentTitle')}
                  </AlertDialogTitle>
                </AlertDialogHeader>
                <AlertDialogDescription>
                  {t('settings.tags.tag.deleteParentDescription')}
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <AlertDialogAction
                      variant="neutral-outline"
                      onClick={handleDeleteOrphan}
                    >
                      {t('settings.tags.tag.deleteParentOrphan')}
                    </AlertDialogAction>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={handleDeleteCascade}
                    >
                      {t('settings.tags.tag.deleteParentCascade')}
                    </AlertDialogAction>
                  </div>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <DeleteButton
            trigger={t('common.delete')}
            dialogTitle={t('settings.tags.tag.deleteTitle')}
            buttonClassName="w-full"
            dialogDescription={
              affectedItemCount > 0
                ? t('settings.tags.tag.deleteWithItems', {
                    name: tag.name,
                    count: affectedItemCount,
                  })
                : t('settings.tags.tag.deleteNoItems', { name: tag.name })
            }
            onDelete={handleDeleteNoChildren}
          />
        )}
      </form>
    </div>
  )
}
