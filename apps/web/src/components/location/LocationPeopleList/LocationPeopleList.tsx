import { UserMinus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { Card, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { LocationRole } from '@/generated/graphql'

/** One row of `locationPeople`. */
export interface LocationPersonRow {
  userId: string
  displayName: string
  role: LocationRole
  isMe: boolean
}

/**
 * May the caller change a person's role on THIS location from `from` to
 * `to` (`null` = no role)? The page passes
 * `usePermissions().canChangeRole` bound to the location, which is the
 * shared rule `canChangeLocationRole` (households H5c, decision T33).
 */
export type CanChangeRole = (
  from: LocationRole | null,
  to: LocationRole | null,
) => boolean

/** Strongest first, the order of the server's list (decision T39). */
const ROLES: readonly LocationRole[] = ['organizer', 'participant', 'viewer']

/**
 * The choices of a row's role picker: every role the caller may move the
 * person to, plus the current one, strongest first. An empty list when no
 * other role is allowed: then the row shows its role as plain text.
 *
 * So an organizer never sees "Organizer" as a choice, and gets no picker on
 * an organizer's row (owner Review Focus 1). That is the rule's answer, not
 * a rule of this list.
 */
export function roleChoices(
  canChange: CanChangeRole,
  current: LocationRole,
): LocationRole[] {
  const others = ROLES.filter((r) => r !== current && canChange(current, r))
  if (others.length === 0) return []
  return ROLES.filter((r) => r === current || others.includes(r))
}

export interface LocationPeopleListProps {
  /** In the server's order. The list does not sort again. */
  people: LocationPersonRow[]
  /** The location's name as stored, for the Remove confirm. */
  locationName: string
  canChange: CanChangeRole
  /** Must not reject: it reports its own error. */
  onSetRole: (person: LocationPersonRow, role: LocationRole) => void
  /** Must not reject: it reports its own error. */
  onRemove: (person: LocationPersonRow) => Promise<void>
  /**
   * People whose removal is running. Their Remove is replaced by
   * "Removing…", so it cannot be confirmed twice.
   */
  removingUserIds?: ReadonlySet<string>
  /**
   * Role changes that are running: the row's picker shows the picked role
   * and is disabled until the change and its reads are done.
   */
  pendingRoles?: ReadonlyMap<string, LocationRole>
}

/**
 * The people of one location (households H5c, task H.5): name (as stored,
 * never `capitalize`), "(you)" on the caller's row, and the location role.
 *
 * | Row control | Shown when |
 * |---|---|
 * | role picker | `roleChoices` is not empty: the caller may move this person to at least one other role |
 * | Remove | `canChange(role, null)`, and the row is not the caller's own (the caller uses Leave location) |
 *
 * The server checks every write again; this only hides what it would refuse.
 */
export function LocationPeopleList({
  people,
  locationName,
  canChange,
  onSetRole,
  onRemove,
  removingUserIds,
  pendingRoles,
}: LocationPeopleListProps) {
  const { t } = useTranslation()
  if (people.length === 0) {
    return (
      <p className="px-4 py-2 text-sm text-foreground-muted">
        {t('settings.locations.people.nobody')}
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-px">
      {people.map((person) => {
        const choices = roleChoices(canChange, person.role)
        const canRemove = !person.isMe && canChange(person.role, null)
        const removing = removingUserIds?.has(person.userId) ?? false
        const pendingRole = pendingRoles?.get(person.userId)
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
              {choices.length > 0 ? (
                <Select
                  value={pendingRole ?? person.role}
                  disabled={pendingRole !== undefined}
                  onValueChange={(next) => {
                    if (next !== person.role)
                      onSetRole(person, next as LocationRole)
                  }}
                >
                  <SelectTrigger
                    className="w-36"
                    aria-label={t('settings.locations.people.roleLabel', {
                      name: person.displayName,
                    })}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {choices.map((role) => (
                      <SelectItem key={role} value={role}>
                        {t(`roles.location.${role}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm text-foreground-muted">
                  {t(`roles.location.${person.role}`)}
                </span>
              )}
              {canRemove && removing && (
                <output className="text-sm text-foreground-muted">
                  {t('settings.locations.people.removing')}
                </output>
              )}
              {canRemove && !removing && (
                <DeleteButton
                  trigger={<UserMinus />}
                  buttonSize="icon"
                  buttonAriaLabel={t('settings.locations.people.removeLabel', {
                    name: person.displayName,
                  })}
                  dialogTitle={t('settings.household.members.remove')}
                  dialogDescription={t(
                    'settings.locations.people.removeConfirm',
                    { name: person.displayName, location: locationName },
                  )}
                  confirmLabel={t('settings.household.members.remove')}
                  onDelete={() => onRemove(person)}
                />
              )}
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
