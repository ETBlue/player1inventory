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

interface AddNameDialogProps {
  open: boolean
  title: string
  submitLabel: string
  name: string
  placeholder?: string
  onNameChange: (name: string) => void
  onAdd: () => void
  onClose: () => void
}

export function AddNameDialog({
  open,
  title,
  submitLabel,
  name,
  placeholder,
  onNameChange,
  onAdd,
  onClose,
}: AddNameDialogProps) {
  const { t } = useTranslation()
  const nameError = !name.trim() ? t('validation.required') : undefined

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogMain>
          <div className="space-y-2">
            <Label htmlFor="entityName">{t('common.nameLabel')}</Label>
            <Input
              id="entityName"
              value={name}
              autoFocus
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={placeholder}
              className="capitalize"
              onKeyDown={(e) => e.key === 'Enter' && !nameError && onAdd()}
              error={nameError}
            />
          </div>
        </DialogMain>
        <DialogFooter>
          <Button variant="neutral-outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onAdd} disabled={!!nameError}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
