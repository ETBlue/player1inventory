import { Copy, Link2Off } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { Button } from '@/components/ui/button'
import { Card, CardMetadata, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { InviteFieldsFragment } from '@/generated/graphql'
import { useLanguage } from '@/hooks/useLanguage'
import { formatDate } from '@/lib/formatDate'
import { inviteLink } from '../inviteLink'

export interface InviteListProps {
  invites: InviteFieldsFragment[]
  /** The owner revokes any invite; a manager only a `member` invite (O15-A). */
  isOwner: boolean
  /**
   * Copy the invite's link. Resolves to `false` when it could not be copied:
   * the row then shows the link in a read-only field, selected, so the person
   * can copy it by hand.
   */
  onCopy: (invite: InviteFieldsFragment) => Promise<boolean>
  /** Must not reject: it reports its own error. */
  onRevoke: (invite: InviteFieldsFragment) => Promise<void>
}

/**
 * The open invites of a household, for an owner or manager (households H5b,
 * task G.9, owner decisions O7-A and O15-A). Each row: the household role,
 * the location roles (location names as stored), who made it, until when it
 * works, **Copy link** and, where allowed, **Revoke**.
 *
 * An invite with no location role says so (`noLocationRoles`). That is an
 * invite made with none (O14-A), OR one whose locations were all deleted
 * since (after "Clear all data"). The server sends the same empty list for
 * both, so the row cannot tell them apart.
 */
export function InviteList({
  invites,
  isOwner,
  onCopy,
  onRevoke,
}: InviteListProps) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  // The invite whose link could not be copied: its row shows the link.
  const [manualId, setManualId] = useState<string | null>(null)

  if (invites.length === 0) {
    return (
      <p className="px-4 py-2 text-sm text-foreground-muted">
        {t('settings.household.members.noInvites')}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-px">
      {invites.map((invite) => {
        const canRevoke = isOwner || invite.householdRole === 'member'
        return (
          <li key={invite.id}>
            <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
              <div className="min-w-0 flex-1 space-y-1">
                <CardTitle>
                  {t(`roles.household.${invite.householdRole}`)}
                </CardTitle>
                <CardMetadata>
                  {invite.locationRoles.length === 0
                    ? t('settings.household.members.noLocationRoles')
                    : invite.locationRoles
                        .map(
                          (row) =>
                            `${row.locationName}: ${t(`roles.location.${row.role}`)}`,
                        )
                        .join(' · ')}
                </CardMetadata>
                <CardMetadata>
                  {t('settings.household.members.createdBy', {
                    name: invite.createdByName,
                  })}
                  {' · '}
                  {t('settings.household.members.expires', {
                    date: formatDate(new Date(invite.expiresAt), language),
                  })}
                </CardMetadata>
              </div>
              <Button
                type="button"
                variant="neutral-outline"
                onClick={async () => {
                  const ok = await onCopy(invite)
                  setManualId(ok ? null : invite.id)
                }}
              >
                <Copy />
                {t('settings.household.members.copyLink')}
              </Button>
              {canRevoke && (
                <DeleteButton
                  trigger={
                    <>
                      <Link2Off />
                      {t('settings.household.members.revoke')}
                    </>
                  }
                  dialogTitle={t('settings.household.members.revoke')}
                  dialogDescription={t(
                    'settings.household.members.revokeConfirm',
                  )}
                  confirmLabel={t('settings.household.members.revoke')}
                  onDelete={() => onRevoke(invite)}
                />
              )}
              {manualId === invite.id && (
                <Input
                  readOnly
                  autoFocus
                  className="basis-full"
                  aria-label={t('settings.household.members.linkLabel')}
                  value={inviteLink(invite.token)}
                  onFocus={(e) => e.currentTarget.select()}
                />
              )}
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
