import { useRef, useState } from 'react'
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
import { Button } from '@/components/ui/button'
import type { SaveControl } from '@/hooks/useSaveControl'

interface UnsavedChangesDialogProps {
  open: boolean
  /** Cancel, Escape or a click outside: close and stay, edits kept. */
  onCancel: () => void
  /**
   * Go where the user was going. Discard calls it at once; Save calls it only
   * after `saveControl.save()` answered `true`.
   */
  onLeave: () => void
  /**
   * The form's save, from the page's layout hook. `null` (no form has
   * registered one) shows no Save button, only Cancel and Discard.
   */
  saveControl: SaveControl | null
}

/**
 * "You have unsaved changes", with Cancel · Discard · Save (design
 * `docs/global/ui-polish/2026-11-25-unsaved-dialog-save-design.md`).
 *
 * - Cancel (`neutral-outline`) closes and stays.
 * - Discard (`destructive-outline`) leaves without saving.
 * - Save (`primary`) runs the form's own save and leaves only when it worked.
 *   It is disabled while the form cannot be saved (a field error, a save
 *   running). While the save runs it shows a spinner, every button is
 *   disabled and the dialog cannot be closed, so a Discard cannot race the
 *   save. A failed save leaves the dialog open; the page has already shown
 *   its error toast.
 *
 * Used by the item page (tabs, Back, Stock location pager) and the tag,
 * vendor, recipe and shelf detail pages.
 */
export function UnsavedChangesDialog({
  open,
  onCancel,
  onLeave,
  saveControl,
}: UnsavedChangesDialogProps) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  // The latest `onLeave`, read after the save resolves: the render that
  // started the save may be several renders old by then.
  const onLeaveRef = useRef(onLeave)
  onLeaveRef.current = onLeave

  const handleSave = async () => {
    if (!saveControl || saving) return
    setSaving(true)
    let saved = false
    try {
      saved = await saveControl.save()
    } catch {
      // `save` must not reject; if it does, treat it as a failed save.
      saved = false
    } finally {
      setSaving(false)
    }
    if (saved) onLeaveRef.current()
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('common.unsavedTitle')}</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogDescription>
          {t('common.unsavedDescription')}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>
            {t('common.cancel')}
          </AlertDialogCancel>
          <div className="flex gap-2">
            <AlertDialogAction
              variant="destructive-outline"
              disabled={saving}
              onClick={onLeave}
            >
              {t('common.discard')}
            </AlertDialogAction>
            {saveControl && (
              // A plain button, not `AlertDialogAction`: an action closes the
              // dialog on click, and a failed save must keep it open.
              <Button
                type="button"
                variant="primary"
                disabled={!saveControl.canSave}
                isLoading={saving}
                onClick={handleSave}
              >
                {t('common.save')}
              </Button>
            )}
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
