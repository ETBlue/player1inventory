import { Link } from '@tanstack/react-router'
import { Crown, LogOut, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/shared/DeleteButton'
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
import { Card, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { HouseholdRole } from '@/generated/graphql'

/** One row of `householdMembers`. */
export interface MemberRow {
  userId: string
  displayName: string
  role: HouseholdRole
  isMe: boolean
  /**
   * The person holds a role on at least one location of this household
   * (`HouseholdPerson.hasLocationRole`, households H5c decision T40). Only
   * `false` shows the "No location roles" mark; `undefined` shows nothing.
   */
  hasLocationRole?: boolean
}

/**
 * What the caller may do on one row (households H5b, task G.9; design,
 * *Household roles*). The server checks every one of these again; this only
 * hides a button that would be refused.
 *
 * | Caller | Role control | Remove | Leave | Transfer ownership |
 * |---|---|---|---|---|
 * | owner | on every row but the owner's | every row but their own | never (the owner cannot leave) | every row but their own (households H6b task K.7) |
 * | manager | never | only on `member` rows | on their own row | never |
 * | member | never | never | on their own row | never |
 *
 * `callerRole` is `undefined` while the role loads: then nothing is offered.
 * The list also hides Transfer while an offer is pending (one at a time):
 * that is the `pendingTransfer` prop, not this table.
 */
export function memberActions(
  callerRole: HouseholdRole | undefined,
  person: MemberRow,
): {
  canSetRole: boolean
  canRemove: boolean
  canLeave: boolean
  canTransfer: boolean
} {
  const canLeave =
    callerRole !== undefined && person.isMe && person.role !== 'owner'
  const none = { canSetRole: false, canRemove: false, canTransfer: false }
  if (person.isMe) return { ...none, canLeave }
  if (callerRole === 'owner') {
    const notOwner = person.role !== 'owner'
    return {
      canSetRole: notOwner,
      canRemove: notOwner,
      canLeave,
      canTransfer: notOwner,
    }
  }
  if (callerRole === 'manager') {
    return { ...none, canRemove: person.role === 'member', canLeave }
  }
  return { ...none, canLeave }
}

/** The open transfer offer of the household (`GetHousehold.pendingTransfer`). */
export interface PendingTransfer {
  toUserId: string
  toName: string
}

export interface MemberListProps {
  members: MemberRow[]
  /** The caller's household role, or `undefined` while it loads. */
  callerRole: HouseholdRole | undefined
  /** Owner only: `member` <-> `manager`. Must not reject. */
  onSetRole: (person: MemberRow, role: HouseholdRole) => void
  /** Must not reject: it reports its own error. */
  onRemove: (person: MemberRow) => Promise<void>
  /** Must not reject: it reports its own error. */
  onLeave: () => Promise<void>
  /**
   * A leave is running. The caller's Leave button is replaced by a
   * "Leaving…" status, so it cannot be confirmed twice (review of G.9).
   */
  leaving?: boolean
  /** People whose removal is running: their Remove is replaced the same way. */
  removingUserIds?: ReadonlySet<string>
  /**
   * Show "No location roles" and a "Give a location role" link (to
   * Settings › Locations) on each row with `hasLocationRole: false`
   * (households H5c, task H.6, owner decision O28-A). The page passes
   * `usePermissions().canManageMembers`: an owner or manager may give a
   * location role, a member may not. Default `false`. With it on, the list
   * needs the router in context.
   */
  showLocationRoleMarks?: boolean
  /** The household's name, for the transfer confirm. `undefined` while it loads. */
  householdName?: string | undefined
  /**
   * Owner only: offer the household to this person (households H6b task
   * K.7). Asks first. Must not reject: it reports its own error. Without it
   * no row shows Transfer ownership.
   */
  onTransfer?: (person: MemberRow) => Promise<void>
  /** Owner only: take the pending offer back. Must not reject. */
  onCancelTransfer?: () => Promise<void>
  /**
   * The open transfer offer. Its row says "Waiting for {name} to accept"
   * with Cancel, and no row shows Transfer ownership: one offer at a time.
   * When the person is not in the list, the same line shows under it.
   */
  pendingTransfer?: PendingTransfer | null
  /** An offer or a cancel is running: Transfer and Cancel are off. */
  transferBusy?: boolean
  /**
   * The caller is the last live person of the household. Leaving then
   * deletes it (owner decision O37-A), and the Leave confirm says so.
   */
  lastPerson?: boolean
}

/**
 * The people of a household: name (as stored, never `capitalize`), "(you)"
 * on the caller's row, and the household role. The buttons follow
 * `memberActions`. Remove and Leave ask first (`DeleteButton`).
 */
export function MemberList({
  members,
  callerRole,
  onSetRole,
  onRemove,
  onLeave,
  leaving = false,
  removingUserIds,
  showLocationRoleMarks = false,
  householdName,
  onTransfer,
  onCancelTransfer,
  pendingTransfer,
  transferBusy = false,
  lastPerson = false,
}: MemberListProps) {
  const { t } = useTranslation()
  const pendingRowShown =
    !!pendingTransfer &&
    members.some((p) => p.userId === pendingTransfer.toUserId)
  const waiting = (pending: PendingTransfer) =>
    onCancelTransfer && (
      <WaitingForAccept
        name={pending.toName}
        onCancel={onCancelTransfer}
        disabled={transferBusy}
      />
    )
  return (
    <ul className="flex flex-col gap-px">
      {members.map((person) => {
        const { canSetRole, canRemove, canLeave, canTransfer } = memberActions(
          callerRole,
          person,
        )
        const waitsForThisPerson =
          !!pendingTransfer && pendingTransfer.toUserId === person.userId
        return (
          <li key={person.userId}>
            <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
              <CardTitle className="min-w-0 flex-1 break-words">
                {person.displayName}
                {person.isMe && (
                  <span className="ml-1 font-normal text-foreground-muted">
                    {t('settings.household.members.you')}
                  </span>
                )}
              </CardTitle>
              {showLocationRoleMarks && person.hasLocationRole === false && (
                <span className="flex items-center gap-2 text-sm">
                  <span className="text-foreground-muted">
                    {t('settings.household.members.noLocationRoles')}
                  </span>
                  {/* The role is given on a location's page, with Add
                      person (O28-A). The list is one click from there. */}
                  <Link
                    to="/settings/household/locations"
                    className="underline underline-offset-4"
                  >
                    {t('settings.household.members.giveLocationRole')}
                  </Link>
                </span>
              )}
              {canSetRole ? (
                <Select
                  value={person.role}
                  onValueChange={(next) => {
                    if (next !== person.role)
                      onSetRole(person, next as HouseholdRole)
                  }}
                >
                  <SelectTrigger
                    className="w-36"
                    aria-label={t('settings.household.members.roleLabel', {
                      name: person.displayName,
                    })}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">
                      {t('roles.household.member')}
                    </SelectItem>
                    <SelectItem value="manager">
                      {t('roles.household.manager')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm text-foreground-muted">
                  {t(`roles.household.${person.role}`)}
                </span>
              )}
              {person.isMe && person.role === 'owner' && (
                // Why the owner's row has no Leave (households H6b task K.7).
                <span className="text-sm text-foreground-muted">
                  {t('settings.household.members.ownerCannotLeave')}
                </span>
              )}
              {waitsForThisPerson && waiting(pendingTransfer)}
              {canTransfer && onTransfer && !pendingTransfer && (
                <TransferButton
                  name={person.displayName}
                  householdName={householdName ?? ''}
                  disabled={transferBusy}
                  onConfirm={() => onTransfer(person)}
                />
              )}
              {canRemove && removingUserIds?.has(person.userId) && (
                <output className="text-sm text-foreground-muted">
                  {t('settings.household.members.removing')}
                </output>
              )}
              {canRemove && !removingUserIds?.has(person.userId) && (
                <DeleteButton
                  trigger={<UserMinus />}
                  buttonSize="icon"
                  buttonAriaLabel={t('settings.household.members.removeLabel', {
                    name: person.displayName,
                  })}
                  dialogTitle={t('settings.household.members.remove')}
                  dialogDescription={
                    // A manager could see the token of every open `member`
                    // invite. Their own open invites are revoked with the
                    // removal (owner decision O20), but they may have copied
                    // one made by someone else. A member sees no tokens, so
                    // the extra sentence is for a manager only.
                    person.role === 'manager'
                      ? `${t('settings.household.members.removeConfirm', {
                          name: person.displayName,
                        })} ${t('settings.household.members.removeConfirmManager')}`
                      : t('settings.household.members.removeConfirm', {
                          name: person.displayName,
                        })
                  }
                  confirmLabel={t('settings.household.members.remove')}
                  onDelete={() => onRemove(person)}
                />
              )}
              {canLeave && leaving && (
                <output className="text-sm text-foreground-muted">
                  {t('settings.household.members.leaving')}
                </output>
              )}
              {canLeave && !leaving && (
                <DeleteButton
                  trigger={
                    <>
                      <LogOut />
                      {t('settings.household.members.leave')}
                    </>
                  }
                  buttonVariant="destructive-outline"
                  dialogTitle={t('settings.household.members.leave')}
                  dialogDescription={t(
                    lastPerson
                      ? 'settings.household.members.lastLeaveWarning'
                      : 'settings.household.members.leaveConfirm',
                  )}
                  confirmLabel={t('settings.household.members.leave')}
                  onDelete={onLeave}
                />
              )}
            </Card>
          </li>
        )
      })}
      {pendingTransfer && !pendingRowShown && (
        // The offer is for a person this list does not show (the list was
        // read before they joined, or after they left). The owner must still
        // be able to take it back.
        <li>
          <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
            {waiting(pendingTransfer)}
          </Card>
        </li>
      )}
    </ul>
  )
}

/**
 * "Transfer ownership" with its confirm. The button's name says which person
 * it is for ("Transfer ownership to Mia"); the visible word stays in it
 * (WCAG 2.5.3). Not a `DeleteButton`: nothing is deleted, so the confirm is
 * not red.
 */
function TransferButton({
  name,
  householdName,
  disabled,
  onConfirm,
}: {
  name: string
  householdName: string
  disabled: boolean
  onConfirm: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="neutral-outline"
        size="sm"
        aria-label={t('settings.household.members.transferLabel', { name })}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Crown />
        {t('settings.household.members.transfer')}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.household.members.transfer')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('settings.household.members.transferConfirm', {
              household: householdName,
              name,
            })}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                // The page catches its own errors (see `onTransfer`).
                void onConfirm()
              }}
            >
              {t('settings.household.members.transfer')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** "Waiting for {name} to accept" and Cancel, for the owner. */
function WaitingForAccept({
  name,
  onCancel,
  disabled,
}: {
  name: string
  onCancel: () => Promise<void>
  disabled: boolean
}) {
  const { t } = useTranslation()
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="text-foreground-muted">
        {t('settings.household.members.waiting', { name })}
      </span>
      <Button
        type="button"
        variant="neutral-ghost"
        size="sm"
        aria-label={t('settings.household.members.cancelOfferLabel', { name })}
        disabled={disabled}
        onClick={() => {
          void onCancel()
        }}
      >
        {t('settings.household.members.cancelOffer')}
      </Button>
    </span>
  )
}
