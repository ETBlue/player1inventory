import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
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
  const { id } = Route.useParams()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  const tag = tags.find((t) => t.id === id)
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
      className="space-y-4 max-w-md px-6 pb-6 pt-4"
      onSubmit={(e) => {
        e.preventDefault()
        handleSave()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="tag-type">Tag Type</Label>
        <Select value={typeId} onValueChange={setTypeId}>
          <SelectTrigger id="tag-type">
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
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tag-name">Name</Label>
        <Input
          id="tag-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <Button
        type="submit"
        disabled={!isDirty || updateTag.isPending}
        className="w-full"
      >
        {updateTag.isPending ? 'Saving...' : 'Save Changes'}
      </Button>

      <DeleteButton
        trigger="Delete Tag"
        buttonVariant="destructive"
        dialogTitle="Delete Tag?"
        dialogDescription={
          <>
            Are you sure you want to delete <strong>{tag.name}</strong>?
            {affectedItemCount > 0 && (
              <span className="block mt-2 text-sm text-muted-foreground">
                This tag will be removed from {affectedItemCount} item
                {affectedItemCount !== 1 ? 's' : ''}.
              </span>
            )}
          </>
        }
        onDelete={handleDelete}
      />
    </form>
  )
}
