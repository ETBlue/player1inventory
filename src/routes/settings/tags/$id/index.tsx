import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/DeleteButton'
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
  useTagTypes,
  useUpdateTag,
} from '@/hooks/useTags'

export const Route = createFileRoute('/settings/tags/$id/')({
  component: TagInfoTab,
})

function TagInfoTab() {
  const { t } = useTranslation()
  const { id } = Route.useParams()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  const tag = tags.find((tag) => tag.id === id)
  const updateTag = useUpdateTag()
  const { registerDirtyState } = useTagLayout()
  const { goBack } = useAppNavigation()
  const deleteTag = useDeleteTag()
  const { data: affectedItemCount = 0 } = useItemCountByTag(id)

  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState('')
  const [savedAt, setSavedAt] = useState(0)
  const [isInitialized, setIsInitialized] = useState(false)

  // Sync state when tag loads or after save
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally sync only on id change or after save
  useEffect(() => {
    if (tag) {
      setName(tag.name)
      setTypeId(tag.typeId)
      setIsInitialized(true)
    }
  }, [tag?.id, savedAt])

  const isDirty =
    tag && isInitialized ? name !== tag.name || typeId !== tag.typeId : false

  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const handleSave = () => {
    if (!tag || !isDirty) return
    updateTag.mutate(
      { id, updates: { name, typeId } },
      {
        onSuccess: () => {
          setSavedAt((n) => n + 1)
          goBack()
        },
      },
    )
  }

  const handleDelete = async () => {
    deleteTag.mutate(id, {
      onSuccess: () => goBack(),
    })
  }

  // Don't render until we have both tag and tagTypes loaded
  // This prevents Radix Select from clearing the value when options aren't available yet
  if (!tag || !isInitialized || tagTypes.length === 0) return null

  return (
    <form
      className="space-y-4 max-w-2xl px-6 pb-6 pt-4"
      onSubmit={(e) => {
        e.preventDefault()
        handleSave()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="tag-type">{t('settings.tags.tag.typeLabel')}</Label>
        <Select value={typeId} onValueChange={setTypeId}>
          <SelectTrigger id="tag-type" className="capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tagTypes
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
        {updateTag.isPending
          ? t('settings.tags.detail.saving')
          : t('settings.tags.detail.save')}
      </Button>

      <DeleteButton
        trigger="Delete"
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
        onDelete={handleDelete}
      />
    </form>
  )
}
