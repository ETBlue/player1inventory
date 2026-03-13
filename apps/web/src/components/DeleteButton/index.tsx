import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { ButtonProps } from '@/components/ui/button'
import { Button } from '@/components/ui/button'

export interface DeleteButtonProps {
  onDelete: () => void | Promise<void>
  trigger: ReactNode
  buttonVariant?: ButtonProps['variant']
  buttonSize?: ButtonProps['size']
  buttonClassName?: string
  buttonAriaLabel?: string
  dialogTitle?: string
  dialogDescription?: ReactNode
  confirmLabel?: string
}

export function DeleteButton({
  onDelete,
  trigger,
  buttonVariant = 'destructive-ghost',
  buttonSize,
  buttonClassName,
  buttonAriaLabel,
  dialogTitle = 'Delete?',
  dialogDescription = 'Are you sure?',
  confirmLabel,
}: DeleteButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleConfirm = async () => {
    setIsDeleting(true)
    try {
      await onDelete()
      setOpen(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Button
        variant={buttonVariant}
        size={buttonSize}
        className={buttonClassName}
        aria-label={buttonAriaLabel}
        onClick={() => setOpen(true)}
      >
        {trigger}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>{dialogDescription}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirm}
              disabled={isDeleting}
            >
              {isDeleting
                ? t('common.deleting')
                : (confirmLabel ?? t('common.delete'))}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
