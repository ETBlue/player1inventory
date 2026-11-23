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
  /**
   * For a household member (households H5 task F.5): the inputs are
   * `readOnly` (the text can still be selected), selects are disabled, and
   * there is no Save button.
   */
  readOnly?: boolean
}

export function VendorInfoForm({
  vendor,
  onSave,
  isPending,
  onDirtyChange,
  readOnly = false,
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
        if (readOnly) return
        onSave({ name: name.trim() })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="vendor-name">{t('common.nameLabel')}</Label>
        <Input
          id="vendor-name"
          value={name}
          autoFocus={!readOnly}
          readOnly={readOnly}
          onChange={(e) => setName(e.target.value)}
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
