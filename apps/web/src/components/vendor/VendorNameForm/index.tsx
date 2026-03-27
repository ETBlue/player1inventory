import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface VendorNameFormProps {
  name: string
  onNameChange: (name: string) => void
  onSave: () => void
  isDirty: boolean
  isPending?: boolean
}

export function VendorNameForm({
  name,
  onNameChange,
  onSave,
  isDirty,
  isPending,
}: VendorNameFormProps) {
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
        <Label htmlFor="vendor-name">{t('common.nameLabel')}</Label>
        <Input
          id="vendor-name"
          value={name}
          autoFocus
          onChange={(e) => onNameChange(e.target.value)}
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
