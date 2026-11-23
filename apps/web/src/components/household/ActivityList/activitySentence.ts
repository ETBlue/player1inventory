import type { TFunction } from 'i18next'
import type { ActivityAction } from '@/generated/graphql'
import type { ActivityEntry } from '@/hooks/useHouseholdActivity'

// One translated sentence per log row (households H6, task J.6; decisions
// T51, T53; texts from owner decision O39-A). Each action has its own key
// with `{{actor}}`, `{{target}}`, `{{location}}`, `{{role}}` or `{{count}}`
// in it, so a language can put the words in its own order (`tw` puts the
// location before the role). Never build a sentence by joining parts.
//
// The server sends `null` for a field whose stored details had the wrong
// shape. Every field has a fallback text, so such a row still reads as a
// sentence and never breaks the page.

const K = 'settings.household.activity'

const KEY_BY_ACTION: Record<ActivityAction, string> = {
  LOCATION_ROLE_SET: 'locationRoleSet',
  LOCATION_ROLE_REMOVED: 'locationRoleRemoved',
  LOCATION_LEFT: 'locationLeft',
  HOUSEHOLD_ROLE_CHANGED: 'householdRoleChanged',
  INVITE_CREATED: 'inviteCreated',
  INVITE_REVOKED: 'inviteRevoked',
  MEMBER_JOINED: 'memberJoined',
  MEMBER_LEFT: 'memberLeft',
  MEMBER_REMOVED: 'memberRemoved',
  HOUSEHOLD_CLEARED: 'householdCleared',
  LOCATIONS_DELETED: 'locationsDeleted',
  LOCATION_ITEMS_REMOVED: 'locationItemsRemoved',
  IMPORT: 'import',
  OWNERSHIP_OFFERED: 'ownershipOffered',
  OWNERSHIP_OFFER_CANCELLED: 'ownershipOfferCancelled',
  OWNERSHIP_DECLINED: 'ownershipDeclined',
  OWNERSHIP_ACCEPTED: 'ownershipAccepted',
  HANDOVER_STARTED: 'handoverStarted',
  ACCOUNT_DELETED: 'accountDeleted',
}

const LOCATION_ROLES = new Set(['organizer', 'participant', 'viewer'])
const HOUSEHOLD_ROLES = new Set(['owner', 'manager', 'member'])

/** A person's name as stored, with "(deleted account)" after it (O35-A). */
function personName(
  t: TFunction,
  name: string | null | undefined,
  isMe: boolean | null | undefined,
  deleted: boolean | null | undefined,
  position: 'actor' | 'target',
): string {
  if (isMe) return t(position === 'actor' ? `${K}.you` : `${K}.youTarget`)
  // `''` only when the person has no `User` row any more.
  const shown = name
    ? name
    : t(position === 'actor' ? `${K}.someone` : `${K}.someoneTarget`)
  return deleted ? t(`${K}.deletedAccount`, { name: shown }) : shown
}

function roleName(
  t: TFunction,
  role: string | null | undefined,
  ladder: 'location' | 'household',
): string {
  const known = ladder === 'location' ? LOCATION_ROLES : HOUSEHOLD_ROLES
  if (role && known.has(role)) return t(`roles.${ladder}.${role}`)
  return t(`${K}.unknownRole`)
}

/** The sentence for one log row, in the language of `t`. */
export function activitySentence(entry: ActivityEntry, t: TFunction): string {
  const actor = personName(
    t,
    entry.actorName,
    entry.actorIsMe,
    entry.actorDeleted,
    'actor',
  )
  const target = personName(
    t,
    entry.targetName,
    entry.targetIsMe,
    entry.targetDeleted,
    'target',
  )
  const location = entry.locationName || t(`${K}.unknownLocation`)
  const key = KEY_BY_ACTION[entry.action] as string | undefined

  switch (entry.action) {
    case 'LOCATION_ROLE_SET':
      return t(`${K}.${key}`, {
        actor,
        target,
        location,
        role: roleName(t, entry.toRole, 'location'),
      })
    case 'HOUSEHOLD_ROLE_CHANGED':
      return t(`${K}.${key}`, {
        actor,
        target,
        role: roleName(t, entry.toRole, 'household'),
      })
    case 'INVITE_CREATED':
      return t(`${K}.${key}`, {
        actor,
        role: roleName(t, entry.householdRole, 'household'),
      })
    case 'LOCATIONS_DELETED':
      return typeof entry.count === 'number'
        ? t(`${K}.locationsDeleted`, { actor, count: entry.count })
        : t(`${K}.locationsDeletedNoCount`, { actor })
    default:
      // An action this bundle does not know (a newer server) still reads
      // as a sentence.
      if (key === undefined) return t(`${K}.unknownAction`, { actor })
      return t(`${K}.${key}`, { actor, target, location })
  }
}
