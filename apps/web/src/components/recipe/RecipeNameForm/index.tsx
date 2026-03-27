import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface RecipeNameFormProps {
  name: string
  onNameChange: (name: string) => void
  onSave: () => void
  isDirty: boolean
  isPending?: boolean
}

export function RecipeNameForm({
  name,
  onNameChange,
  onSave,
  isDirty,
  isPending,
}: RecipeNameFormProps) {
  const { t } = useTranslation()
  const nameError = !name.trim() ? t('validation.required') : undefined

  return (
    <form
      className="space-y-4 max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="recipe-name">{t('common.nameLabel')}</Label>
        <Input
          id="recipe-name"
          value={name}
          autoFocus
          onChange={(e) => onNameChange(e.target.value)}
          className="capitalize"
          error={nameError}
        />
      </div>
      <Button
        type="submit"
        disabled={!!nameError || !isDirty || !!isPending}
        className="w-full"
      >
        {t('common.save')}
      </Button>
    </form>
  )
}
