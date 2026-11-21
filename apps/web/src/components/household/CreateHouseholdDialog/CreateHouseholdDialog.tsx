import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogMain,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HOUSEHOLD_NAME_MAX_LENGTH } from '@/hooks/useHousehold'
import { useCreateAnotherHousehold } from '@/hooks/useMyHouseholds'
import { hasGraphQLErrorCode } from '@/lib/graphqlErrorCode'

interface CreateHouseholdDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Passed to the dialog's `onCloseAutoFocus`. `HouseholdSwitcher` uses it to
   * put focus back on its trigger: the menu item that opened the dialog is
   * gone by the time the dialog closes.
   */
  onCloseAutoFocus?: (event: Event) => void
}

/**
 * **Switch to… › Create new** (households H7 task L.4, decision T70). The
 * person is already in a household. It asks for a name and calls
 * `useCreateAnotherHousehold().createAndSwitch`, which sends
 * `createHousehold(alsoWhenMember: true)` and then moves this device into
 * the new household (a page load to `/`).
 *
 * The name is optional. The dialog passes it trimmed; the hook sends `null`
 * for an empty name, so the server picks its default name.
 *
 * The no-household screen has its own dialog (`NoHouseholdScreen.tsx`). It
 * sends no `alsoWhenMember`, so a second tab cannot make a second household
 * there. Do not merge the two without keeping that difference.
 *
 * Errors stay in the dialog, in an `<output>` (role `status`):
 *
 * | Error | Shown |
 * |---|---|
 * | `BAD_USER_INPUT` (the server refused the name) | the name rule, and focus goes back to the field |
 * | offline (`OfflineWriteError`) | nothing more: `offlineWriteLink` already showed its toast |
 * | anything else | "Could not create the household. Try again." |
 *
 * After a create that worked the button stays busy. The page is about to
 * load the new household, and a second press must not make a second one.
 */
export function CreateHouseholdDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
}: CreateHouseholdDialogProps) {
  const { t } = useTranslation()
  const { createAndSwitch, isPending } = useCreateAnotherHousehold()
  const [name, setName] = useState('')
  const [error, setError] = useState<'name' | 'other' | null>(null)
  const inputId = useId()
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  // A new open starts empty.
  useEffect(() => {
    if (open) {
      setName('')
      setError(null)
    }
  }, [open])

  // The Create button was disabled while busy, so focus fell to the dialog.
  // After a refused name, put it back on the field.
  useEffect(() => {
    if (error === 'name') inputRef.current?.focus()
  }, [error])

  const tooLong = name.trim().length > HOUSEHOLD_NAME_MAX_LENGTH
  const message =
    tooLong || error === 'name'
      ? t('settings.household.name.invalidError', {
          max: HOUSEHOLD_NAME_MAX_LENGTH,
        })
      : error === 'other'
        ? t('createHouseholdDialog.error')
        : undefined

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (tooLong || isPending) return
    setError(null)
    try {
      // Trimmed here, and again in the hook, which sends `""` as `null`.
      await createAndSwitch(name.trim())
    } catch (err) {
      if (err instanceof OfflineWriteError) return
      setError(hasGraphQLErrorCode(err, 'BAD_USER_INPUT') ? 'name' : 'other')
    }
  }

  return (
    <Dialog
      open={open}
      // While the create runs, the dialog stays open: the result is a page
      // load, or an error that must be shown here.
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next)
      }}
    >
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('createHouseholdDialog.title')}</DialogTitle>
          </DialogHeader>
          <DialogMain>
            <div className="space-y-2 text-left">
              <Label htmlFor={inputId}>
                {t('createHouseholdDialog.nameLabel')}
              </Label>
              <Input
                ref={inputRef}
                id={inputId}
                value={name}
                autoFocus
                maxLength={HOUSEHOLD_NAME_MAX_LENGTH}
                aria-invalid={tooLong || error === 'name' ? true : undefined}
                aria-describedby={errorId}
                className={
                  tooLong || error === 'name'
                    ? 'border-importance-destructive-foreground'
                    : undefined
                }
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
              />
              {/* The hint is the dialog's description, so Radix links it to
                  the dialog (`aria-describedby`). */}
              <DialogDescription>
                {t('createHouseholdDialog.nameHint')}
              </DialogDescription>
              {/* Stays mounted, empty when there is no error: a live region
                  that appears already filled may not be read. */}
              <output
                id={errorId}
                className="block text-sm text-importance-destructive-foreground"
              >
                {message}
              </output>
            </div>
          </DialogMain>
          <DialogFooter>
            <Button
              type="button"
              variant="neutral-outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={tooLong || isPending}
              isLoading={isPending}
            >
              {t('createHouseholdDialog.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
