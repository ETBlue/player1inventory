import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { TagInfoForm } from '@/components/tag/TagInfoForm'
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

  // Parent-delete dialog: open when deleting a tag that has children
  const [parentDeleteOpen, setParentDeleteOpen] = useState(false)

  // Build parent options: all tags with same typeId, excluding self and descendants
  const currentTypeId = tag?.typeId ?? ''
  const excludedIds = new Set(getTagAndDescendantIds(id, tags))
  const parentOptions = tagsWithDepth.filter(
    (t) => t.typeId === currentTypeId && !excludedIds.has(t.id),
  )

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
  if (!tag || tagTypes.length === 0) return null

  return (
    <div className="p-4 bg-background-elevated min-h-[100cqh]">
      <div className="space-y-4 max-w-2xl mx-auto">
        <TagInfoForm
          tag={tag}
          tagTypes={tagTypes}
          parentOptions={parentOptions}
          onSave={(data) =>
            updateTag
              .mutateAsync({
                id: tag.id,
                updates: {
                  name: data.name,
                  typeId: data.typeId,
                  // Using type assertion: DB layer supports parentId even though
                  // shared Tag type doesn't declare it on updates shape
                  ...(data.parentId !== undefined
                    ? { parentId: data.parentId }
                    : { parentId: undefined }),
                } as Parameters<typeof updateTag.mutateAsync>[0]['updates'],
              })
              .then(() => goBack())
          }
          isPending={updateTag.isPending}
          onDirtyChange={registerDirtyState}
        />

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
      </div>
    </div>
  )
}
