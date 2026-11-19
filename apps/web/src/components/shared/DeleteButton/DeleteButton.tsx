import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useId, useState } from 'react'
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
import { Input } from '@/components/ui/input'
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
  /**
   * The typed-name confirm (households H6, task J.7, for the purges). When
   * set, the dialog has a text field, and the confirm works only when the
   * field equals this name EXACTLY: the same case and the same spaces as
   * stored, with no trim. Enter in the field confirms only then. In this
   * mode the dialog also stays OPEN while the delete runs, and when it
   * fails it shows `common.deleteFailed` inside the dialog (an `alert`,
   * offline too) instead of a toast, so the person can try again without
   * typing the name again. It closes when the delete resolves.
   */
  confirmName?: string
  /** The label of the text field. Needed with `confirmName`. */
  confirmNameLabel?: string
  /** Turns the trigger off, for example while another purge runs. */
  disabled?: boolean
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
  confirmName,
  confirmNameLabel,
  disabled,
}: DeleteButtonProps) {
  const { t } = useTranslation()
  const fieldId = useId()
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [typed, setTyped] = useState('')
  const [failed, setFailed] = useState(false)
  const typedMode = confirmName !== undefined
  // Exact, on purpose: no trim and no case folding (task J.7).
  const nameMatches = !typedMode || typed === confirmName

  const changeOpen = (next: boolean) => {
    // A running typed-name delete keeps the dialog open (Escape included).
    if (!next && typedMode && isDeleting) return
    setOpen(next)
    if (!next) {
      setTyped('')
      setFailed(false)
    }
  }

  // The typed-name confirm. A second press while one runs does nothing.
  const handleTypedConfirm = async () => {
    if (!nameMatches || isDeleting) return
    setIsDeleting(true)
    setFailed(false)
    try {
      await onDelete()
      setIsDeleting(false)
      setOpen(false)
      setTyped('')
    } catch {
      // Shown in the dialog. The dialog stays open with the name typed.
      setIsDeleting(false)
      setFailed(true)
    }
  }

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
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {trigger}
      </Button>

      <AlertDialog open={open} onOpenChange={changeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>{dialogDescription}</AlertDialogDescription>
          {typedMode && (
            <div className="space-y-1">
              {/* The name as stored: no `capitalize` (Name Display Convention). */}
              <label htmlFor={fieldId} className="block text-sm">
                {confirmNameLabel}
              </label>
              <Input
                id={fieldId}
                value={typed}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  handleTypedConfirm()
                }}
              />
              {failed && (
                <p
                  role="alert"
                  className="text-sm text-importance-destructive-foreground"
                >
                  {t('common.deleteFailed')}
                </p>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                if (!typedMode) {
                  handleConfirm()
                  return
                }
                // Radix closes the dialog on click; this mode keeps it open
                // until the delete resolves.
                e.preventDefault()
                handleTypedConfirm()
              }}
              disabled={isDeleting || !nameMatches}
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
