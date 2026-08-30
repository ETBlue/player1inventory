import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocationList } from '@/components/location/LocationList'
import { db } from '@/db'
import {
  CreateLocationDocument,
  DeleteLocationDocument,
  GetLocationsDocument,
  ReorderLocationsDocument,
  UpdateLocationDocument,
} from '@/generated/graphql'
import { DEFAULT_LOCATION_ID } from '@/types'
import * as dataModeHooks from './useDataMode'
import {
  CLOUD_LOCATION_ORDER_NOT_UPDATABLE,
  useCreateLocation,
  useDeleteLocation,
  useLocations,
  useReorderLocations,
  useUpdateLocation,
} from './useLocations'

// Restore the REAL generated Apollo hooks for this file. `src/test/setup.ts`
// stubs every one of them (all other tests run in local mode), but here the
// GetLocations SELECTION SET is part of what is under test: a hand-written stub
// would keep handing back `isDefault` after the field had been removed from the
// document, so the delete-guard test below could never go red.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())

vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

function mockMode(mode: 'local' | 'cloud') {
  vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
    mode,
    setMode: vi.fn(),
  })
}

// The cloud default's id is a server-generated cuid, NOT the local sentinel
// `'local'`. That divergence is the whole point of `Location.isDefault`: with a
// local fixture, `id === DEFAULT_LOCATION_ID` and `isDefault` are the same
// predicate, so a test cannot tell them apart (Task 1's guard test was a
// negative control for exactly that reason).
const CLOUD_DEFAULT_ID = 'clw3k1q2a0000s9f8h7g6d5e4'
const CLOUD_OTHER_ID = 'clw3k1q2b0001s9f8h7g6d5e5'

const cloudLocation = (
  id: string,
  name: string,
  order: number,
  isDefault: boolean,
) => ({
  __typename: 'Location' as const,
  id,
  name,
  order,
  isDefault,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T11:00:00.000Z',
})

const CLOUD_LOCATIONS = [
  cloudLocation(CLOUD_DEFAULT_ID, 'Cloud Warehouse', 0, true),
  cloudLocation(CLOUD_OTHER_ID, 'Cloud Office', 1, false),
]

const getLocationsMock = {
  request: { query: GetLocationsDocument },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: { data: { locations: CLOUD_LOCATIONS } },
}

// THE FIXTURE IS THE TEST: the local Dexie names and the cloud names are
// DISJOINT. Seeded identically, a hook that ignored the mode entirely would
// still pass every assertion below.
async function seedLocalLocations() {
  await db.locations.clear()
  const now = new Date()
  await db.locations.bulkPut([
    {
      id: DEFAULT_LOCATION_ID,
      name: 'Local Kitchen',
      order: 0,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'local-garage',
      name: 'Local Garage',
      order: 1,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    },
  ])
}

function makeWrapper(mocks: MockedProviderProps['mocks']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <MockedProvider mocks={mocks} mockLinkDefaultOptions={{ delay: 0 }}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MockedProvider>
  )
}

describe('useLocations', () => {
  beforeEach(async () => {
    await seedLocalLocations()
  })

  it('user in cloud mode sees the cloud locations, not the local ones', async () => {
    // Given cloud mode, with different locations in Dexie and in the cloud
    mockMode('cloud')

    // When the hook loads
    const { result } = renderHook(() => useLocations(), {
      wrapper: makeWrapper([getLocationsMock]),
    })

    // Then the cloud list is returned and the local one is nowhere in it
    await waitFor(() => expect(result.current.data).toHaveLength(2))
    expect(result.current.data?.map((l) => l.name)).toEqual([
      'Cloud Warehouse',
      'Cloud Office',
    ])
    expect(result.current.data?.map((l) => l.name)).not.toContain(
      'Local Kitchen',
    )
  })

  it('user in local mode still sees the local locations', async () => {
    // Given local mode, with different locations in Dexie and in the cloud
    mockMode('local')

    // When the hook loads
    const { result } = renderHook(() => useLocations(), {
      wrapper: makeWrapper([getLocationsMock]),
    })

    // Then Dexie's list is returned and no cloud location leaks in
    await waitFor(() => expect(result.current.data).toHaveLength(2))
    expect(result.current.data?.map((l) => l.name)).toEqual([
      'Local Kitchen',
      'Local Garage',
    ])
    expect(result.current.data?.map((l) => l.name)).not.toContain(
      'Cloud Warehouse',
    )
  })

  it('parses cloud wire dates into Date objects', async () => {
    // Given cloud mode
    mockMode('cloud')

    // When the hook loads
    const { result } = renderHook(() => useLocations(), {
      wrapper: makeWrapper([getLocationsMock]),
    })

    // Then the ISO strings have become Dates, not raw strings
    await waitFor(() => expect(result.current.data).toHaveLength(2))
    const first = result.current.data?.[0]
    expect(first?.createdAt).toBeInstanceOf(Date)
    expect(first?.updatedAt).toBeInstanceOf(Date)
    expect(first?.createdAt.toISOString()).toBe('2026-08-01T10:00:00.000Z')
  })
})

describe('cloud location mutations', () => {
  beforeEach(async () => {
    await seedLocalLocations()
    mockMode('cloud')
  })

  // Every assertion below is variables-exact by construction: MockLink matches
  // on (document, variables), so a mutation sent with the wrong operation or
  // the wrong variables gets "No more mocked responses" and the await rejects.

  it('user can create a location in cloud mode', async () => {
    // Given a cloud CreateLocation mock expecting the typed name
    const created = cloudLocation(
      'clw3k1q2c0002s9f8h7g6d5e6',
      'Cloud Shed',
      2,
      false,
    )
    const { result } = renderHook(() => useCreateLocation(), {
      wrapper: makeWrapper([
        getLocationsMock,
        {
          request: {
            query: CreateLocationDocument,
            variables: { name: 'Cloud Shed' },
          },
          result: { data: { createLocation: created } },
        },
      ]),
    })

    // When the user creates a location
    const returned = await act(() => result.current.mutateAsync('Cloud Shed'))

    // Then the cloud mutation ran and returned the new location
    expect(returned).toMatchObject({ id: created.id, name: 'Cloud Shed' })
    // And Dexie was left untouched
    expect(await db.locations.count()).toBe(2)
  })

  it('user can rename a location in cloud mode', async () => {
    // Given a cloud UpdateLocation mock expecting a name-only input
    const renamed = { ...CLOUD_LOCATIONS[1], name: 'Cloud Studio' }
    const { result } = renderHook(() => useUpdateLocation(), {
      wrapper: makeWrapper([
        getLocationsMock,
        {
          request: {
            query: UpdateLocationDocument,
            variables: { id: CLOUD_OTHER_ID, input: { name: 'Cloud Studio' } },
          },
          result: { data: { updateLocation: renamed } },
        },
      ]),
    })

    // When the user renames a location
    const returned = await act(() =>
      result.current.mutateAsync({
        id: CLOUD_OTHER_ID,
        updates: { name: 'Cloud Studio' },
      }),
    )

    // Then the cloud mutation ran with the new name
    expect(returned).toMatchObject({ name: 'Cloud Studio' })
  })

  it('refuses to write `order` through updateLocation in cloud mode', async () => {
    // Given the cloud UpdateLocationInput, which is name-only — ordering has to
    // go through reorderLocations, and a silently dropped `order` would look
    // like a persisted reorder that never happened
    const { result } = renderHook(() => useUpdateLocation(), {
      wrapper: makeWrapper([getLocationsMock]),
    })

    // When a caller tries to set `order`
    // Then it fails loudly instead of sending a no-op mutation
    expect(() =>
      result.current.mutateAsync({ id: CLOUD_OTHER_ID, updates: { order: 3 } }),
    ).toThrow(CLOUD_LOCATION_ORDER_NOT_UPDATABLE)
  })

  it('user can delete a location in cloud mode', async () => {
    // Given a cloud DeleteLocation mock
    const { result } = renderHook(() => useDeleteLocation(), {
      wrapper: makeWrapper([
        getLocationsMock,
        {
          request: {
            query: DeleteLocationDocument,
            variables: { id: CLOUD_OTHER_ID },
          },
          result: { data: { deleteLocation: true } },
        },
      ]),
    })

    // When the user deletes a location
    const returned = await act(() => result.current.mutateAsync(CLOUD_OTHER_ID))

    // Then the cloud mutation ran
    expect(returned).toBe(true)
    // And Dexie was left untouched
    expect(await db.locations.count()).toBe(2)
  })

  it('user can reorder locations in cloud mode', async () => {
    // Given a cloud ReorderLocations mock returning the reordered list
    // (`reorderLocations` returns [Location!]!, unlike reorderShelves' Boolean)
    const reordered = [
      { ...CLOUD_LOCATIONS[1], order: 0 },
      { ...CLOUD_LOCATIONS[0], order: 1 },
    ]
    const wrapper = makeWrapper([
      getLocationsMock,
      {
        request: {
          query: ReorderLocationsDocument,
          variables: { orderedIds: [CLOUD_OTHER_ID, CLOUD_DEFAULT_ID] },
        },
        result: { data: { reorderLocations: reordered } },
      },
    ])
    const { result } = renderHook(
      () => ({
        locations: useLocations(),
        reorder: useReorderLocations(),
      }),
      { wrapper },
    )
    await waitFor(() =>
      expect(result.current.locations.data?.[0]?.name).toBe('Cloud Warehouse'),
    )

    // When the user drags the second location above the first
    await act(() =>
      result.current.reorder.mutateAsync([CLOUD_OTHER_ID, CLOUD_DEFAULT_ID]),
    )

    // Then the mutation's own result is written into the GetLocations cache
    // entry, so the list re-renders in the new order with no second read
    await waitFor(() =>
      expect(result.current.locations.data?.map((l) => l.name)).toEqual([
        'Cloud Office',
        'Cloud Warehouse',
      ]),
    )
  })
})

describe('cloud default-location delete guard', () => {
  // The settings page renders `useLocations()`'s list straight into
  // <LocationList>, which hides the delete control for `location.isDefault`.
  // Driving that one line from the real hook + real GetLocations document is
  // what discharges Task 1's negative control: here the default's id is a cuid,
  // so `isDefault` is the ONLY thing that can hide the button.
  function CloudLocationSettings() {
    const { data = [] } = useLocations()
    return (
      <LocationList
        locations={data}
        onReorder={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    )
  }

  beforeEach(async () => {
    await seedLocalLocations()
    mockMode('cloud')
  })

  it('user cannot delete the cloud default location, whose id is a cuid not `local`', async () => {
    // Given a cloud default location whose id is NOT DEFAULT_LOCATION_ID
    expect(CLOUD_DEFAULT_ID).not.toBe(DEFAULT_LOCATION_ID)
    const Wrapper = makeWrapper([getLocationsMock])

    // When the locations list renders in cloud mode
    render(
      <Wrapper>
        <CloudLocationSettings />
      </Wrapper>,
    )
    expect(await screen.findByText('Cloud Warehouse')).toBeInTheDocument()

    // Then the default has no delete control, while a non-default one does
    expect(
      screen.queryByRole('button', { name: /delete cloud warehouse/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /delete cloud office/i }),
    ).toBeInTheDocument()
  })
})
