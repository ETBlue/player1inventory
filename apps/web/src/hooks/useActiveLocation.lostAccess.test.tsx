import { gql, InMemoryCache } from '@apollo/client'
import { getApolloContext, useQuery } from '@apollo/client/react'
import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { StrictMode, useContext } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refetchForKinds } from '@/apollo/liveUpdates'
import { NoLocationsGate } from '@/components/location/NoLocationsGate'
import { db } from '@/db'
import {
  BootstrapCartsDocument,
  DeleteLocationDocument,
  GetHouseholdDocument,
  GetLocationsDocument,
  LeaveLocationDocument,
  type LocationRole,
} from '@/generated/graphql'
import { expectLocationLoss, forgetSeenLocations } from '@/lib/seenLocations'
import { DEFAULT_LOCATION_ID } from '@/types'
import {
  ACTIVE_LOCATION_STORAGE_KEY,
  ActiveLocationProvider,
  activeLocationStorageKey,
  useActiveLocation,
} from './useActiveLocation'
import * as dataModeHooks from './useDataMode'
import { useLeaveLocation } from './useLocationPeople'
import { useDeleteLocation } from './useLocations'
import { usePermissions } from './usePermissions'

// Households H5c task H.7: a person loses their role on the location they are
// looking at. The tab moves to their first other location (or to the empty
// screen), and shows ONE toast with the old location's name (owner decision
// O27-A, decision T45).
//
// Real Apollo through `MockedProvider`, so every refetch is a real request.
// `src/test/setup.ts` stubs the generated hooks and `useApolloClient`; this
// file puts both real modules back, because `useLeaveLocation` refetches
// through `useApolloClient`.
type Mocks = NonNullable<MockedProviderProps['mocks']>

vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const { toastInfo } = vi.hoisted(() => ({ toastInfo: vi.fn() }))
vi.mock('sonner', () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

function mockMode(mode: 'local' | 'cloud') {
  vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
    mode,
    setMode: vi.fn(),
  })
}

// Two locations. HOME is first, so it is where the tab falls back to, and the
// caller is only a VIEWER there, so no `bootstrapCarts` may be sent for it.
// GARAGE is the active one, where the caller is a participant. Its name is
// lower case on purpose: location names are shown as stored.
const HOME_ID = 'clw3k1q2h0000s9f8h7g6d5h1'
const GARAGE_ID = 'clw3k1q2g0001s9f8h7g6d5g2'
const ATTIC_ID = 'clw3k1q2a0002s9f8h7g6d5a3'

const LOST_TOAST = 'You no longer have access to my Garage.'

const loc = (
  id: string,
  name: string,
  order: number,
  myRole: LocationRole,
) => ({
  __typename: 'Location' as const,
  id,
  name,
  order,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T11:00:00.000Z',
  myRole,
})

const HOME = loc(HOME_ID, 'Home', 0, 'viewer')
const GARAGE = loc(GARAGE_ID, 'my Garage', 1, 'participant')
const ATTIC = loc(ATTIC_ID, 'Attic', 0, 'participant')

type ServerLocation = ReturnType<typeof loc>

// What the server answers to the NEXT `GetLocations`. A test changes it to
// play "someone removed you", and then makes the tab read again.
let serverList: ServerLocation[] = []

function locationsMock() {
  return {
    request: { query: GetLocationsDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () => ({ data: { locations: serverList } }),
  }
}

function bootstrapMock(
  locationId: string,
  fn: () => { data: { bootstrapCarts: never[] } },
) {
  return {
    request: { query: BootstrapCartsDocument, variables: { locationId } },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () => fn(),
  }
}

const householdMock = {
  request: { query: GetHouseholdDocument },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: {
    data: {
      household: {
        __typename: 'Household' as const,
        id: 'hh-lin',
        name: 'Lin',
        role: 'member' as const,
        hasOwner: true,
        pendingTransfer: null,
      },
    },
  },
}

// A location-scoped read, standing in for the pantry: it shows one row named
// after the location it was asked for. "No rows of the old location left on
// screen" is read from it. Like every real location-scoped read, it waits
// until the active id is a location in the loaded list
// (`useCloudLocationKnown`).
const ProbeRowsDocument = gql`
  query ProbeRows($locationId: ID!) {
    probeRows(locationId: $locationId) {
      id
      label
    }
  }
`

function probeMock(locationId: string, label: string) {
  return {
    request: { query: ProbeRowsDocument, variables: { locationId } },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: {
      data: {
        probeRows: [{ __typename: 'ProbeRow', id: `row-${locationId}`, label }],
      },
    },
  }
}

const MyRoleFragment = gql`
  fragment H7MyRole on Location {
    myRole
  }
`

function ProbeRows() {
  const { activeLocationId, activeLocation } = useActiveLocation()
  const { data } = useQuery<{ probeRows: { id: string; label: string }[] }>(
    ProbeRowsDocument,
    { variables: { locationId: activeLocationId }, skip: !activeLocation },
  )
  return (
    <ul aria-label="rows">
      {data?.probeRows.map((r) => (
        <li key={r.id}>{r.label}</li>
      ))}
    </ul>
  )
}

function Consumer() {
  const { activeLocationId, setActiveLocationId, activeLocation } =
    useActiveLocation()
  const client = useContext(getApolloContext()).client
  const { leave } = useLeaveLocation()
  const deleteLocation = useDeleteLocation()
  const permissions = usePermissions()
  return (
    <div>
      <span data-testid="active-location-id">{activeLocationId}</span>
      <span data-testid="active-location-name">
        {activeLocation?.name ?? '—'}
      </span>
      <span data-testid="can-edit">
        {String(permissions.canEditLocation(activeLocationId))}
      </span>
      {/* The live runner's answer to a `LOCATION` event: every active query
          is read again. */}
      <button
        type="button"
        onClick={() => {
          if (client) refetchForKinds(client, ['LOCATION'])
        }}
      >
        live LOCATION
      </button>
      {/* Another server answer that writes a field of a cached location,
          as `GetHouseholdLocations` does with `myRole`. */}
      <button
        type="button"
        onClick={() =>
          client?.cache.writeFragment({
            id: `Location:${GARAGE_ID}`,
            fragment: MyRoleFragment,
            data: { __typename: 'Location', myRole: null },
          })
        }
      >
        write garage role
      </button>
      <button type="button" onClick={() => setActiveLocationId(GARAGE_ID)}>
        switch to garage
      </button>
      <button type="button" onClick={() => void leave(GARAGE_ID)}>
        leave garage
      </button>
      <button
        type="button"
        onClick={() => deleteLocation.mutate(activeLocationId)}
      >
        delete active location
      </button>
      <NoLocationsGate>
        <ProbeRows />
      </NoLocationsGate>
    </div>
  )
}

function renderProvider(mocks: Mocks, options: { cache?: InMemoryCache } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  // StrictMode on purpose: it runs every effect twice on mount, so a toast
  // shown from an effect with no guard would show twice.
  const utils = render(
    <StrictMode>
      <MockedProvider
        mocks={mocks}
        {...(options.cache ? { cache: options.cache } : {})}
        mockLinkDefaultOptions={{ delay: 0 }}
      >
        <QueryClientProvider client={queryClient}>
          <ActiveLocationProvider>
            <Consumer />
          </ActiveLocationProvider>
        </QueryClientProvider>
      </MockedProvider>
    </StrictMode>,
  )
  return { ...utils, queryClient }
}

function standardMocks(extra: Mocks = []) {
  const toHome = vi.fn(() => ({ data: { bootstrapCarts: [] } }))
  const toGarage = vi.fn(() => ({ data: { bootstrapCarts: [] } }))
  return {
    toHome,
    toGarage,
    mocks: [
      locationsMock(),
      householdMock,
      bootstrapMock(HOME_ID, toHome),
      bootstrapMock(GARAGE_ID, toGarage),
      bootstrapMock(
        ATTIC_ID,
        vi.fn(() => ({ data: { bootstrapCarts: [] } })),
      ),
      probeMock(HOME_ID, 'Home row'),
      probeMock(GARAGE_ID, 'my Garage row'),
      probeMock(ATTIC_ID, 'Attic row'),
      ...extra,
    ],
  }
}

function activeId() {
  return screen.getByTestId('active-location-id').textContent
}

function clearStoredIds() {
  localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
  localStorage.removeItem(activeLocationStorageKey('local'))
  localStorage.removeItem(activeLocationStorageKey('cloud'))
}

// Lets every pending mock answer and every effect run, so an absence checked
// after it means something.
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

/** Opens the app on GARAGE and waits until its row is on screen. */
async function openOnGarage(mocks: Mocks) {
  serverList = [HOME, GARAGE]
  localStorage.setItem(activeLocationStorageKey('cloud'), GARAGE_ID)
  const utils = renderProvider(mocks)
  await screen.findByText('my Garage row')
  expect(activeId()).toBe(GARAGE_ID)
  return utils
}

describe('ActiveLocationProvider — losing the role on the active location (households H5c task H.7)', () => {
  beforeEach(() => {
    mockMode('cloud')
    clearStoredIds()
    toastInfo.mockReset()
  })

  afterEach(() => {
    clearStoredIds()
    vi.restoreAllMocks()
  })

  it('user who loses the role on the active location is moved to their first other location', async () => {
    // Given the tab shows GARAGE, where the caller is a participant
    const { mocks, toHome, toGarage } = standardMocks()
    await openOnGarage(mocks)
    await waitFor(() => expect(toGarage).toHaveBeenCalledTimes(1))

    // When an owner removes them, and the live `LOCATION` event makes the tab
    // read every active query again
    serverList = [HOME]
    await userEvent.click(screen.getByRole('button', { name: 'live LOCATION' }))

    // Then the tab is on HOME, its row is on screen, and GARAGE's row is gone
    await screen.findByText('Home row')
    expect(activeId()).toBe(HOME_ID)
    expect(screen.queryByText('my Garage row')).toBeNull()
    expect(localStorage.getItem(activeLocationStorageKey('cloud'))).toBe(
      HOME_ID,
    )
    // And no carts are made at HOME, where the caller is only a viewer
    await settle()
    expect(toHome).not.toHaveBeenCalled()
    // And one toast names the location they lost, as stored
    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastInfo).toHaveBeenCalledWith(LOST_TOAST)
  })

  it('user who leaves the active location in this tab is moved too, with no live event', async () => {
    // Given the tab shows GARAGE. The server never sends a tab its own
    // change, so only the leave hook's own refetch can move this tab.
    const leaveMock = {
      request: {
        query: LeaveLocationDocument,
        variables: { locationId: GARAGE_ID },
      },
      result: () => {
        serverList = [HOME]
        return { data: { leaveLocation: true } }
      },
    }
    const { mocks } = standardMocks([leaveMock])
    await openOnGarage(mocks)

    // When they leave GARAGE
    await userEvent.click(screen.getByRole('button', { name: 'leave garage' }))

    // Then the tab moves to HOME, with no rows of GARAGE left on screen
    await screen.findByText('Home row')
    expect(activeId()).toBe(HOME_ID)
    expect(screen.queryByText('my Garage row')).toBeNull()
    // And the toast shows once
    await settle()
    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastInfo).toHaveBeenCalledWith(LOST_TOAST)
  })

  it('user whose last location is deleted sees the empty screen and the toast', async () => {
    // Given the tab shows GARAGE, the only location the caller has
    serverList = [GARAGE]
    localStorage.setItem(activeLocationStorageKey('cloud'), GARAGE_ID)
    const { mocks } = standardMocks()
    renderProvider(mocks)
    await screen.findByText('my Garage row')

    // When GARAGE is deleted, and the live event reads the list again
    serverList = []
    await userEvent.click(screen.getByRole('button', { name: 'live LOCATION' }))

    // Then the empty screen shows, and GARAGE's row is gone
    await screen.findByText('You have no locations in this household yet.')
    expect(screen.queryByText('my Garage row')).toBeNull()
    // And the stored id is removed, and the active id is the sentinel again
    expect(localStorage.getItem(activeLocationStorageKey('cloud'))).toBeNull()
    expect(activeId()).toBe(DEFAULT_LOCATION_ID)
    // And the toast still names the location that was lost
    await settle()
    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastInfo).toHaveBeenCalledWith(LOST_TOAST)
  })

  it('user opening the app with a stored id they no longer have sees no toast', async () => {
    // Given a stored id from an earlier visit, which the list does not hold
    serverList = [HOME]
    localStorage.setItem(activeLocationStorageKey('cloud'), GARAGE_ID)
    const { mocks } = standardMocks()

    // When the app opens
    renderProvider(mocks)

    // Then the tab is on HOME (something present first, so the absence below
    // is not just the loading state)
    await screen.findByText('Home row')
    expect(activeId()).toBe(HOME_ID)
    // And no toast: this tab never showed GARAGE during this visit
    await settle()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('user opening the app with a cached list that still has the location sees no toast', async () => {
    // Given the cloud cache, restored from an earlier visit, still lists
    // GARAGE, but the server no longer does. With `cache-and-network` the
    // cached list renders first.
    serverList = [HOME]
    localStorage.setItem(activeLocationStorageKey('cloud'), GARAGE_ID)
    const cache = new InMemoryCache()
    cache.writeQuery({
      query: GetLocationsDocument,
      data: { locations: [HOME, GARAGE] },
    })
    const { mocks } = standardMocks()

    // When the app opens and the server answers
    renderProvider(mocks, { cache })

    // Then the tab ends on HOME
    await screen.findByText('Home row')
    expect(activeId()).toBe(HOME_ID)
    // And no toast: only a list the server sent in this visit counts as seen
    await settle()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('user signing into cloud with the local sentinel sees no toast', async () => {
    // Given the cloud slot holds the `'local'` sentinel, which names no cloud
    // location
    serverList = [HOME, GARAGE]
    localStorage.setItem(activeLocationStorageKey('cloud'), DEFAULT_LOCATION_ID)
    const { mocks } = standardMocks()

    // When the app opens
    renderProvider(mocks)

    // Then the tab is on the first location, with no toast
    await screen.findByText('Home row')
    expect(activeId()).toBe(HOME_ID)
    await settle()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('user who switches household sees no toast for the old household', async () => {
    // Given the tab showed GARAGE in the first household
    const first = standardMocks()
    const { unmount } = await openOnGarage(first.mocks)

    // When they switch household. `HouseholdChangeGuard` reloads the page,
    // so the provider mounts again, with GARAGE still stored and a list from
    // the other household.
    unmount()
    serverList = [ATTIC]
    renderProvider(standardMocks().mocks)

    // Then the tab is on ATTIC, and no toast names GARAGE: the seen ids
    // belong to one page visit, not to the module
    await screen.findByText('Attic row')
    expect(activeId()).toBe(ATTIC_ID)
    await settle()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('user sees one toast for one loss, even when the list is read twice', async () => {
    // Given the tab shows GARAGE
    const leaveMock = {
      request: {
        query: LeaveLocationDocument,
        variables: { locationId: GARAGE_ID },
      },
      result: () => {
        serverList = [HOME]
        return { data: { leaveLocation: true } }
      },
    }
    const { mocks } = standardMocks([leaveMock])
    await openOnGarage(mocks)

    // When they leave GARAGE (the hook reads the list again), and a live
    // event reads it once more
    await userEvent.click(screen.getByRole('button', { name: 'leave garage' }))
    await screen.findByText('Home row')
    await userEvent.click(screen.getByRole('button', { name: 'live LOCATION' }))
    await settle()

    // Then there was exactly one toast
    expect(toastInfo).toHaveBeenCalledTimes(1)
  })

  it('user who gets the location back and loses it again sees a toast each time', async () => {
    // Given the tab showed GARAGE and lost it once
    const { mocks } = standardMocks()
    await openOnGarage(mocks)
    serverList = [HOME]
    await userEvent.click(screen.getByRole('button', { name: 'live LOCATION' }))
    await screen.findByText('Home row')
    await waitFor(() => expect(toastInfo).toHaveBeenCalledTimes(1))

    // When GARAGE comes back, they switch to it, and then lose it again
    serverList = [HOME, GARAGE]
    await userEvent.click(screen.getByRole('button', { name: 'live LOCATION' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'switch to garage' }),
    )
    await screen.findByText('my Garage row')
    serverList = [HOME]
    await userEvent.click(screen.getByRole('button', { name: 'live LOCATION' }))
    await screen.findByText('Home row')

    // Then a second toast shows, for the second loss
    await settle()
    expect(toastInfo).toHaveBeenCalledTimes(2)
  })

  it('location participant who becomes a viewer stays on the location, with no toast, and read only', async () => {
    // Given the tab shows GARAGE, where the caller may edit
    const { mocks } = standardMocks()
    await openOnGarage(mocks)
    await waitFor(() =>
      expect(screen.getByTestId('can-edit')).toHaveTextContent('true'),
    )

    // When their role there goes down to viewer
    serverList = [HOME, { ...GARAGE, myRole: 'viewer' }]
    await userEvent.click(screen.getByRole('button', { name: 'live LOCATION' }))

    // Then the page becomes read only
    await waitFor(() =>
      expect(screen.getByTestId('can-edit')).toHaveTextContent('false'),
    )
    // And the tab stays on GARAGE, with its row, and no toast
    expect(activeId()).toBe(GARAGE_ID)
    expect(screen.getByText('my Garage row')).toBeInTheDocument()
    await settle()
    expect(toastInfo).not.toHaveBeenCalled()
  })
  it('user opening the app offline, then online, sees no toast for a location lost before this visit', async () => {
    // Given the restored cache still lists GARAGE, and the first read of the
    // list FAILS (offline). Apollo then reports an error status with the
    // cached list still in `data`.
    serverList = [HOME]
    localStorage.setItem(activeLocationStorageKey('cloud'), GARAGE_ID)
    const cache = new InMemoryCache()
    cache.writeQuery({
      query: GetLocationsDocument,
      data: { locations: [HOME, GARAGE] },
    })
    const offline = {
      request: { query: GetLocationsDocument },
      error: new Error('Failed to fetch'),
      // Twice: StrictMode mounts the query twice, and each mount sends.
      maxUsageCount: 2,
    }
    // `standardMocks` puts its own `GetLocations` mock first, and MockLink
    // answers with the first match, so this failing one goes in front.
    const { mocks } = standardMocks()
    renderProvider(
      [
        offline,
        ...mocks.filter((m) => m.request.query !== GetLocationsDocument),
        locationsMock(),
      ],
      {
        cache,
      },
    )
    // The cached list is on screen: the tab still shows GARAGE
    await screen.findByText('my Garage row')

    // When the device is online again and the list is read (the server no
    // longer lists GARAGE)
    await userEvent.click(screen.getByRole('button', { name: 'live LOCATION' }))

    // Then the tab moves to HOME
    await screen.findByText('Home row')
    expect(activeId()).toBe(HOME_ID)
    // And no toast: the server never sent GARAGE during this visit
    await settle()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('user opening the app offline sees no toast after another answer writes into the cached list', async () => {
    // Given the restored cache lists GARAGE, and the first read of the list
    // FAILS (offline, status 8)
    serverList = [HOME]
    localStorage.setItem(activeLocationStorageKey('cloud'), GARAGE_ID)
    const cache = new InMemoryCache()
    cache.writeQuery({
      query: GetLocationsDocument,
      data: { locations: [HOME, GARAGE] },
    })
    const offline = {
      request: { query: GetLocationsDocument },
      error: new Error('Failed to fetch'),
      maxUsageCount: 2,
    }
    const { mocks } = standardMocks()
    renderProvider(
      [
        offline,
        ...mocks.filter((m) => m.request.query !== GetLocationsDocument),
        locationsMock(),
      ],
      { cache },
    )
    await screen.findByText('my Garage row')

    // When another server answer writes a field of a cached location. Apollo
    // then gives `GetLocations` the status `ready` (7) again, with the
    // RESTORED list (measured on Apollo 4.1.6, `reobserveCacheFirst`).
    await userEvent.click(
      screen.getByRole('button', { name: 'write garage role' }),
    )
    await settle()
    // And then the list is read from the server, which no longer has GARAGE
    await userEvent.click(screen.getByRole('button', { name: 'live LOCATION' }))

    // Then the tab moves to HOME, with no toast: the restored list was never
    // an answer to `GetLocations` in this visit
    await screen.findByText('Home row')
    expect(activeId()).toBe(HOME_ID)
    await settle()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('user who opened the app offline sees the toast for a loss once the list was read online', async () => {
    // Given the first read of the list FAILS (offline), over a restored cache
    serverList = [HOME, GARAGE]
    localStorage.setItem(activeLocationStorageKey('cloud'), GARAGE_ID)
    const cache = new InMemoryCache()
    cache.writeQuery({
      query: GetLocationsDocument,
      data: { locations: [HOME, GARAGE] },
    })
    const offline = {
      request: { query: GetLocationsDocument },
      error: new Error('Failed to fetch'),
      maxUsageCount: 2,
    }
    const { mocks } = standardMocks()
    renderProvider(
      [
        offline,
        ...mocks.filter((m) => m.request.query !== GetLocationsDocument),
        locationsMock(),
      ],
      { cache },
    )
    await screen.findByText('my Garage row')
    // And then, online, a refetch reads the list (it still has GARAGE). That
    // refetch is the first answer the server gives in this visit.
    await userEvent.click(screen.getByRole('button', { name: 'live LOCATION' }))
    await settle()

    // When an owner then removes their role at GARAGE
    serverList = [HOME]
    await userEvent.click(screen.getByRole('button', { name: 'live LOCATION' }))

    // Then the tab moves, and the toast shows: GARAGE came from the server
    await screen.findByText('Home row')
    await settle()
    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastInfo).toHaveBeenCalledWith(LOST_TOAST)
  })

  it('user who deletes their own active location sees no toast', async () => {
    // Given the tab shows GARAGE
    const deleteMock = {
      request: {
        query: DeleteLocationDocument,
        variables: { id: GARAGE_ID },
      },
      result: () => {
        serverList = [HOME]
        return { data: { deleteLocation: true } }
      },
    }
    const { mocks } = standardMocks([deleteMock])
    await openOnGarage(mocks)

    // When they delete it themselves
    await userEvent.click(
      screen.getByRole('button', { name: 'delete active location' }),
    )

    // Then the tab moves to HOME
    await screen.findByText('Home row')
    expect(activeId()).toBe(HOME_ID)
    // And no toast: they just pressed Delete
    await settle()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('user whose own delete fails still sees the toast when someone else removes them later', async () => {
    // Given the tab shows GARAGE, and the delete is refused
    const deleteMock = {
      request: {
        query: DeleteLocationDocument,
        variables: { id: GARAGE_ID },
      },
      result: {
        errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
      },
    }
    const { mocks } = standardMocks([deleteMock])
    await openOnGarage(mocks)
    await userEvent.click(
      screen.getByRole('button', { name: 'delete active location' }),
    )
    await settle()
    expect(activeId()).toBe(GARAGE_ID)

    // When an owner then removes their role there
    serverList = [HOME]
    await userEvent.click(screen.getByRole('button', { name: 'live LOCATION' }))

    // Then the toast shows: the failed delete did not silence this loss
    await screen.findByText('Home row')
    await settle()
    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastInfo).toHaveBeenCalledWith(LOST_TOAST)
  })

  it('user running a clear import sees no toast when every location is replaced', async () => {
    // Given the tab shows GARAGE
    const { mocks } = standardMocks()
    await openOnGarage(mocks)

    // When their own `clear` import deletes every location and makes a new
    // one. The import says so first (`importCloudData` calls it right before
    // `clearAllData`).
    act(() => {
      expectLocationLoss()
    })
    serverList = [ATTIC]
    await userEvent.click(screen.getByRole('button', { name: 'live LOCATION' }))

    // Then the tab moves to the new location, with no toast
    await screen.findByText('Attic row')
    await settle()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('user who signs out and back in as another user sees no toast with the first user location', async () => {
    // Given user A's tab shows GARAGE
    const { mocks } = standardMocks()
    await openOnGarage(mocks)

    // When A signs out (`clearCache` forgets the seen locations) and B signs
    // in with no reload; B's list does not hold GARAGE
    act(() => {
      forgetSeenLocations()
    })
    serverList = [ATTIC]
    await userEvent.click(screen.getByRole('button', { name: 'live LOCATION' }))

    // Then B's tab is on B's location, and no toast names A's location
    await screen.findByText('Attic row')
    await settle()
    expect(toastInfo).not.toHaveBeenCalled()
  })
})

describe('ActiveLocationProvider — the lost-access toast is cloud only', () => {
  afterEach(() => {
    clearStoredIds()
  })

  it('user in local mode whose active location is removed sees no toast', async () => {
    // Given local mode, with two local locations, and the tab on the second.
    // The tab SEES that location in a loaded list, so this test fails if the
    // notice ever runs in local mode.
    mockMode('local')
    toastInfo.mockReset()
    await db.locations.clear()
    const now = new Date()
    await db.locations.bulkPut([
      {
        id: DEFAULT_LOCATION_ID,
        name: 'My Home',
        order: 0,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'loc-garage',
        name: 'Garage',
        order: 1,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      },
    ])
    localStorage.setItem(activeLocationStorageKey('local'), 'loc-garage')
    const { queryClient } = renderProvider([
      probeMock(DEFAULT_LOCATION_ID, 'My Home row'),
      probeMock('loc-garage', 'Garage row'),
    ])
    await screen.findByText('Garage row')

    // When the location is removed while it is active
    await db.locations.delete('loc-garage')
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['locations'] })
    })

    // Then the tab moves to the default location
    await screen.findByText('My Home row')
    expect(activeId()).toBe(DEFAULT_LOCATION_ID)
    // And no toast: local mode has no roles to lose
    await settle()
    expect(toastInfo).not.toHaveBeenCalled()
  })
})
