import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Vendor } from '@/types'

interface VendorInfoFormProps {
  vendor: Vendor
  onSave: (data: { name: string }) => void
  isPending?: boolean
  onDirtyChange?: (isDirty: boolean) => void
}

export function VendorInfoForm({
  vendor,
  onSave,
  isPending,
  onDirtyChange,
}: VendorInfoFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(vendor.name)

  const isDirty = name !== vendor.name
  const nameError = !name.trim() ? t('validation.required') : undefined

  // Notify parent when dirty state changes
  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  return (
    <form
      className="space-y-4 max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ name: name.trim() })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="vendor-name">{t('common.nameLabel')}</Label>
        <Input
          id="vendor-name"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
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
