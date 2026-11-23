import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ActivityAction } from '@/generated/graphql'
import type { ActivityEntry } from '@/hooks/useHouseholdActivity'
import i18n from '@/i18n'
import { elementAt } from '@/test/narrow'
import { ActivityList } from './ActivityList'
import { activitySentence } from './activitySentence'

// The activity list (households H6, task J.6; decisions T51, T53, O35-A,
// O39-A). One translated sentence per action, names as stored.

function entry(
  id: string,
  action: ActivityAction,
  fields: Partial<ActivityEntry> = {},
): ActivityEntry {
  return {
    __typename: 'HouseholdActivityEntry',
    id,
    action,
    createdAt: '2026-11-20T10:05:00.000Z',
    actorName: 'Olive',
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

const mia = { targetName: 'mia Lin', targetIsMe: false, targetDeleted: false }

// One row per action of decision T51, newest first, with the sentence each
// must give. Names and the location name use lower case on purpose: they
// must show as stored.
const EVERY_ACTION: [ActivityEntry, string][] = [
  [
    entry('a01', 'LOCATION_ROLE_SET', {
      ...mia,
      locationName: 'my Kitchen',
      fromRole: 'viewer',
      toRole: 'organizer',
    }),
    'Olive gave mia Lin the Organizer role on my Kitchen',
  ],
  [
    entry('a02', 'LOCATION_ROLE_REMOVED', {
      ...mia,
      locationName: 'my Kitchen',
      fromRole: 'viewer',
    }),
    'Olive removed mia Lin from my Kitchen',
  ],
  [
    entry('a03', 'LOCATION_LEFT', { locationName: 'my Kitchen' }),
    'Olive left my Kitchen',
  ],
  [
    entry('a04', 'HOUSEHOLD_ROLE_CHANGED', {
      ...mia,
      fromRole: 'member',
      toRole: 'manager',
    }),
    'Olive made mia Lin Manager',
  ],
  [
    entry('a05', 'INVITE_CREATED', { householdRole: 'member' }),
    'Olive created an invite for a Member',
  ],
  [entry('a06', 'INVITE_REVOKED'), 'Olive revoked an invite'],
  [
    entry('a07', 'MEMBER_JOINED', { householdRole: 'member' }),
    'Olive joined the household',
  ],
  [entry('a08', 'MEMBER_LEFT'), 'Olive left the household'],
  [
    entry('a09', 'MEMBER_REMOVED', mia),
    'Olive removed mia Lin from the household',
  ],
  [entry('a10', 'HOUSEHOLD_CLEARED'), 'Olive cleared the household'],
  [
    entry('a11', 'LOCATIONS_DELETED', { count: 3 }),
    'Olive deleted all 3 locations',
  ],
  [
    entry('a12', 'LOCATION_ITEMS_REMOVED', { locationName: 'old Garage' }),
    'Olive removed all items from old Garage',
  ],
  [entry('a13', 'IMPORT'), 'Olive imported data'],
  [
    entry('a14', 'OWNERSHIP_OFFERED', mia),
    'Olive offered the household to mia Lin',
  ],
  [
    entry('a15', 'OWNERSHIP_OFFER_CANCELLED', mia),
    'Olive took back the offer to mia Lin',
  ],
  [entry('a16', 'OWNERSHIP_DECLINED'), 'Olive declined to become the owner'],
  [entry('a17', 'OWNERSHIP_ACCEPTED'), 'Olive became the owner'],
  [
    entry('a18', 'HANDOVER_STARTED', { actorDeleted: true }),
    "Olive (deleted account)'s account was deleted. The household needs a new owner",
  ],
  [
    entry('a19', 'ACCOUNT_DELETED', { actorDeleted: true }),
    "Olive (deleted account)'s account was deleted",
  ],
]

function rows() {
  return within(screen.getByRole('list')).getAllByRole('listitem')
}

describe('ActivityList', () => {
  it('user sees who changed what in the household, newest first', () => {
    // Given one row of every action, newest first
    render(<ActivityList entries={EVERY_ACTION.map(([e]) => e)} />)

    // Then each row is its own full sentence, in the same order
    const items = rows()
    expect(items).toHaveLength(EVERY_ACTION.length)
    EVERY_ACTION.forEach(([, sentence], i) => {
      expect(
        elementAt(items, i).querySelector('[data-activity-sentence]')
          ?.textContent,
      ).toBe(sentence)
    })
  })

  it('user sees names and location names as stored, never capitalized', () => {
    render(<ActivityList entries={EVERY_ACTION.map(([e]) => e)} />)
    const list = screen.getByRole('list')
    // No element in the list carries `capitalize` (Name Display Convention)
    expect(list.closest('.capitalize')).toBeNull()
    expect(list.querySelector('.capitalize')).toBeNull()
    expect(screen.getByText(/mia Lin the Organizer role/)).toBeInTheDocument()
  })

  it('user sees a deleted account as its stored name with (deleted account)', () => {
    // Given a person who later deleted their account (owner decision O35-A)
    render(
      <ActivityList
        entries={[
          entry('d1', 'MEMBER_LEFT', { actorName: 'Mia', actorDeleted: true }),
          entry('d2', 'MEMBER_REMOVED', {
            targetName: 'Ben',
            targetIsMe: false,
            targetDeleted: true,
          }),
        ]}
      />,
    )
    expect(
      screen.getByText('Mia (deleted account) left the household'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Olive removed Ben (deleted account) from the household',
      ),
    ).toBeInTheDocument()
  })

  it('user sees "You" and "you" for their own rows', () => {
    render(
      <ActivityList
        entries={[
          entry('m1', 'INVITE_CREATED', {
            actorIsMe: true,
            householdRole: 'manager',
          }),
          entry('m2', 'MEMBER_REMOVED', {
            targetName: 'Olive B',
            targetIsMe: true,
            targetDeleted: false,
          }),
        ]}
      />,
    )
    expect(
      screen.getByText('You created an invite for a Manager'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Olive removed you from the household'),
    ).toBeInTheDocument()
  })

  it('user sees when each change happened', () => {
    render(<ActivityList entries={[entry('t1', 'MEMBER_LEFT')]} />)
    const time = elementAt(rows(), 0).querySelector('time')
    expect(time?.getAttribute('dateTime')).toBe('2026-11-20T10:05:00.000Z')
    expect(time?.textContent).toMatch(/2026/)
    expect(time?.textContent).toMatch(/:05/)
  })

  it('a row with missing fields still shows a sentence and does not crash', () => {
    // Given rows whose details had the wrong shape: the server sends null
    render(
      <ActivityList
        entries={[
          entry('n1', 'LOCATION_ROLE_SET', { toRole: null }),
          entry('n2', 'HOUSEHOLD_ROLE_CHANGED', {
            ...mia,
            toRole: 'not-a-role',
          }),
          entry('n3', 'LOCATIONS_DELETED', { count: null }),
          entry('n4', 'LOCATIONS_DELETED', { count: 1 }),
          entry('n5', 'MEMBER_LEFT', { actorName: '' }),
          entry('n6', 'MEMBER_LEFT', { createdAt: 'not a date' }),
          entry('n7', 'SOMETHING_NEW' as ActivityAction),
        ]}
      />,
    )
    const texts = rows().map(
      (li) => li.querySelector('[data-activity-sentence]')?.textContent,
    )
    expect(texts).toEqual([
      'Olive gave someone the (unknown role) role on a location',
      'Olive made mia Lin (unknown role)',
      'Olive deleted all locations',
      'Olive deleted the only location',
      'Someone left the household',
      'Olive left the household',
      'Olive made a change',
    ])
  })

  it('user sees an empty list as "Nothing has happened here yet."', () => {
    render(<ActivityList entries={[]} />)
    expect(
      screen.getByText('Nothing has happened here yet.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})

describe('activitySentence in Traditional Chinese', () => {
  const tw = i18n.getFixedT('tw')

  it('keeps the tw word order of the O39 text', () => {
    expect(
      activitySentence(
        entry('w1', 'LOCATION_ROLE_SET', {
          ...mia,
          locationName: '廚房',
          toRole: 'organizer',
        }),
        tw,
      ),
    ).toBe('Olive 把 廚房 的據點王角色給了 mia Lin')
  })

  it('adds （已刪除的帳號） and uses 你', () => {
    expect(
      activitySentence(
        entry('w2', 'MEMBER_REMOVED', {
          actorName: 'Mia',
          actorDeleted: true,
          targetName: 'x',
          targetIsMe: true,
          targetDeleted: false,
        }),
        tw,
      ),
    ).toBe('Mia（已刪除的帳號） 把 你 移出了家庭')
  })
})
