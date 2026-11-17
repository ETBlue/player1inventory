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
import { createCache } from '@/apollo/cloudCache'
import { LocationList } from '@/components/location/LocationList'
import { db } from '@/db'
import {
  CreateLocationDocument,
  DeleteLocationDocument,
  GetHouseholdLocationsDocument,
  GetLocationsDocument,
  ReorderLocationsDocument,
  UpdateLocationDocument,
} from '@/generated/graphql'
import { DEFAULT_LOCATION_ID } from '@/types'
import { useCloudLocationKnown } from './useCloudLocationKnown'
import * as dataModeHooks from './useDataMode'
import {
  CLOUD_LOCATION_ORDER_NOT_UPDATABLE,
  useCreateLocation,
  useDeleteLocation,
  useHouseholdLocations,
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

// Cloud ids are server-generated cuids, NOT the local sentinel `'local'`.
// Cloud rows carry no `isDefault`: a household has no default location
// (households task 3.12). The first row is the one at `order` 0.
const CLOUD_FIRST_ID = 'clw3k1q2a0000s9f8h7g6d5e4'
const CLOUD_OTHER_ID = 'clw3k1q2b0001s9f8h7g6d5e5'

const cloudLocation = (id: string, name: string, order: number) => ({
  __typename: 'Location' as const,
  id,
  name,
  order,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T11:00:00.000Z',
  // `GetLocations` selects the caller's role (households H5 task F.1).
  myRole: 'organizer' as const,
})

// Named rather than read back out of the array. `noUncheckedIndexedAccess` is
// on, so `CLOUD_OFFICE` is `… | undefined` and spreading it was four
// `TS2769`s; naming the two rows removes the index access instead of narrowing
// it, and the call sites below say which location they mean.
const CLOUD_WAREHOUSE = cloudLocation(CLOUD_FIRST_ID, 'Cloud Warehouse', 0)
const CLOUD_OFFICE = cloudLocation(CLOUD_OTHER_ID, 'Cloud Office', 1)

const CLOUD_LOCATIONS = [CLOUD_WAREHOUSE, CLOUD_OFFICE]

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

// WHY THE FOUR CLOUD MUTATION CALLS BELOW AWAIT INSIDE `act`.
//
// Each of these hooks returns a UNION of its two branches — the local branch's
// `UseMutationResult<Location, …>` and the cloud branch's own hand-built object
// — and the two disagree on the row shape: `Location.createdAt` is a `Date`,
// the GraphQL row's is an ISO string. `await act(() => mutateAsync(…))` makes
// `act`'s generic infer its type parameter from the FIRST member of that union
// and then reject the second, which was four `TS2769`s.
//
// Awaiting inside the callback makes the callback `Promise<void>`, so nothing
// about the union reaches `act`'s signature. Where the result is asserted it is
// captured in a local typed `Awaited<ReturnType<typeof …>>` — the whole union,
// with no cast and no `!`.

// `NonNullable`, not `MockedProviderProps['mocks']`. That type includes
// `undefined`, and with `exactOptionalPropertyTypes` an explicit `undefined`
// cannot be handed to `MockedProvider`'s optional `mocks` prop. Every call site
// here passes a real array, so requiring one is the accurate signature.
function makeWrapper(mocks: NonNullable<MockedProviderProps['mocks']>) {
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
    // The mutation result also selects `hasOrganizer`, so it covers
    // GetHouseholdLocations too (src/apollo/locationSelections.test.ts).
    const created = {
      ...cloudLocation('clw3k1q2c0002s9f8h7g6d5e6', 'Cloud Shed', 2),
      hasOrganizer: true,
    }
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
    let returned:
      | Awaited<ReturnType<typeof result.current.mutateAsync>>
      | undefined
    await act(async () => {
      returned = await result.current.mutateAsync('Cloud Shed')
    })

    // Then the cloud mutation ran and returned the new location
    expect(returned).toMatchObject({ id: created.id, name: 'Cloud Shed' })
    // And Dexie was left untouched
    expect(await db.locations.count()).toBe(2)
  })

  it('user can rename a location in cloud mode', async () => {
    // Given a cloud UpdateLocation mock expecting a name-only input
    const renamed = {
      ...CLOUD_OFFICE,
      name: 'Cloud Studio',
      hasOrganizer: true,
    }
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
    let returned:
      | Awaited<ReturnType<typeof result.current.mutateAsync>>
      | undefined
    await act(async () => {
      returned = await result.current.mutateAsync({
        id: CLOUD_OTHER_ID,
        updates: { name: 'Cloud Studio' },
      })
    })

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
    let returned:
      | Awaited<ReturnType<typeof result.current.mutateAsync>>
      | undefined
    await act(async () => {
      returned = await result.current.mutateAsync(CLOUD_OTHER_ID)
    })

    // Then the cloud mutation ran
    expect(returned).toBe(true)
    // And Dexie was left untouched
    expect(await db.locations.count()).toBe(2)
  })

  it('user can reorder locations in cloud mode', async () => {
    // Given a cloud ReorderLocations mock returning the reordered list
    // (`reorderLocations` returns [Location!]!, unlike reorderShelves' Boolean)
    const reordered = [
      { ...CLOUD_OFFICE, order: 0, hasOrganizer: true },
      { ...CLOUD_WAREHOUSE, order: 1, hasOrganizer: true },
    ]
    const wrapper = makeWrapper([
      getLocationsMock,
      {
        request: {
          query: ReorderLocationsDocument,
          variables: { orderedIds: [CLOUD_OTHER_ID, CLOUD_FIRST_ID] },
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
    await act(async () => {
      await result.current.reorder.mutateAsync([CLOUD_OTHER_ID, CLOUD_FIRST_ID])
    })

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

// ── Households H5 task F.3: the settings list ──
//
// Three locations. The caller organizes the Warehouse and the Office and has
// NO role on the Shed, so the Shed is on `householdLocations` and not on
// `locations`. A hook that read the switcher's list would never show it.
const CLOUD_SHED_ID = 'clw3k1q2c0002s9f8h7g6d5e6'
const settingsRow = (
  id: string,
  name: string,
  order: number,
  myRole: 'organizer' | null,
  hasOrganizer = true,
) => ({
  __typename: 'Location' as const,
  id,
  name,
  order,
  myRole,
  hasOrganizer,
})
const SETTINGS_ROWS = [
  settingsRow(CLOUD_FIRST_ID, 'Cloud Warehouse', 0, 'organizer'),
  settingsRow(CLOUD_SHED_ID, 'Cloud Shed', 1, null, false),
  settingsRow(CLOUD_OTHER_ID, 'Cloud Office', 2, 'organizer'),
]
const getHouseholdLocationsMock = {
  request: { query: GetHouseholdLocationsDocument },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: { data: { householdLocations: SETTINGS_ROWS } },
}

describe('useHouseholdLocations', () => {
  beforeEach(async () => {
    await seedLocalLocations()
  })

  it('household owner sees every location in cloud mode, with No access where they have no role', async () => {
    mockMode('cloud')
    const { result } = renderHook(() => useHouseholdLocations(), {
      wrapper: makeWrapper([getLocationsMock, getHouseholdLocationsMock]),
    })

    await waitFor(() => expect(result.current.data).toHaveLength(3))
    expect(
      result.current.data?.map((l) => [l.name, l.myRole, l.hasOrganizer]),
    ).toEqual([
      ['Cloud Warehouse', 'organizer', true],
      ['Cloud Shed', null, false],
      ['Cloud Office', 'organizer', true],
    ])
  })

  it('local mode lists the local locations, each as organizer', async () => {
    mockMode('local')
    const { result } = renderHook(() => useHouseholdLocations(), {
      wrapper: makeWrapper([]),
    })

    await waitFor(() => expect(result.current.data).toHaveLength(2))
    expect(
      result.current.data?.map((l) => [l.name, l.myRole, l.hasOrganizer]),
    ).toEqual([
      ['Local Kitchen', 'organizer', true],
      ['Local Garage', 'organizer', true],
    ])
  })

  it('household owner sees the settings list in the new order after a reorder, the No access row included', async () => {
    // Given the settings list is loaded. The server answers a reorder with
    // the locations the caller has a role on ONLY, so its answer cannot
    // replace the settings list.
    mockMode('cloud')
    const orderedIds = [CLOUD_OTHER_ID, CLOUD_SHED_ID, CLOUD_FIRST_ID]
    const wrapper = makeWrapper([
      getLocationsMock,
      getHouseholdLocationsMock,
      {
        request: { query: ReorderLocationsDocument, variables: { orderedIds } },
        result: {
          data: {
            reorderLocations: [
              { ...CLOUD_OFFICE, order: 0, hasOrganizer: true },
              { ...CLOUD_WAREHOUSE, order: 2, hasOrganizer: true },
            ],
          },
        },
      },
    ])
    const { result } = renderHook(
      () => ({
        settings: useHouseholdLocations(),
        reorder: useReorderLocations(),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.settings.data).toHaveLength(3))

    // When the owner moves the Office to the top
    await act(async () => {
      await result.current.reorder.mutateAsync(orderedIds)
    })

    // Then the settings list shows the order that was sent, with no refetch
    await waitFor(() =>
      expect(result.current.settings.data?.map((l) => l.name)).toEqual([
        'Cloud Office',
        'Cloud Shed',
        'Cloud Warehouse',
      ]),
    )
    expect(result.current.settings.data?.map((l) => l.order)).toEqual([0, 1, 2])
  })
})

// ── The settings list after a write (review of H5 task F.3) ──
//
// Create, rename and delete refetch `GetHouseholdLocations` BY NAME, and a
// refused reorder reloads both lists. Each test answers the list twice, with a
// different list the second time, so the test sees the second answer only when
// the hook really asked again. A wrong query name asks nothing, and the list
// keeps its first answer.
const CLOUD_ATTIC_ID = 'clw3k1q2d0003s9f8h7g6d5e7'
const ATTIC_ROW = settingsRow(CLOUD_ATTIC_ID, 'Cloud Attic', 3, 'organizer')

/** `GetHouseholdLocations` answers `first`, then `second` on every later ask. */
function settingsListAnswers(
  first: typeof SETTINGS_ROWS,
  second: typeof SETTINGS_ROWS,
) {
  return [
    {
      request: { query: GetHouseholdLocationsDocument },
      result: { data: { householdLocations: first } },
    },
    {
      request: { query: GetHouseholdLocationsDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: { data: { householdLocations: second } },
    },
  ]
}

describe('the settings list is fetched again after a write', () => {
  beforeEach(async () => {
    await seedLocalLocations()
    mockMode('cloud')
  })

  it('household owner sees a new location on the settings list after creating it', async () => {
    const created = {
      ...cloudLocation(CLOUD_ATTIC_ID, 'Cloud Attic', 3),
      hasOrganizer: true,
    }
    const { result } = renderHook(
      () => ({
        settings: useHouseholdLocations(),
        create: useCreateLocation(),
      }),
      {
        wrapper: makeWrapper([
          getLocationsMock,
          ...settingsListAnswers(SETTINGS_ROWS, [...SETTINGS_ROWS, ATTIC_ROW]),
          {
            request: {
              query: CreateLocationDocument,
              variables: { name: 'Cloud Attic' },
            },
            result: { data: { createLocation: created } },
          },
        ]),
      },
    )
    await waitFor(() => expect(result.current.settings.data).toHaveLength(3))

    await act(async () => {
      await result.current.create.mutateAsync('Cloud Attic')
    })

    await waitFor(() =>
      expect(result.current.settings.data?.map((l) => l.name)).toContain(
        'Cloud Attic',
      ),
    )
  })

  it('household owner sees the new name on the settings list after a rename', async () => {
    const renamed = {
      ...CLOUD_OFFICE,
      name: 'Cloud Studio',
      hasOrganizer: true,
    }
    const { result } = renderHook(
      () => ({
        settings: useHouseholdLocations(),
        rename: useUpdateLocation(),
      }),
      {
        wrapper: makeWrapper([
          getLocationsMock,
          // The second answer renames the Shed too, which the caller has no
          // role on. The rename's own result cannot put that name in the
          // cache; only a refetch can.
          ...settingsListAnswers(SETTINGS_ROWS, [
            settingsRow(CLOUD_FIRST_ID, 'Cloud Warehouse', 0, 'organizer'),
            settingsRow(CLOUD_SHED_ID, 'Cloud Barn', 1, null, false),
            settingsRow(CLOUD_OTHER_ID, 'Cloud Studio', 2, 'organizer'),
          ]),
          {
            request: {
              query: UpdateLocationDocument,
              variables: {
                id: CLOUD_OTHER_ID,
                input: { name: 'Cloud Studio' },
              },
            },
            result: { data: { updateLocation: renamed } },
          },
        ]),
      },
    )
    await waitFor(() => expect(result.current.settings.data).toHaveLength(3))

    await act(async () => {
      await result.current.rename.mutateAsync({
        id: CLOUD_OTHER_ID,
        updates: { name: 'Cloud Studio' },
      })
    })

    await waitFor(() =>
      expect(result.current.settings.data?.map((l) => l.name)).toContain(
        'Cloud Barn',
      ),
    )
  })

  it('household owner no longer sees a deleted location on the settings list', async () => {
    const { result } = renderHook(
      () => ({
        settings: useHouseholdLocations(),
        remove: useDeleteLocation(),
      }),
      {
        wrapper: makeWrapper([
          getLocationsMock,
          ...settingsListAnswers(
            SETTINGS_ROWS,
            SETTINGS_ROWS.filter((l) => l.id !== CLOUD_SHED_ID),
          ),
          {
            request: {
              query: DeleteLocationDocument,
              variables: { id: CLOUD_SHED_ID },
            },
            result: { data: { deleteLocation: true } },
          },
        ]),
      },
    )
    await waitFor(() => expect(result.current.settings.data).toHaveLength(3))

    await act(async () => {
      await result.current.remove.mutateAsync(CLOUD_SHED_ID)
    })

    await waitFor(() => expect(result.current.settings.data).toHaveLength(2))
    expect(result.current.settings.data?.map((l) => l.name)).not.toContain(
      'Cloud Shed',
    )
  })

  it('household owner gets both location lists again after a refused reorder', async () => {
    // Given another member created the Attic after this tab loaded, so the
    // server refuses the three ids this tab sends (task F.2)
    const orderedIds = [CLOUD_OTHER_ID, CLOUD_SHED_ID, CLOUD_FIRST_ID]
    const atticForSwitcher = cloudLocation(CLOUD_ATTIC_ID, 'Cloud Attic', 3)
    const { result } = renderHook(
      () => ({
        settings: useHouseholdLocations(),
        switcher: useLocations(),
        reorder: useReorderLocations(),
      }),
      {
        wrapper: makeWrapper([
          {
            request: { query: GetLocationsDocument },
            result: { data: { locations: CLOUD_LOCATIONS } },
          },
          {
            request: { query: GetLocationsDocument },
            maxUsageCount: Number.POSITIVE_INFINITY,
            result: {
              data: { locations: [...CLOUD_LOCATIONS, atticForSwitcher] },
            },
          },
          ...settingsListAnswers(SETTINGS_ROWS, [...SETTINGS_ROWS, ATTIC_ROW]),
          {
            request: {
              query: ReorderLocationsDocument,
              variables: { orderedIds },
            },
            result: {
              errors: [
                {
                  message: 'Send every location of the household.',
                  extensions: { code: 'BAD_USER_INPUT' },
                },
              ],
            },
          },
        ]),
      },
    )
    await waitFor(() => expect(result.current.settings.data).toHaveLength(3))
    await waitFor(() => expect(result.current.switcher.data).toHaveLength(2))

    // When the reorder is refused
    const onError = vi.fn()
    await act(async () => {
      await result.current.reorder.mutate(orderedIds, { onError })
    })
    expect(onError).toHaveBeenCalledTimes(1)

    // Then both lists hold the Attic, so the next drag sends all four ids
    await waitFor(() => expect(result.current.settings.data).toHaveLength(4))
    await waitFor(() => expect(result.current.switcher.data).toHaveLength(3))
  })
})

describe('cloud locations have no default location', () => {
  // This harness renders `useLocations()`'s list straight into
  // <LocationList>, which hides the delete control and the drag handle only
  // for a row with `isDefault === true`. Since households task 3.12 the cloud
  // `GetLocations` document no longer selects `isDefault`, so no cloud row can
  // be locked. The server refuses to delete the LAST location instead
  // (`LAST_LOCATION`); the settings page shows that refusal, see
  // `routes/settings/household/locations/index.cloud.test.tsx`.
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

  it('user in cloud mode sees delete and drag controls on every location, the first one too', async () => {
    // Given two cloud locations, the first at `order` 0
    const Wrapper = makeWrapper([getLocationsMock])

    // When the locations list renders in cloud mode
    render(
      <Wrapper>
        <CloudLocationSettings />
      </Wrapper>,
    )
    expect(await screen.findByText('Cloud Warehouse')).toBeInTheDocument()

    // Then every row, the first one included, can be deleted and dragged,
    // and no row is labelled as the default
    for (const name of ['Cloud Warehouse', 'Cloud Office']) {
      expect(
        screen.getByRole('button', { name: `Delete ${name}` }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: `Drag to reorder ${name}` }),
      ).toBeInTheDocument()
    }
    expect(screen.queryByText('Default')).not.toBeInTheDocument()
  })
})

// The cloud Apollo cache is PERSISTED to IndexedDB (`Player1InventoryCloudCache`)
// and restored before React mounts (`main.tsx` → `bootstrap.ts` →
// `apollo/persistence.ts`). `persistence.ts` has no TTL and no schema version,
// so a restored snapshot can be arbitrarily old. Under the default
// `cache-first` policy Apollo finds a COMPLETE `ROOT_QUERY.locations` array in
// that snapshot and sends no request at all — a location added on another
// device never appears, and the network tab shows no `GetLocations` request.
//
// The fixture is the test: the warm cache holds ONE location and the mocked
// server holds TWO. With `cache-first` the hook returns the cached one and
// stops; only a policy that also hits the network can reach the second.
describe('useLocations (cloud) — a stale persisted cache', () => {
  function makeCloudWrapper(
    mocks: NonNullable<MockedProviderProps['mocks']>,
    cache: ReturnType<typeof createCache>,
  ) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    return ({ children }: { children: ReactNode }) => (
      <MockedProvider
        mocks={mocks}
        cache={cache}
        mockLinkDefaultOptions={{ delay: 0 }}
      >
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </MockedProvider>
    )
  }

  function warmCache(locations: typeof CLOUD_LOCATIONS) {
    const cache = createCache()
    cache.writeQuery({ query: GetLocationsDocument, data: { locations } })
    return cache
  }

  beforeEach(async () => {
    await seedLocalLocations()
    mockMode('cloud')
  })

  it('user sees a location added on another device after reopening the app', async () => {
    // Given a restored cache holding only the location this device knew about,
    // while the account now has two
    const cache = warmCache([CLOUD_WAREHOUSE])
    const { result } = renderHook(() => useLocations(), {
      wrapper: makeCloudWrapper([getLocationsMock], cache),
    })

    // When the hook mounts
    // Then it goes to the network anyway and the new location shows up
    await waitFor(() => expect(result.current.data).toHaveLength(2))
    expect(result.current.data?.map((l) => l.name)).toEqual([
      'Cloud Warehouse',
      'Cloud Office',
    ])
  })

  it('user offline still sees the cached locations and no error', async () => {
    // Given a warm cache and a network that fails every request
    const cache = warmCache(CLOUD_LOCATIONS)
    const { result } = renderHook(() => useLocations(), {
      wrapper: makeCloudWrapper(
        [
          {
            request: { query: GetLocationsDocument },
            maxUsageCount: Number.POSITIVE_INFINITY,
            error: new Error('Failed to fetch'),
          },
        ],
        cache,
      ),
    })

    // When the failed request has settled
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Then the cached list is still returned and no error is reported, so an
    // offline user keeps their locations instead of an empty list.
    // This is also why the hook sets no `errorPolicy`: measured on Apollo
    // Client 4.1.6, the DEFAULT `'none'` keeps the cached result in `data`
    // after a failed network leg, while `errorPolicy: 'all'` moves it to
    // `previousData` and leaves `data` undefined.
    expect(result.current.data?.map((l) => l.name)).toEqual([
      'Cloud Warehouse',
      'Cloud Office',
    ])
    expect(result.current.isError).toBe(false)
  })

  it('the `useCloudLocationKnown` gate sees a location the refetch discovers', async () => {
    // Given a stale cache that knows only the first location, and a gate asked
    // about the second — mounted BEFORE `useLocations()`, the order in which a
    // `cache-first` observer could get stuck on the stale entry
    const cache = warmCache([CLOUD_WAREHOUSE])
    const { result } = renderHook(
      () => {
        const known = useCloudLocationKnown(CLOUD_OTHER_ID, true)
        const locations = useLocations()
        return { known, locations }
      },
      { wrapper: makeCloudWrapper([getLocationsMock], cache) },
    )

    // Then the gate starts closed, because the stale cache has no such location
    expect(result.current.known).toBe(false)

    // When `useLocations()` refetches, both observers read the same
    // `ROOT_QUERY.locations` entry, so the gate opens on the same write
    await waitFor(() => expect(result.current.known).toBe(true))
    expect(result.current.locations.data).toHaveLength(2)
  })
})
