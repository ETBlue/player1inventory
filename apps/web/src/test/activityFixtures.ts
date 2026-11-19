import type { ActivityAction } from '@/generated/graphql'
import type { ActivityEntry } from '@/hooks/useHouseholdActivity'

// Activity log rows for stories (households H6, task J.6). A separate module
// because a named export in a `.stories.tsx` becomes a broken story.

/** One log row. Olive did it, at 10:05 on 2026-11-20, unless `fields` say else. */
export function activityEntry(
  id: string,
  action: ActivityAction,
  fields: Partial<ActivityEntry> = {},
): ActivityEntry {
  return {
    __typename: 'HouseholdActivityEntry',
    id,
    action,
    createdAt: '2026-11-20T10:05:00.000Z',
    actorName: 'Olive Lin',
    actorIsMe: false,
    actorDeleted: false,
    targetName: null,
    targetIsMe: null,
    targetDeleted: null,
    locationName: null,
    fromRole: null,
    toRole: null,
    householdRole: null,
    count: null,
    importCounts: null,
    ...fields,
  }
}

const mia = { targetName: 'mia', targetIsMe: false, targetDeleted: false }

/**
 * One row of each of the 19 actions (decision T51), newest first, an hour
 * apart. Names and location names are as a person typed them.
 */
export function everyActivityAction(): ActivityEntry[] {
  const rows: [ActivityAction, Partial<ActivityEntry>][] = [
    ['ACCOUNT_DELETED', { actorName: 'Ben', actorDeleted: true }],
    ['HANDOVER_STARTED', { actorName: 'Ben', actorDeleted: true }],
    ['OWNERSHIP_ACCEPTED', { actorName: 'Mona' }],
    ['OWNERSHIP_DECLINED', { actorName: 'mia' }],
    ['OWNERSHIP_OFFER_CANCELLED', mia],
    ['OWNERSHIP_OFFERED', mia],
    ['IMPORT', { actorIsMe: true }],
    ['LOCATION_ITEMS_REMOVED', { locationName: 'old Garage' }],
    ['LOCATIONS_DELETED', { count: 3 }],
    ['HOUSEHOLD_CLEARED', {}],
    ['MEMBER_REMOVED', { targetName: 'Ben', targetDeleted: true }],
    ['MEMBER_LEFT', { actorName: 'Mona' }],
    ['MEMBER_JOINED', { actorName: 'mia', householdRole: 'member' }],
    ['INVITE_REVOKED', { actorName: 'Mona' }],
    ['INVITE_CREATED', { householdRole: 'member' }],
    [
      'HOUSEHOLD_ROLE_CHANGED',
      { ...mia, fromRole: 'member', toRole: 'manager' },
    ],
    ['LOCATION_LEFT', { actorName: 'Mona', locationName: 'my Kitchen' }],
    [
      'LOCATION_ROLE_REMOVED',
      { ...mia, locationName: 'my Kitchen', fromRole: 'viewer' },
    ],
    [
      'LOCATION_ROLE_SET',
      {
        ...mia,
        locationName: 'my Kitchen',
        fromRole: null,
        toRole: 'organizer',
      },
    ],
  ]
  return rows.map(([action, fields], i) =>
    activityEntry(`act-${String(i).padStart(2, '0')}`, action, {
      createdAt: new Date(Date.UTC(2026, 10, 20, 23 - i, 5)).toISOString(),
      ...fields,
    }),
  )
}
