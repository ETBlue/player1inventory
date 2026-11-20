import { canChangeLocationRole } from '@p1i/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePermissions } from './usePermissions'

// `usePermissions` (households H5, decision T9) over stubbed generated hooks.
//
// Two people's worth of roles, so a check that reads the wrong one fails:
// the household role decides the catalog and the locations list, the
// location role decides one location. K and G are two locations; X is an id
// the caller has no role on, so it is not in the switcher's list at all.

type Query = { data?: unknown; loading: boolean; error?: unknown }

const mockHousehold = vi.fn<() => Query>()
const mockLocations = vi.fn<() => Query>()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetHouseholdQuery: (o: { skip?: boolean }) =>
      o.skip ? { data: undefined, loading: false } : mockHousehold(),
    useGetLocationsQuery: (o: { skip?: boolean }) =>
      o.skip ? { data: undefined, loading: false } : mockLocations(),
  }
})

function household(role: 'owner' | 'manager' | 'member'): Query {
  return {
    data: { household: { __typename: 'Household', id: 'hh', name: 'H', role } },
    loading: false,
  }
}

function locations(
  rows: { id: string; myRole: 'organizer' | 'participant' | 'viewer' }[],
): Query {
  return {
    data: {
      locations: rows.map((r, i) => ({
        __typename: 'Location',
        ...r,
        name: r.id,
        order: i,
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      })),
    },
    loading: false,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function render() {
  return renderHook(() => usePermissions(), { wrapper }).result.current
}

beforeEach(() => {
  localStorage.setItem('data-mode', 'cloud')
})

afterEach(() => {
  localStorage.removeItem('data-mode')
  vi.resetAllMocks()
})

describe('usePermissions', () => {
  it('local mode allows everything and reports organizer everywhere', () => {
    localStorage.setItem('data-mode', 'local')
    const p = render()
    expect(p.isLoading).toBe(false)
    expect(p.canEditCatalog).toBe(true)
    expect(p.canManageLocations).toBe(true)
    expect(p.roleAt('x')).toBe('organizer')
    expect(p.canEditLocation('x')).toBe(true)
    expect(p.isOrganizerAt('x')).toBe(true)
  })

  it('cloud allows no catalog write while the household role is loading', () => {
    // Given the location list is there, but the household is still loading
    mockHousehold.mockReturnValue({ data: undefined, loading: true })
    mockLocations.mockReturnValue(locations([{ id: 'K', myRole: 'organizer' }]))

    const p = render()

    expect(p.isLoading).toBe(true)
    expect(p.roleKnown).toBe(false)
    expect(p.canEditCatalog).toBe(false)
    expect(p.canManageLocations).toBe(false)
  })

  it('location rights are known while GetHousehold still loads', () => {
    // Given the location list has arrived (organizer of K, viewer of G, no
    // role on X), but `GetHousehold` is still loading. This is the cold
    // Apollo cache every E2E test starts with. Until the review of H5 task
    // F.7 every location right waited for the household role too, so the
    // Stock form stayed read only for a moment and lost the keys typed.
    mockHousehold.mockReturnValue({ data: undefined, loading: true })
    mockLocations.mockReturnValue(
      locations([
        { id: 'K', myRole: 'organizer' },
        { id: 'G', myRole: 'viewer' },
      ]),
    )

    const p = render()

    // Then the location rights follow `myRole` at once
    expect(p.roleAt('K')).toBe('organizer')
    expect(p.canEditLocation('K')).toBe(true)
    expect(p.isOrganizerAt('K')).toBe(true)
    expect(p.roleAt('G')).toBe('viewer')
    expect(p.canEditLocation('G')).toBe(false)
    expect(p.roleAt('X')).toBeNull()
    expect(p.canEditLocation('X')).toBe(false)
    // And the household rights still wait
    expect(p.canEditCatalog).toBe(false)
    expect(p.canManageLocations).toBe(false)
  })

  it('cloud allows nothing while the location list is loading', () => {
    mockHousehold.mockReturnValue(household('owner'))
    mockLocations.mockReturnValue({ data: undefined, loading: true })

    const p = render()

    expect(p.isLoading).toBe(true)
    expect(p.canEditCatalog).toBe(false)
    expect(p.canManageLocations).toBe(false)
    expect(p.roleAt('K')).toBeNull()
    expect(p.canEditLocation('K')).toBe(false)
  })

  it('household manager who is only a viewer of a location can edit the catalog but not that location', () => {
    // Review Focus 4: the two checks are not one flag
    mockHousehold.mockReturnValue(household('manager'))
    mockLocations.mockReturnValue(locations([{ id: 'K', myRole: 'viewer' }]))

    const p = render()

    expect(p.canEditCatalog).toBe(true)
    expect(p.canManageLocations).toBe(true)
    expect(p.roleAt('K')).toBe('viewer')
    expect(p.canEditLocation('K')).toBe(false)
    expect(p.isOrganizerAt('K')).toBe(false)
  })

  it('household member who is a participant can edit that location but not the catalog', () => {
    mockHousehold.mockReturnValue(household('member'))
    mockLocations.mockReturnValue(
      locations([
        { id: 'K', myRole: 'organizer' },
        { id: 'G', myRole: 'participant' },
      ]),
    )

    const p = render()

    expect(p.canEditCatalog).toBe(false)
    expect(p.canManageLocations).toBe(false)
    expect(p.canEditLocation('G')).toBe(true)
    expect(p.isOrganizerAt('G')).toBe(false)
    expect(p.isOrganizerAt('K')).toBe(true)
  })

  it('a location the caller has no role on gives null and false', () => {
    mockHousehold.mockReturnValue(household('owner'))
    mockLocations.mockReturnValue(locations([{ id: 'K', myRole: 'organizer' }]))

    const p = render()

    expect(p.roleAt('X')).toBeNull()
    expect(p.canEditLocation('X')).toBe(false)
    expect(p.isOrganizerAt('X')).toBe(false)
  })

  it('cloud knows the role once the household has loaded', () => {
    // A positive control for the two unknown cases below
    mockHousehold.mockReturnValue(household('member'))
    mockLocations.mockReturnValue(locations([{ id: 'K', myRole: 'viewer' }]))

    const p = render()

    expect(p.roleKnown).toBe(true)
    expect(p.canEditCatalog).toBe(false)
  })

  it('local mode always knows the role', () => {
    localStorage.setItem('data-mode', 'local')
    expect(render().roleKnown).toBe(true)
  })

  it('cloud does not know the role while the household is loading', () => {
    mockHousehold.mockReturnValue({ data: undefined, loading: true })
    mockLocations.mockReturnValue(locations([{ id: 'K', myRole: 'organizer' }]))

    expect(render().roleKnown).toBe(false)
  })

  it('cloud does not know the role when GetHousehold failed with nothing cached, and allows no catalog write', () => {
    // Given the household query failed and the cache is empty: `loading` is
    // false, so `isLoading` is false too, and there is no role to read
    mockHousehold.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('network'),
    })
    mockLocations.mockReturnValue(locations([{ id: 'K', myRole: 'organizer' }]))

    const p = render()

    // Then the role is unknown, not "member"
    expect(p.isLoading).toBe(false)
    expect(p.roleKnown).toBe(false)
    // And the safe default stays: no catalog or locations-list writes
    expect(p.canEditCatalog).toBe(false)
    expect(p.canManageLocations).toBe(false)
    // The location roles come from another query and still count
    expect(p.canEditLocation('K')).toBe(true)
  })

  // Households H5b, task G.9: the Members page. The three household roles
  // must give three different answers, so a check that reads the wrong right
  // fails one of them.
  it.each([
    ['owner', true, true],
    ['manager', true, false],
    ['member', false, false],
  ] as const)('household %s: canManageMembers %s, isHouseholdOwner %s', (role, manage, owner) => {
    mockHousehold.mockReturnValue(household(role))
    mockLocations.mockReturnValue(locations([{ id: 'K', myRole: 'viewer' }]))

    const p = render()

    expect(p.canManageMembers).toBe(manage)
    expect(p.isHouseholdOwner).toBe(owner)
  })

  it('cloud gives no member rights while the household role is loading', () => {
    mockHousehold.mockReturnValue({ data: undefined, loading: true })
    mockLocations.mockReturnValue(locations([]))

    const p = render()

    expect(p.canManageMembers).toBe(false)
    expect(p.isHouseholdOwner).toBe(false)
  })

  it('local mode gives no member rights: it has no members', () => {
    localStorage.setItem('data-mode', 'local')
    const p = render()
    expect(p.canManageMembers).toBe(false)
    expect(p.isHouseholdOwner).toBe(false)
  })
})

// Households H5c, task H.4: the location people page. The household role and
// the caller's role on THIS location both count, so each fixture has a
// location for every caller role: K organizer, P participant, V viewer, and X
// with no role (not in the switcher's list at all).
const ROLE_ROWS = [
  { id: 'K', myRole: 'organizer' },
  { id: 'P', myRole: 'participant' },
  { id: 'V', myRole: 'viewer' },
] as const
const CALLER_ROLE_AT = {
  K: 'organizer',
  P: 'participant',
  V: 'viewer',
  X: null,
} as const
const ROLES_OR_NONE = ['organizer', 'participant', 'viewer', null] as const

describe('usePermissions — the location people page', () => {
  it.each([
    ['owner', { K: true, P: true, V: true, X: true }],
    ['manager', { K: true, P: true, V: true, X: true }],
    ['member', { K: true, P: true, V: true, X: false }],
  ] as const)('household %s: canOpenLocationPage per location (O24-A)', (role, expected) => {
    // Given a household role, and a role on K, P and V but not on X
    mockHousehold.mockReturnValue(household(role))
    mockLocations.mockReturnValue(locations([...ROLE_ROWS]))

    const p = render()

    // Then an owner or manager may open every page, also X with No access;
    // anyone else only the pages of locations they have a role on
    for (const id of ['K', 'P', 'V', 'X'] as const) {
      expect(p.canOpenLocationPage(id), id).toBe(expected[id])
    }
  })

  it('household member with no role on a location cannot open its page', () => {
    // The O24-A case most likely to be got wrong: a role elsewhere is not
    // enough
    mockHousehold.mockReturnValue(household('member'))
    mockLocations.mockReturnValue(locations([{ id: 'K', myRole: 'viewer' }]))

    expect(render().canOpenLocationPage('X')).toBe(false)
  })

  it.each([
    'owner',
    'manager',
    'member',
  ] as const)('household %s: canChangeRole gives the same answer as canChangeLocationRole', (householdRole) => {
    mockHousehold.mockReturnValue(household(householdRole))
    mockLocations.mockReturnValue(locations([...ROLE_ROWS]))

    const p = render()

    // Every location (so every caller role, and no role) times every change
    for (const id of ['K', 'P', 'V', 'X'] as const) {
      for (const from of ROLES_OR_NONE) {
        for (const to of ROLES_OR_NONE) {
          const expected = canChangeLocationRole({
            householdRole,
            callerRole: CALLER_ROLE_AT[id],
            from,
            to,
          })
          expect(p.canChangeRole(id, from, to), `${id} ${from}→${to}`).toBe(
            expected,
          )
        }
      }
    }
  })

  it('location organizer who is a household member can give a participant role but not the organizer role', () => {
    // Review Focus 1, in the web: the control for it is hidden
    mockHousehold.mockReturnValue(household('member'))
    mockLocations.mockReturnValue(locations([...ROLE_ROWS]))

    const p = render()

    expect(p.canChangeRole('K', null, 'participant')).toBe(true)
    expect(p.canChangeRole('K', 'viewer', 'participant')).toBe(true)
    expect(p.canChangeRole('K', null, 'organizer')).toBe(false)
    expect(p.canChangeRole('K', 'organizer', null)).toBe(false)
    // A participant of P changes nothing there
    expect(p.canChangeRole('P', null, 'viewer')).toBe(false)
  })

  it('household manager with no role on a location can give themselves the organizer role', () => {
    mockHousehold.mockReturnValue(household('manager'))
    mockLocations.mockReturnValue(locations([...ROLE_ROWS]))

    expect(render().canChangeRole('X', null, 'organizer')).toBe(true)
  })

  it('cloud allows no role change while the household role is loading', () => {
    // An organizer's answer does not depend on the household role, but an
    // owner's does, so nothing is offered until it is known
    mockHousehold.mockReturnValue({ data: undefined, loading: true })
    mockLocations.mockReturnValue(locations([...ROLE_ROWS]))

    const p = render()

    expect(p.canChangeRole('K', null, 'viewer')).toBe(false)
    // A role on the location is enough to open its page
    expect(p.canOpenLocationPage('K')).toBe(true)
    expect(p.canOpenLocationPage('X')).toBe(false)
  })

  it('household owner gets no role change while the location list is loading', () => {
    // An owner's answer does not need a location role, so only the loading
    // flag can keep it closed. The rights must not show before the list.
    mockHousehold.mockReturnValue(household('owner'))
    mockLocations.mockReturnValue({ data: undefined, loading: true })

    expect(render().canChangeRole('K', null, 'viewer')).toBe(false)
  })

  it('cloud allows no role change when GetHousehold failed with nothing cached', () => {
    mockHousehold.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('network'),
    })
    mockLocations.mockReturnValue(locations([...ROLE_ROWS]))

    expect(render().canChangeRole('K', null, 'viewer')).toBe(false)
  })

  it('cloud allows nothing on the people page while the location list is loading', () => {
    mockHousehold.mockReturnValue(household('member'))
    mockLocations.mockReturnValue({ data: undefined, loading: true })

    const p = render()

    expect(p.canOpenLocationPage('K')).toBe(false)
    expect(p.canChangeRole('K', null, 'viewer')).toBe(false)
  })

  it('local mode has no people page and no role changes', () => {
    // Local mode has one person and no roles (decision T41)
    localStorage.setItem('data-mode', 'local')
    const p = render()
    expect(p.canOpenLocationPage('local')).toBe(false)
    expect(p.canChangeRole('local', null, 'viewer')).toBe(false)
  })
})

// Households H6, task J.5: the Activity page and the purges. Each right gets
// a different answer from at least one role, so a check that reads the wrong
// role fails one of the rows.
describe('usePermissions — activity and purges', () => {
  it.each([
    ['owner', true, true],
    ['manager', true, false],
    ['member', false, false],
  ] as const)('household %s: canReadActivity %s, canPurgeHousehold %s', (role, read, purge) => {
    mockHousehold.mockReturnValue(household(role))
    mockLocations.mockReturnValue(locations([...ROLE_ROWS]))

    const p = render()

    expect(p.canReadActivity).toBe(read)
    expect(p.canPurgeHousehold).toBe(purge)
  })

  it.each([
    'owner',
    'manager',
    'member',
  ] as const)('household %s: canRemoveAllItems follows the location role only', (role) => {
    // Given an organizer of K, a participant of P, a viewer of V, no role on X
    mockHousehold.mockReturnValue(household(role))
    mockLocations.mockReturnValue(locations([...ROLE_ROWS]))

    const p = render()

    // Then only the organizer may remove all items, whatever the household
    // role: the server asks the location role (decision T55)
    expect(p.canRemoveAllItems('K')).toBe(true)
    expect(p.canRemoveAllItems('P')).toBe(false)
    expect(p.canRemoveAllItems('V')).toBe(false)
    expect(p.canRemoveAllItems('X')).toBe(false)
  })

  it('cloud allows no activity read and no household purge while the household role is loading', () => {
    mockHousehold.mockReturnValue({ data: undefined, loading: true })
    mockLocations.mockReturnValue(locations([...ROLE_ROWS]))

    const p = render()

    expect(p.canReadActivity).toBe(false)
    expect(p.canPurgeHousehold).toBe(false)
  })

  it('cloud allows no activity read and no household purge when GetHousehold failed with nothing cached', () => {
    mockHousehold.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('network'),
    })
    mockLocations.mockReturnValue(locations([...ROLE_ROWS]))

    const p = render()

    expect(p.canReadActivity).toBe(false)
    expect(p.canPurgeHousehold).toBe(false)
  })

  it('cloud allows no remove all items while the location list is loading', () => {
    mockHousehold.mockReturnValue(household('owner'))
    mockLocations.mockReturnValue({ data: undefined, loading: true })

    const p = render()

    expect(p.canRemoveAllItems('K')).toBe(false)
    // And the owner's household rights wait for the list too
    expect(p.canPurgeHousehold).toBe(false)
  })

  it('local mode has no activity page and no purges', () => {
    // Local mode has no roles and no log; it clears through the import
    localStorage.setItem('data-mode', 'local')
    const p = render()
    expect(p.canReadActivity).toBe(false)
    expect(p.canPurgeHousehold).toBe(false)
    expect(p.canRemoveAllItems('local')).toBe(false)
  })
})
