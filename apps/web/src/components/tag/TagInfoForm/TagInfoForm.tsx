import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import type { Tag, TagType } from '@/types'

// Sentinel value used in the Select to represent "no parent" (top-level).
// Must not be empty string — Radix UI Select disallows empty string as SelectItem value.
const NO_PARENT = '__none__'

interface TagInfoFormProps {
  tag: Tag
  tagTypes: TagType[]
  parentOptions: Array<Tag & { depth: number }>
  /**
   * May return a promise. When it rejects, the save failed: the form puts
   * its "saved" baseline back, so the edit counts as unsaved again and Save
   * is enabled. The form swallows the rejection; the caller shows the
   * message (see docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
   */
  onSave: (data: {
    name: string
    typeId: string
    parentId?: string
  }) => void | Promise<void>
  isPending?: boolean
  onDirtyChange?: (isDirty: boolean) => void
  /** When true, the type Select is disabled — used in dialogs where the type is pre-set. */
  typeReadonly?: boolean
  /**
   * For a household member (households H5 task F.5): the inputs are
   * `readOnly` (the text can still be selected), selects are disabled, and
   * there is no Save button.
   */
  readOnly?: boolean
}

export function TagInfoForm({
  tag,
  tagTypes,
  parentOptions,
  onSave,
  isPending,
  onDirtyChange,
  typeReadonly,
  readOnly = false,
}: TagInfoFormProps) {
  const { t } = useTranslation()

  const [name, setName] = useState(tag.name)
  const [typeId, setTypeId] = useState(tag.typeId)
  // Represent "no parent" with sentinel; convert undefined/missing parentId to NO_PARENT
  const [parentId, setParentId] = useState<string>(tag.parentId ?? NO_PARENT)

  // Track the "committed" baseline — starts from the incoming tag prop but updates on save
  // so isDirty can collapse to false immediately after onSave() is called.
  const [committedName, setCommittedName] = useState(tag.name)
  const [committedTypeId] = useState(tag.typeId)
  const [committedParentId] = useState<string>(tag.parentId ?? NO_PARENT)

  const isDirty =
    name !== committedName ||
    typeId !== committedTypeId ||
    parentId !== committedParentId

  const nameError = !name.trim() ? t('validation.required') : undefined

  // Notify parent when dirty state changes
  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (readOnly || nameError || !isDirty || isPending) return
    const trimmedName = name.trim()
    const resolvedParentId = parentId === NO_PARENT ? undefined : parentId
    const previousName = committedName
    const result = onSave({
      name: trimmedName,
      typeId,
      ...(resolvedParentId !== undefined ? { parentId: resolvedParentId } : {}),
    })
    // Advance the committed baseline so isDirty → false → onDirtyChange(false)
    setName(trimmedName)
    setCommittedName(trimmedName)
    // A failed save: put the baseline back, so the edit is unsaved again
    result?.catch(() => setCommittedName(previousName))
  }

  return (
    <form className="space-y-4 max-w-2xl" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="tag-name">{t('settings.tags.tag.nameLabel')}</Label>
        <Input
          id="tag-name"
          autoFocus={!readOnly}
          readOnly={readOnly}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="capitalize"
          error={nameError}
        />
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
          disabled={readOnly || (typeReadonly ?? false)}
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
        <Label htmlFor="tag-parent">{t('settings.tags.tag.parentLabel')}</Label>
        <Select
          value={parentId}
          onValueChange={setParentId}
          disabled={readOnly}
        >
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
                style={{ marginLeft: `${option.depth}rem` }}
              >
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!readOnly && (
        <Button
          type="submit"
          className="w-full"
          disabled={!!nameError || !isDirty || !!isPending}
          isLoading={!!isPending}
        >
          {t('common.save')}
        </Button>
      )}
    </form>
  )
}
