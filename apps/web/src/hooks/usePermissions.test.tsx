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
