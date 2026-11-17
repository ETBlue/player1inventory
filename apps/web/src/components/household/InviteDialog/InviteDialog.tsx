import { Copy } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  HouseholdRole,
  InviteFieldsFragment,
  LocationRole,
} from '@/generated/graphql'
import { useLanguage } from '@/hooks/useLanguage'
import { copyText } from '@/lib/copyText'
import { formatDate } from '@/lib/formatDate'
import { inviteLink } from '../inviteLink'

/** The value of the "No access" choice. Never sent: such a row is left out. */
const NO_ACCESS = 'none'
const LOCATION_ROLES: LocationRole[] = ['organizer', 'participant', 'viewer']

export interface InviteDialogProps {
  /** Mount the dialog only while it is open: it keeps its own form state. */
  onClose: () => void
  /** Owner: `member` or `manager`. Manager: `member` only (O3-A). */
  canInviteManager: boolean
  /** Every location of the household, names as stored. `undefined` while loading. */
  locations: { id: string; name: string }[] | undefined
  /** The location list could not be read: the form says so and cannot be sent. */
  locationsError?: boolean
  /**
   * Create the invite. Rejects on a refusal; the dialog shows the error and
   * stays open.
   */
  onCreate: (
    householdRole: HouseholdRole,
    locationRoles: { locationId: string; role: LocationRole }[],
  ) => Promise<InviteFieldsFragment>
}

/**
 * Invite someone (households H5b, task G.9).
 *
 * Step 1, the form: the household role, then every location with a role
 * picker, **No access** pre-selected (owner decision O14-A). An invite with
 * no location role is allowed.
 *
 * Step 2, the link: `${origin}/join/${token}` in a read-only field,
 * **Copy link**, and until when it works. Copy uses the Clipboard API, then a
 * fallback (`copyText`). When both fail, the field's text is selected so the
 * person can copy it by hand, and an `<output>` says so.
 */
export function InviteDialog({
  onClose,
  canInviteManager,
  locations,
  locationsError = false,
  onCreate,
}: InviteDialogProps) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const [householdRole, setHouseholdRole] = useState<HouseholdRole>('member')
  const [roles, setRoles] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<InviteFieldsFragment | null>(null)
  const [copyState, setCopyState] = useState<'copied' | 'failed' | null>(null)
  const linkRef = useRef<HTMLInputElement>(null)
  const roleId = useId()
  const linkId = useId()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const locationRoles = Object.entries(roles)
      .filter(([, role]) => role !== NO_ACCESS)
      .map(([locationId, role]) => ({
        locationId,
        role: role as LocationRole,
      }))
    try {
      setCreated(await onCreate(householdRole, locationRoles))
    } catch (err) {
      // Offline, `offlineWriteLink` has already shown its own toast.
      if (!(err instanceof OfflineWriteError))
        toast.error(t('settings.household.members.error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!created) return
    // Copy from the visible field: it is inside the dialog, which keeps
    // focus inside itself (see `copyText`).
    const ok = await copyText(inviteLink(created.token), {
      from: linkRef.current,
    })
    if (!ok) linkRef.current?.select()
    setCopyState(ok ? 'copied' : 'failed')
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      {/* No description: the form or the link note says what it is. */}
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('settings.household.members.invite')}</DialogTitle>
        </DialogHeader>
        {created ? (
          <>
            <DialogMain>
              <div className="space-y-2">
                <Label htmlFor={linkId}>
                  {t('settings.household.members.linkLabel')}
                </Label>
                <Input
                  id={linkId}
                  ref={linkRef}
                  readOnly
                  value={inviteLink(created.token)}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <p className="text-sm text-foreground-muted">
                  {t('settings.household.members.linkNote', {
                    date: formatDate(new Date(created.expiresAt), language),
                  })}
                </p>
                {/* An `<output>` has the role `status`, so it is announced. */}
                {copyState && (
                  <output className="block text-sm">
                    {copyState === 'copied'
                      ? t('settings.household.members.copied')
                      : t('settings.household.members.copyFailed')}
                  </output>
                )}
              </div>
            </DialogMain>
            <DialogFooter>
              <Button type="button" variant="neutral-outline" onClick={onClose}>
                {t('common.done')}
              </Button>
              <Button type="button" onClick={handleCopy}>
                <Copy />
                {t('settings.household.members.copyLink')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogMain>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label id={roleId}>
                    {t('settings.household.members.inviteRole')}
                  </Label>
                  <Select
                    value={householdRole}
                    onValueChange={(v) => setHouseholdRole(v as HouseholdRole)}
                  >
                    <SelectTrigger aria-labelledby={roleId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">
                        {t('roles.household.member')}
                      </SelectItem>
                      {canInviteManager && (
                        <SelectItem value="manager">
                          {t('roles.household.manager')}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">
                    {t('settings.household.members.inviteLocations')}
                  </legend>
                  {locationsError && (
                    <output className="block text-sm text-importance-destructive-foreground">
                      {t('settings.household.members.locationsLoadError')}
                    </output>
                  )}
                  {locations?.length === 0 && (
                    <p className="text-sm text-foreground-muted">
                      {t('settings.household.members.noLocations')}
                    </p>
                  )}
                  {(locations ?? []).map((location) => (
                    <div
                      key={location.id}
                      className="grid grid-cols-[1fr_auto] items-center gap-2"
                    >
                      <span className="min-w-0 break-words text-sm">
                        {location.name}
                      </span>
                      <Select
                        value={roles[location.id] ?? NO_ACCESS}
                        onValueChange={(v) =>
                          setRoles((prev) => ({ ...prev, [location.id]: v }))
                        }
                      >
                        <SelectTrigger
                          className="w-36"
                          aria-label={location.name}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_ACCESS}>
                            {t('settings.locations.noAccess')}
                          </SelectItem>
                          {LOCATION_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {t(`roles.location.${role}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </fieldset>
              </div>
            </DialogMain>
            <DialogFooter>
              <Button type="button" variant="neutral-outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={busy || locations === undefined || locationsError}
                isLoading={busy}
              >
                {t('settings.household.members.createLink')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
