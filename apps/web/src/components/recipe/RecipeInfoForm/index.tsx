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
  onSave: (data: { name: string }) => void
  isPending?: boolean
  onDirtyChange?: (isDirty: boolean) => void
}

export function RecipeInfoForm({
  recipe,
  initialValue,
  onSave,
  isPending,
  onDirtyChange,
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
    if (nameError || !isDirty || isPending) return
    const trimmedName = name.trim()
    onSave({ name: trimmedName })
    // Advance the committed baseline so isDirty → false → onDirtyChange(false)
    setName(trimmedName)
    setCommittedName(trimmedName)
  }

  return (
    <form className="space-y-4 max-w-2xl" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="recipe-name">{t('common.nameLabel')}</Label>
        <Input
          id="recipe-name"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          className="capitalize"
          error={nameError}
        />
      </div>
      <Button
        type="submit"
        disabled={!!nameError || !isDirty || !!isPending}
        className="w-full"
      >
        {isPending ? t('common.saving') : t('common.save')}
      </Button>
    </form>
  )
}
