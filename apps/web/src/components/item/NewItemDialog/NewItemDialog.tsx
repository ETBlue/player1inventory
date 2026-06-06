import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
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
import { useCreateItem } from '@/hooks'
import type { Item } from '@/types'

interface NewItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName?: string
  onSuccess?: (item: Item) => void
}

export function NewItemDialog({
  open,
  onOpenChange,
  initialName = '',
  onSuccess,
}: NewItemDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createItem = useCreateItem()
  const [name, setName] = useState(initialName)
  const [packageUnit, setPackageUnit] = useState('')

  const nameError = !name.trim() ? t('validation.required') : undefined

  const resetForm = () => {
    setName(initialName)
    setPackageUnit('')
  }

  const handleClose = () => {
    onOpenChange(false)
    resetForm()
  }

  const handleSubmit = async () => {
    if (nameError || createItem.isPending) return
    const item = await createItem.mutateAsync({
      name: name.trim(),
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
      ...(packageUnit.trim() ? { packageUnit: packageUnit.trim() } : {}),
    })
    if (!item) return
    handleClose()
    if (onSuccess) {
      onSuccess(item as Item)
    } else {
      navigate({
        to: '/items/$id',
        params: { id: (item as Item).id },
      })
    }
  }

  // Sync name when initialName changes
  useEffect(() => {
    setName(initialName)
  }, [initialName])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('items.newButton')}</DialogTitle>
        </DialogHeader>
        <DialogMain className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-item-name">{t('common.nameLabel')}</Label>
            <Input
              id="new-item-name"
              value={name}
              autoFocus
              className="capitalize"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' &&
                !nameError &&
                !createItem.isPending &&
                handleSubmit()
              }
              error={nameError}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-item-package-unit">Package Unit</Label>
            <Input
              id="new-item-package-unit"
              value={packageUnit}
              placeholder="e.g. bottle, kg"
              onChange={(e) => setPackageUnit(e.target.value)}
            />
          </div>
        </DialogMain>
        <DialogFooter>
          <Button variant="neutral-outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!!nameError || createItem.isPending}
            isLoading={createItem.isPending}
          >
            {t('items.newButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
