import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { TagNameForm } from '@/components/TagNameForm'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useTagLayout } from '@/hooks/useTagLayout'
import { useTags, useUpdateTag } from '@/hooks/useTags'

export const Route = createFileRoute('/settings/tags/$id/')({
  component: TagInfoTab,
})

function TagInfoTab() {
  const { id } = Route.useParams()
  const { data: tags = [] } = useTags()
  const tag = tags.find((t) => t.id === id)
  const updateTag = useUpdateTag()
  const { registerDirtyState } = useTagLayout()
  const { goBack } = useAppNavigation()

  const [name, setName] = useState('')
  const [savedAt, setSavedAt] = useState(0)

  // Sync name when tag loads or after save
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally sync only on id change or after save
  useEffect(() => {
    if (tag) {
      setName(tag.name)
    }
  }, [tag?.id, savedAt])

  const isDirty = tag ? name !== tag.name : false

  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const handleSave = () => {
    if (!tag || !isDirty) return
    updateTag.mutate(
      { id, updates: { name } },
      {
        onSuccess: () => {
          setSavedAt((n) => n + 1)
          goBack()
        },
      },
    )
  }

  if (!tag) return null

  return (
    <TagNameForm
      name={name}
      onNameChange={setName}
      onSave={handleSave}
      isDirty={isDirty}
      isPending={updateTag.isPending}
    />
  )
}
