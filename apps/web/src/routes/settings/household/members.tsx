import { createFileRoute, Navigate } from '@tanstack/react-router'
import { ArrowLeft, Info, UserPlus } from 'lucide-react'
import { useId, useRef, useState } from 'react'
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
import { useHousehold } from '@/hooks/useHousehold'
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
import {
  isOfferGoneError,
  type OwnershipOffer,
  useAcceptOwnershipOffer,
  useCancelOwnershipOffer,
  useMyOwnershipOffers,
  useOfferOwnership,
} from '@/hooks/useOwnershipOffers'
import { usePermissions } from '@/hooks/usePermissions'
import { copyText } from '@/lib/copyText'

// The Members page (households H5b, task G.9). Cloud only.
//
// | Household role | Sees |
// |---|---|
// | owner | every person, the role control, Remove and Transfer ownership on every other row, Invite, open invites with Copy link and Revoke |
// | manager | every person, Remove on `member` rows, their own Leave, Invite (as `member` only), the `member` invites |
// | member | every person and role, their own Leave (owner decision O13-A). No e-mail, no invites |
//
// Ownership (households H6b task K.7):
//
// | Who | Sees |
// |---|---|
// | owner | Transfer ownership on every other row (asks first). While an offer is open: "Waiting for {name} to accept" and Cancel on that row, and no Transfer anywhere (one offer at a time). Their own row: "The owner cannot leave. Transfer ownership first." |
// | everyone, when `hasOwner` is false | "This household has no owner." |
// | a person with an open offer for THIS household | Become the owner. Also after "Not now" (the offer is dismissed, not gone), and after a decline that left nobody else (owner decision O42-A) |
// | the last live person | a Leave confirm that says the household and everything in it will be deleted (owner decision O37-A) |
// | everyone with Leave | Leave is off until the server has answered the member list (owner decision O48, task K.7b): a list from the restored cache may be stale |
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
  const {
    canManageMembers,
    isHouseholdOwner,
    roleKnown,
    canTransferOwnership,
  } = usePermissions()
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
  const household = useHousehold()
  const { offer, isPending: offering } = useOfferOwnership()
  const { cancel, isPending: cancelling } = useCancelOwnershipOffer()

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
  // After a transfer or a cancel the pressed button goes away (the row then
  // waits, or offers Transfer again), so focus moves to the heading.
  const handleTransfer = async (person: MemberRow) => {
    try {
      await offer(person.userId)
      titleRef.current?.focus()
    } catch (err) {
      reportError(err, errorText)
    }
  }
  const handleCancelTransfer = async () => {
    try {
      // `false`: there was no open offer any more (the person accepted or
      // declined first). The lists are read again either way.
      if (!(await cancel())) toast(t('ownership.gone'))
      titleRef.current?.focus()
    } catch (err) {
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
  // The server deletes the household when no OTHER live person is left
  // (O37-A). `householdMembers` lists live accounts only, so "only me in the
  // list" is the same rule. An owner alone cannot leave at all.
  const lastPerson = rows.length === 1 && !!me && me.role !== 'owner'
  const pending = household.data?.pendingTransfer

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
            {household.data && (
              <OwnershipNotes
                householdId={household.data.id}
                hasOwner={household.data.hasOwner}
                onAccepted={() => titleRef.current?.focus()}
              />
            )}
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
              householdName={household.data?.name}
              // Transfer ownership is for the owner only; the server asks
              // the owner role too.
              {...(canTransferOwnership
                ? {
                    onTransfer: handleTransfer,
                    onCancelTransfer: handleCancelTransfer,
                  }
                : {})}
              pendingTransfer={
                pending
                  ? { toUserId: pending.toUserId, toName: pending.toName }
                  : null
              }
              transferBusy={offering || cancelling}
              lastPerson={lastPerson}
              // Owner decision O48: the list may be the cache restored from
              // IndexedDB, and `lastPerson` read from a stale list could hide
              // the warning while the server deletes the household. So Leave
              // waits for the server's answer. Offline it stays off; a leave
              // could not be sent then anyway.
              leaveDisabled={!members.isFromServer}
            />
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

function Note({ text, id }: { text: string; id?: string }) {
  return (
    <p className="flex items-start gap-2 px-4 py-2 text-sm text-foreground-muted">
      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span id={id}>{text}</span>
    </p>
  )
}

/**
 * Above the list (households H6b task K.7): "This household has no owner."
 * when nobody owns it, and **Become the owner** for a person with an open
 * offer for THIS household. `MyOwnershipOffers` lists offers of every
 * household the person is in, so it is filtered by `householdId`. A dismissed
 * offer ("Not now") counts: the banner hides it, this page does not.
 *
 * The button is described by the text above it, so a screen reader says what
 * it is for. After an answer the offer list is read again before the hook
 * resolves, so the button is gone: the message is a toast.
 */
function OwnershipNotes({
  householdId,
  hasOwner,
  onAccepted,
}: {
  householdId: string
  hasOwner: boolean
  onAccepted: () => void
}) {
  const { t } = useTranslation()
  const offers = useMyOwnershipOffers()
  const { accept, isPending } = useAcceptOwnershipOffer()
  const noteId = useId()
  const myOffer: OwnershipOffer | undefined = offers.data?.find(
    (o) => o.householdId === householdId,
  )

  const handleAccept = async (offerId: string) => {
    try {
      const answer = await accept(offerId)
      toast.success(t('ownership.accepted', { household: answer.name }))
      onAccepted()
    } catch (err) {
      if (err instanceof OfflineWriteError) return
      if (isOfferGoneError(err)) toast(t('ownership.gone'))
      else toast.error(t('ownership.failed'))
    }
  }

  // The text the button is described by: the transfer sentence for a
  // transfer offer, else the "no owner" note.
  const offerText =
    myOffer?.kind === 'transfer'
      ? t('ownership.banner.transfer', {
          name: myOffer.fromName ?? '',
          household: myOffer.householdName,
        })
      : undefined
  if (hasOwner && !myOffer) return null
  return (
    <div className="space-y-px">
      {!hasOwner && (
        <Note
          text={t('settings.household.members.noOwner')}
          {...(offerText ? {} : { id: noteId })}
        />
      )}
      {offerText && <Note text={offerText} id={noteId} />}
      {myOffer && (
        <div className="px-4 py-2">
          <Button
            aria-describedby={noteId}
            disabled={isPending}
            onClick={() => handleAccept(myOffer.id)}
          >
            {t('settings.household.members.becomeOwner')}
          </Button>
        </div>
      )}
    </div>
  )
}
