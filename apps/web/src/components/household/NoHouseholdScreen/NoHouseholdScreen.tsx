import { Home, Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { switchToHousehold } from '@/apollo/householdGuard'
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
import {
  HOUSEHOLD_NAME_MAX_LENGTH,
  useCreateHousehold,
} from '@/hooks/useHousehold'
import { hasGraphQLErrorCode } from '@/lib/graphqlErrorCode'

/**
 * What a cloud page shows to a person who is in NO household (households
 * H5b, task G.8). That happens after they left their household or were
 * removed from it. A brand-new person never sees it: their first request
 * makes a household for them.
 *
 * `NoHouseholdGate` decides when to show it. This screen only offers
 * **Create a household** (owner decision O16-A). The other way back in is an
 * invite link, which the gate does not cover.
 *
 * After a create the device moves to the new household and lands on the
 * pantry (`switchToHousehold(id, { to: '/' })`). The server sends this tab
 * no live event for its own change, so the screen does it itself.
 */
export function NoHouseholdScreen() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  // The person was on another page a moment ago. Move focus to the heading,
  // so a screen reader reads where they are now.
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
      <Home aria-hidden="true" className="size-8 text-foreground-muted" />
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold outline-none"
      >
        {t('noHousehold.title')}
      </h1>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t('noHousehold.create')}
      </Button>
      {open && <CreateHouseholdDialog onClose={() => setOpen(false)} />}
    </div>
  )
}

function CreateHouseholdDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { create } = useCreateHousehold()
  const [name, setName] = useState('')
  // A refusal of the name by the server. Typing clears it.
  const [serverRefused, setServerRefused] = useState(false)
  // Kept on from the press until the page changes: after a success the
  // device loads the pantry, so the button must not be pressed again.
  const [busy, setBusy] = useState(false)
  const inputId = useId()
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  // After the server refuses the name, the pressed button was disabled while
  // busy, so focus fell to the page body. Put it back on the field.
  useEffect(() => {
    if (serverRefused) inputRef.current?.focus()
  }, [serverRefused])

  // The name is optional: an empty field means "the default name". Only a
  // name that is too long is refused here. The server checks it again.
  const tooLong = name.trim().length > HOUSEHOLD_NAME_MAX_LENGTH
  const nameError =
    tooLong || serverRefused
      ? t('settings.household.name.invalidError', {
          max: HOUSEHOLD_NAME_MAX_LENGTH,
        })
      : undefined

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (tooLong || busy) return
    setBusy(true)
    let householdId: string
    try {
      householdId = await create(name)
    } catch (err) {
      setBusy(false)
      // Offline, `offlineWriteLink` has already shown its own toast.
      if (err instanceof OfflineWriteError) return
      if (hasGraphQLErrorCode(err, 'BAD_USER_INPUT')) setServerRefused(true)
      else toast.error(t('noHousehold.error'))
      return
    }
    try {
      await switchToHousehold(householdId, { to: '/' })
    } catch (err) {
      // The cache could not be cleared. Go to the pantry anyway: the stored
      // household id was removed when this screen showed, so the next load
      // starts from the server's answer.
      console.error('Could not clear the data of the old household', err)
      window.location.replace('/')
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('noHousehold.create')}</DialogTitle>
          </DialogHeader>
          <DialogMain>
            <div className="space-y-2 text-left">
              <Label htmlFor={inputId}>{t('noHousehold.nameLabel')}</Label>
              <Input
                ref={inputRef}
                id={inputId}
                value={name}
                autoFocus
                maxLength={HOUSEHOLD_NAME_MAX_LENGTH}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={errorId}
                // The red border of `Input`'s `error` state. Not the `error`
                // prop itself: it also prints the message in a plain `<p>`,
                // which a screen reader does not announce, and the message
                // would then show twice.
                className={
                  nameError
                    ? 'border-importance-destructive-foreground'
                    : undefined
                }
                onChange={(e) => {
                  setName(e.target.value)
                  setServerRefused(false)
                }}
              />
              {/* The hint is the dialog's description, so Radix can link it
                  (`aria-describedby` on the dialog). */}
              <DialogDescription>{t('noHousehold.nameHint')}</DialogDescription>
              {/* An `<output>` has the role `status`. It stays mounted, empty
                  when there is no error: a live region that appears already
                  filled may not be read. */}
              <output
                id={errorId}
                className="block text-sm text-importance-destructive-foreground"
              >
                {nameError}
              </output>
            </div>
          </DialogMain>
          <DialogFooter>
            <Button type="button" variant="neutral-outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={tooLong || busy} isLoading={busy}>
              {t('noHousehold.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
