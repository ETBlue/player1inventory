import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TagNameFormProps {
  name: string
  onNameChange: (name: string) => void
  onSave: () => void
  isDirty: boolean
  isPending?: boolean
}

export function TagNameForm({
  name,
  onNameChange,
  onSave,
  isDirty,
  isPending,
}: TagNameFormProps) {
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
        <Label htmlFor="tag-name">{t('common.nameLabel')}</Label>
        <Input
          id="tag-name"
          value={name}
          autoFocus
          onChange={(e) => onNameChange(e.target.value)}
          className="capitalize"
          {...(nameError && { error: nameError })}
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
