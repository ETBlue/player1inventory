import { Loader2 } from 'lucide-react'
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
import { showSaveError } from '@/lib/saveError'

export interface DeleteButtonProps {
  /**
   * Return the delete's promise (`await mutateAsync(…)`), not a `mutate` call.
   * When it rejects, this button shows `common.deleteFailed` (none offline:
   * `offlineWriteLink` already showed one), so the caller must not show its
   * own message and rethrow. A `mutate` call returns before the delete ends,
   * so a failure would never reach this button. See
   * docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md.
   */
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
    } catch (err) {
      // Shown, not left unhandled. Before, nothing on screen said the delete
      // did not happen. The page stays as it was, so the user can try again.
      showSaveError(err, t('common.deleteFailed'))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
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
              {isDeleting && (
                <Loader2 className="animate-spin [transform-box:fill-box]" />
              )}
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
