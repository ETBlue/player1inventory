import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  type RegisterSaveControl,
  useRegisterSaveControl,
} from '@/hooks/useSaveControl'
import type { Vendor } from '@/types'

interface VendorInfoFormProps {
  vendor: Vendor
  /**
   * May return a promise. When it rejects, the save failed: the form stays
   * dirty and the caller has shown the message.
   */
  onSave: (data: { name: string }) => void | Promise<void>
  isPending?: boolean
  onDirtyChange?: (isDirty: boolean) => void
  /**
   * Called after a save from this form's own Save button worked. The detail
   * page passes `goBack`. Not called for a save from the unsaved-changes
   * dialog: that dialog goes where the user pressed instead.
   */
  onSaved?: () => void
  /**
   * Hands the detail page's layout a "save now" for its unsaved-changes
   * dialog (design 2026-11-25). `canSave` is the same rule as Save's
   * `disabled`; `save` runs the same code as Save and answers whether it
   * worked. `null` when the form unmounts.
   */
  onSaveControlChange?: RegisterSaveControl
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
  onSaved,
  onSaveControlChange,
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

  const canSave = !readOnly && !nameError && isDirty && !isPending

  // The one save, for Save and for the unsaved-changes dialog. Answers
  // whether it worked.
  const submit = async (): Promise<boolean> => {
    if (!canSave) return false
    try {
      await onSave({ name: name.trim() })
      return true
    } catch {
      return false
    }
  }

  useRegisterSaveControl(onSaveControlChange, canSave, submit)

  return (
    <form
      className="space-y-4 max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault()
        void submit().then((saved) => {
          if (saved) onSaved?.()
        })
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
