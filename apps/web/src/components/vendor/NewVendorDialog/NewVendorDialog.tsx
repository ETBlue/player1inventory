import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogMain,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateVendor } from '@/hooks/useVendors'
import type { Vendor } from '@/types'

interface NewVendorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (vendor: Vendor) => void
}

export function NewVendorDialog({
  open,
  onOpenChange,
  onSuccess,
}: NewVendorDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createVendor = useCreateVendor()
  const [name, setName] = useState('')

  const nameError = !name.trim() ? t('validation.required') : undefined

  const resetForm = () => setName('')

  const handleClose = () => {
    onOpenChange(false)
    resetForm()
  }

  const handleSubmit = async () => {
    if (nameError || createVendor.isPending) return
    const vendor = await createVendor.mutateAsync(name.trim())
    if (!vendor) return
    handleClose()
    if (onSuccess) {
      onSuccess(vendor as Vendor)
    } else {
      navigate({
        to: '/settings/vendors/$id',
        params: { id: (vendor as Vendor).id },
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.vendors.newButton')}</DialogTitle>
        </DialogHeader>
        <DialogMain>
          <div className="space-y-2">
            <Label htmlFor="new-vendor-name">{t('common.nameLabel')}</Label>
            <Input
              id="new-vendor-name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' &&
                !nameError &&
                !createVendor.isPending &&
                handleSubmit()
              }
              error={nameError}
            />
          </div>
        </DialogMain>
        <DialogFooter>
          <Button variant="neutral-outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!!nameError || createVendor.isPending}
            isLoading={createVendor.isPending}
          >
            {t('settings.vendors.newButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
