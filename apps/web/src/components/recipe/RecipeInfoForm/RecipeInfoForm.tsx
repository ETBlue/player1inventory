import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Recipe } from '@/types'

interface RecipeInfoFormProps {
  recipe: Recipe
  /** Optional override for the initial displayed value (e.g. prefill from ?name= URL param).
   *  When provided, the form starts dirty if initialValue !== recipe.name. */
  initialValue?: string
  /**
   * May return a promise. When it rejects, the save failed: the form puts
   * its "saved" baseline back, so the edit counts as unsaved again and Save
   * is enabled. The form swallows the rejection; the caller shows the
   * message (see docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
   */
  onSave: (data: { name: string }) => void | Promise<void>
  isPending?: boolean
  onDirtyChange?: (isDirty: boolean) => void
  /**
   * For a household member (households H5 task F.5): the inputs are
   * `readOnly` (the text can still be selected), selects are disabled, and
   * there is no Save button.
   */
  readOnly?: boolean
}

export function RecipeInfoForm({
  recipe,
  initialValue,
  onSave,
  isPending,
  onDirtyChange,
  readOnly = false,
}: RecipeInfoFormProps) {
  const { t } = useTranslation()

  const [name, setName] = useState(initialValue ?? recipe.name)

  // Track the committed baseline so isDirty collapses to false immediately after save
  const [committedName, setCommittedName] = useState(recipe.name)

  const isDirty = name !== committedName
  const nameError = !name.trim() ? t('validation.required') : undefined

  // Notify parent when dirty state changes
  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (readOnly || nameError || !isDirty || isPending) return
    const trimmedName = name.trim()
    const previousName = committedName
    const result = onSave({ name: trimmedName })
    // Advance the committed baseline so isDirty → false → onDirtyChange(false)
    setName(trimmedName)
    setCommittedName(trimmedName)
    // A failed save: put the baseline back, so the edit is unsaved again
    result?.catch(() => setCommittedName(previousName))
  }

  return (
    <form className="space-y-4 max-w-2xl" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="recipe-name">{t('common.nameLabel')}</Label>
        <Input
          id="recipe-name"
          value={name}
          autoFocus={!readOnly}
          readOnly={readOnly}
          onChange={(e) => setName(e.target.value)}
          className="capitalize"
          error={nameError}
        />
      </div>
      {!readOnly && (
        <Button
          type="submit"
          disabled={!!nameError || !isDirty || !!isPending}
          isLoading={!!isPending}
          className="w-full"
        >
          {t('common.save')}
        </Button>
      )}
    </form>
  )
}
