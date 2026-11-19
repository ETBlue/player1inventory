import { createFileRoute, Navigate } from '@tanstack/react-router'
import { ArrowLeft, Info, UserPlus } from 'lucide-react'
import { useRef, useState } from 'react'
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
  // A leave or a removal is running. The confirm dialog closes at once, so
  // without these the same button could be confirmed again (review of G.9):
  // a second leave would leave the person's NEXT household too, and a second
  // remove would get FORBIDDEN and a false error toast.
  const [leaving, setLeaving] = useState(false)
  const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  // After a Remove or a Revoke the row, and the button that had focus, goes
  // away with the refetch. Focus moves to a heading that stays.
  const titleRef = useRef<HTMLHeadingElement>(null)
  const invitesHeadingRef = useRef<HTMLHeadingElement>(null)

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
    if (removingIds.has(person.userId)) return
    setRemovingIds((prev) => new Set(prev).add(person.userId))
    try {
      await remove(person.userId)
      titleRef.current?.focus()
    } catch (err) {
      reportError(err, errorText)
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev)
        next.delete(person.userId)
        return next
      })
    }
  }
  // After a leave this page is about to go away: `leave` loads another page
  // (the person's next household, or the no-household screen). So `leaving`
  // stays on after it resolves, and only a failure turns it off again.
  const handleLeave = async () => {
    if (leaving) return
    setLeaving(true)
    try {
      await leave()
    } catch (err) {
      setLeaving(false)
      reportError(err, errorText)
    }
  }
  const handleCopy = async (token: string): Promise<boolean> => {
    const ok = await copyText(inviteLink(token))
    if (ok) toast.success(t('settings.household.members.copied'))
    else toast.error(t('settings.household.members.copyFailed'))
    return ok
  }
  const handleRevoke = async (id: string) => {
    try {
      // `false`: the invite is no longer open (used, revoked by someone
      // else, or one this caller may not revoke). The list is refetched
      // either way; only a real revoke says so.
      if (await revoke(id))
        toast.success(t('settings.household.members.revoked'))
      invitesHeadingRef.current?.focus()
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
          <h1 ref={titleRef} tabIndex={-1} className="outline-none">
            {t('settings.household.members.title')}
          </h1>
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
              leaving={leaving}
              removingUserIds={removingIds}
              // "No location roles" and its link, for an owner or manager
              // only: they are the ones who can give the role (households
              // H5c, task H.6, owner decision O28-A).
              showLocationRoleMarks={canManageMembers}
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
            <h2
              ref={invitesHeadingRef}
              tabIndex={-1}
              className="px-4 py-2 text-sm font-medium text-foreground-muted outline-none"
            >
              {t('settings.household.members.openInvites')}
            </h2>
            {invites.isLoading ? (
              <LoadingSpinner />
            ) : invites.isError ? (
              <output className="block px-4 py-2">
                {t('settings.household.members.invitesLoadError')}
              </output>
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
  const { data, isError } = useHouseholdLocations()
  return <InviteDialog {...props} locations={data} locationsError={isError} />
}

function Note({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 px-4 py-2 text-sm text-foreground-muted">
      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </p>
  )
}
