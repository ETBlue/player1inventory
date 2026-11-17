import { createFileRoute, Navigate } from '@tanstack/react-router'
import { ArrowLeft, Info, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import { InviteDialog } from '@/components/household/InviteDialog'
import { InviteList } from '@/components/household/InviteList'
import { inviteLink } from '@/components/household/inviteLink'
import { MemberList, type MemberRow } from '@/components/household/MemberList'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import type { HouseholdRole } from '@/generated/graphql'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useDataMode } from '@/hooks/useDataMode'
import {
  useCreateInvite,
  useHouseholdInvites,
  useHouseholdMembers,
  useLeaveHousehold,
  useRemoveMember,
  useRevokeInvite,
  useSetHouseholdRole,
} from '@/hooks/useHouseholdMembers'
import { useHouseholdLocations } from '@/hooks/useLocations'
import { usePermissions } from '@/hooks/usePermissions'
import { copyText } from '@/lib/copyText'

// The Members page (households H5b, task G.9). Cloud only.
//
// | Household role | Sees |
// |---|---|
// | owner | every person, the role control and Remove on every other row, Invite, open invites with Copy link and Revoke |
// | manager | every person, Remove on `member` rows, their own Leave, Invite (as `member` only), the `member` invites |
// | member | every person and role, their own Leave (owner decision O13-A). No e-mail, no invites |
//
// The server checks every write; this page only hides what it would refuse.
export const Route = createFileRoute('/settings/household/members')({
  component: MembersRoute,
})

/**
 * Local mode has one person and no households (design, *Local mode*). The
 * sidebar and the accordion do not list this page there; a person who opens
 * the URL anyway goes to the household page.
 */
function MembersRoute() {
  const { mode } = useDataMode()
  if (mode !== 'cloud') return <Navigate to="/settings/household" replace />
  return <MembersPage />
}

function reportError(err: unknown, message: string) {
  // Offline, `offlineWriteLink` has already shown its own toast.
  if (err instanceof OfflineWriteError) return
  toast.error(message)
}

export function MembersPage() {
  const { t } = useTranslation()
  const { goBack } = useAppNavigation('/settings')
  const { canManageMembers, isHouseholdOwner, roleKnown } = usePermissions()
  const callerRole: HouseholdRole | undefined = isHouseholdOwner
    ? 'owner'
    : canManageMembers
      ? 'manager'
      : roleKnown
        ? 'member'
        : undefined

  const members = useHouseholdMembers()
  const invites = useHouseholdInvites({ enabled: canManageMembers })
  // Only for the invite form, so only asked while the form is open.
  const [inviteOpen, setInviteOpen] = useState(false)

  const { setRole } = useSetHouseholdRole()
  const { remove } = useRemoveMember()
  const { leave } = useLeaveHousehold()
  const { create } = useCreateInvite()
  const { revoke } = useRevokeInvite()

  const errorText = t('settings.household.members.error')

  const handleSetRole = (person: MemberRow, role: HouseholdRole) => {
    setRole(person.userId, role).catch((err) => reportError(err, errorText))
  }
  const handleRemove = async (person: MemberRow) => {
    try {
      await remove(person.userId)
    } catch (err) {
      reportError(err, errorText)
    }
  }
  // After a leave this page is about to go away: `leave` moves the device to
  // the person's next household, or to the no-household screen. So nothing
  // here touches page state after it resolves.
  const handleLeave = async () => {
    try {
      await leave()
    } catch (err) {
      reportError(err, errorText)
    }
  }
  const handleCopy = async (token: string) => {
    if (await copyText(inviteLink(token)))
      toast.success(t('settings.household.members.copied'))
    else toast.error(t('settings.household.members.copyFailed'))
  }
  const handleRevoke = async (id: string) => {
    try {
      // `false`: the invite is no longer open (used, revoked by someone
      // else, or one this caller may not revoke). The list is refetched
      // either way; only a real revoke says so.
      if (await revoke(id))
        toast.success(t('settings.household.members.revoked'))
    } catch (err) {
      reportError(err, errorText)
    }
  }

  const rows = members.data ?? []
  const me = rows.find((p) => p.isMe)
  const ownerAlone = rows.length === 1 && me?.role === 'owner'

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar className="justify-between">
        <div className="flex items-center gap-2">
          {/* Mobile only: on desktop the household sidebar has Back (P1). */}
          <Button
            variant="neutral-ghost"
            size="icon"
            className="lg:hidden"
            aria-label={t('common.goBack')}
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1>{t('settings.household.members.title')}</h1>
        </div>
        {canManageMembers && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus />
            {t('settings.household.members.invite')}
          </Button>
        )}
      </Toolbar>

      <div className="overflow-y-auto [container-type:size] space-y-4 pb-4">
        {members.isLoading ? (
          <LoadingSpinner />
        ) : members.isError ? (
          <output className="block px-4 py-2">
            {t('settings.household.members.loadError')}
          </output>
        ) : (
          <section className="space-y-px">
            <MemberList
              members={rows}
              callerRole={callerRole}
              onSetRole={handleSetRole}
              onRemove={handleRemove}
              onLeave={handleLeave}
            />
            {me?.role === 'owner' && (
              <Note text={t('settings.household.members.ownerCannotLeave')} />
            )}
            {ownerAlone && (
              <Note text={t('settings.household.members.alone')} />
            )}
          </section>
        )}

        {canManageMembers && (
          <section className="space-y-px">
            <h2 className="px-4 py-2 text-sm font-medium text-foreground-muted">
              {t('settings.household.members.openInvites')}
            </h2>
            {invites.isLoading ? (
              <LoadingSpinner />
            ) : (
              <InviteList
                invites={invites.data ?? []}
                isOwner={isHouseholdOwner}
                onCopy={(invite) => handleCopy(invite.token)}
                onRevoke={(invite) => handleRevoke(invite.id)}
              />
            )}
          </section>
        )}
      </div>

      {inviteOpen && (
        <InviteDialogWithLocations
          canInviteManager={isHouseholdOwner}
          onClose={() => setInviteOpen(false)}
          onCreate={create}
        />
      )}
    </div>
  )
}

/** The dialog with the household's locations, read only while it is open. */
function InviteDialogWithLocations(
  props: Omit<React.ComponentProps<typeof InviteDialog>, 'locations'>,
) {
  const { data } = useHouseholdLocations()
  return <InviteDialog {...props} locations={data} />
}

function Note({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 px-4 py-2 text-sm text-foreground-muted">
      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </p>
  )
}
