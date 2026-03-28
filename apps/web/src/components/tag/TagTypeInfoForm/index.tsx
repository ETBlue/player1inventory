import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ColorSelect } from '@/components/ColorSelect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TagType } from '@/types'
import { TagColor } from '@/types'

interface TagTypeInfoFormProps {
  /** undefined = create mode; defined = edit mode */
  tagType?: TagType
  onSave: (data: { name: string; color: TagColor }) => void
  isPending?: boolean
  onDirtyChange?: (isDirty: boolean) => void
}

export function TagTypeInfoForm({
  tagType,
  onSave,
  isPending,
  onDirtyChange,
}: TagTypeInfoFormProps) {
  const { t } = useTranslation()

  const [name, setName] = useState(tagType?.name ?? '')
  const [color, setColor] = useState<TagColor>(tagType?.color ?? TagColor.blue)

  const nameError = !name.trim() ? t('validation.required') : undefined

  // Dirty tracking:
  // Edit mode: changed from original tagType values
  // Create mode: name filled in or non-default color selected
  const isDirty = tagType
    ? name !== tagType.name || color !== tagType.color
    : name.trim() !== '' || color !== TagColor.blue

  // Notify parent when dirty state changes
  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (nameError || !isDirty || isPending) return
    onSave({ name: name.trim(), color })
  }

  return (
    <form className="space-y-4 max-w-2xl" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="tag-type-name">
          {t('settings.tags.tagType.nameLabel')}
        </Label>
        <Input
          id="tag-type-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('settings.tags.tagType.namePlaceholder')}
          className="capitalize"
          error={nameError}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tag-type-color">
          {t('settings.tags.tagType.colorLabel')}
        </Label>
        <ColorSelect id="tag-type-color" value={color} onChange={setColor} />
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={!!nameError || !isDirty || !!isPending}
      >
        {isPending ? t('common.saving') : t('common.save')}
      </Button>
    </form>
  )
}
