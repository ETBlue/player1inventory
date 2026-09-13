import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { GetLocationsDocument } from '@/generated/graphql'
import { cartIdFor, DEFAULT_LOCATION_ID } from '@/types'
import {
  ACTIVE_LOCATION_STORAGE_KEY,
  ActiveLocationProvider,
  activeLocationStorageKey,
  useActiveLocation,
} from './useActiveLocation'
import * as dataModeHooks from './useDataMode'

// Restore the REAL generated Apollo hooks for this file. `src/test/setup.ts`
// stubs every one of them (all other tests run in local mode), but the cloud
// cases below must drive the provider from a real `GetLocations` response:
// a hand-stubbed `useGetLocationsQuery` would keep returning whatever shape the
// stub happened to hold, so "the stale id is corrected to the cloud default"
// could pass without the provider ever consulting a real list.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())

vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

function mockMode(mode: 'local' | 'cloud') {
  vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
    mode,
    setMode: vi.fn(),
  })
}

// The cloud default's id is a server-generated cuid, NOT the local sentinel
// `'local'`. That divergence is the whole point of these tests: with a local
// fixture `id === DEFAULT_LOCATION_ID` and `isDefault` are the same predicate,
// so nothing can tell the sentinel apart from the real default.
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

// The default is deliberately NOT first in the list: `Location.isDefault` says
// the default's order is not stable (another row dragged above it displaces
// it). A default-first fixture cannot tell `find(isDefault)` apart from
// `locations[0]`, which would make the fallback assertions below vacuous.
const CLOUD_LOCATIONS = [
  cloudLocation(CLOUD_OTHER_ID, 'Cloud Office', 0, false),
  cloudLocation(CLOUD_DEFAULT_ID, 'Cloud Warehouse', 1, true),
]

const getLocationsMock = {
  request: { query: GetLocationsDocument },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: { data: { locations: CLOUD_LOCATIONS } },
}

const emptyLocationsMock = {
  request: { query: GetLocationsDocument },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: { data: { locations: [] } },
}

function clearStoredActiveLocationIds() {
  localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
  localStorage.removeItem(activeLocationStorageKey('local'))
  localStorage.removeItem(activeLocationStorageKey('cloud'))
}

function Consumer({ switchTo }: { switchTo: string }) {
  const { activeLocationId, setActiveLocationId, activeLocation } =
    useActiveLocation()
  return (
    <div>
      <span data-testid="active-location-id">{activeLocationId}</span>
      <span data-testid="active-location-name">
        {activeLocation?.name ?? '—'}
      </span>
      <button type="button" onClick={() => setActiveLocationId(switchTo)}>
        switch
      </button>
    </div>
  )
}

function renderProvider(
  mocks: MockedProviderProps['mocks'] = [],
  switchTo = 'loc-2',
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  // A FRESH element every time: re-rendering the identical element object lets
  // React bail out of the subtree, so the provider would never see the newly
  // mocked data mode unless some other update happened to re-render it anyway.
  const ui = () => (
    <MockedProvider mocks={mocks} mockLinkDefaultOptions={{ delay: 0 }}>
      <QueryClientProvider client={queryClient}>
        <ActiveLocationProvider>
          <Consumer switchTo={switchTo} />
        </ActiveLocationProvider>
      </QueryClientProvider>
    </MockedProvider>
  )
  const utils = render(ui())
  // Re-renders the same tree in place, so the provider keeps its state and only
  // the (mocked) data mode changes underneath it.
  return { ...utils, rerenderSameTree: () => utils.rerender(ui()) }
}

async function seedLocalLocations() {
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
}

function activeId() {
  return screen.getByTestId('active-location-id').textContent
}

describe('ActiveLocationProvider — cart bootstrap effect', () => {
  beforeEach(async () => {
    mockMode('local')
    clearStoredActiveLocationIds()
    await db.vendors.clear()
    await db.shoppingCarts.clear()
    await db.locations.clear()
    // The default location row is normally seeded by Dexie's `populate` hook
    // on first open; re-add it here since we just cleared the table (the
    // provider's stale-id fallback effect resets to the default location
    // whenever the active id doesn't match a known location).
    await db.locations.put({
      id: DEFAULT_LOCATION_ID,
      name: 'My Home',
      order: 0,
      isDefault: true,
      createdAt: new Date(),
    })
  })

  afterEach(() => {
    clearStoredActiveLocationIds()
  })

  it('user opens the app — no-vendor and per-vendor carts are bootstrapped for the active location', async () => {
    // Given a vendor exists but no cart rows do yet
    await db.vendors.add({
      id: 'vendor-1',
      name: 'Costco',
      createdAt: new Date(),
    })
    expect(await db.shoppingCarts.toArray()).toHaveLength(0)

    // When the provider mounts (default active location)
    renderProvider()
    await screen.findByTestId('active-location-id')

    // Then the no-vendor cart and the vendor's cart both exist for that location
    await waitFor(async () => {
      const carts = await db.shoppingCarts.toArray()
      const ids = carts.map((c) => c.id)
      expect(ids).toContain(cartIdFor(DEFAULT_LOCATION_ID, null))
      expect(ids).toContain(cartIdFor(DEFAULT_LOCATION_ID, 'vendor-1'))
    })
  })

  it('user switches the active location — carts are bootstrapped for the new location too', async () => {
    // Given a vendor, a second location, and the provider mounted at the default location
    await db.vendors.add({
      id: 'vendor-1',
      name: 'Costco',
      createdAt: new Date(),
    })
    await db.locations.put({
      id: 'loc-2',
      name: 'Cabin',
      order: 1,
      isDefault: false,
      createdAt: new Date(),
    })
    const user = userEvent.setup()
    renderProvider()
    await waitFor(async () => {
      const ids = (await db.shoppingCarts.toArray()).map((c) => c.id)
      expect(ids).toContain(cartIdFor(DEFAULT_LOCATION_ID, null))
    })

    // When the user switches the active location
    await user.click(screen.getByRole('button', { name: 'switch' }))
    await screen.findByText('loc-2')

    // Then carts are bootstrapped for the new location too
    await waitFor(async () => {
      const ids = (await db.shoppingCarts.toArray()).map((c) => c.id)
      expect(ids).toContain(cartIdFor('loc-2', null))
      expect(ids).toContain(cartIdFor('loc-2', 'vendor-1'))
    })
  })
})

describe('ActiveLocationProvider — the active id is validated against the real list', () => {
  beforeEach(async () => {
    clearStoredActiveLocationIds()
    await seedLocalLocations()
  })

  afterEach(() => {
    clearStoredActiveLocationIds()
  })

  it('user signs into cloud carrying the local sentinel — the active location is corrected to the cloud default', async () => {
    // Given cloud mode holding the LOCAL sentinel 'local' as its active id (the
    // state every existing user lands in on their first cloud session), and a
    // cloud list in which no location has that id
    mockMode('cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), DEFAULT_LOCATION_ID)

    // When the provider mounts and the cloud list loads
    renderProvider([getLocationsMock])

    // Then 'local' is treated as the stale id it is and corrected to the
    // cloud default — NOT left standing as a permanently "valid" sentinel,
    // which would scope every cloud query to a location that does not exist
    await waitFor(() => expect(activeId()).toBe(CLOUD_DEFAULT_ID))
    expect(screen.getByTestId('active-location-name')).toHaveTextContent(
      'Cloud Warehouse',
    )
    expect(localStorage.getItem(activeLocationStorageKey('cloud'))).toBe(
      CLOUD_DEFAULT_ID,
    )
  })

  it('user with a deleted cloud location falls back to the default location, not to the first one', async () => {
    // Given a stored cloud id naming a location that has since been deleted
    mockMode('cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), 'deleted-cloud-loc')

    // When the provider mounts and the cloud list loads
    renderProvider([getLocationsMock])

    // Then it falls back to the `isDefault` location — whose id is a cuid, and
    // which is second in the list, so neither the 'local' literal nor
    // `locations[0]` would produce this id
    await waitFor(() => expect(activeId()).toBe(CLOUD_DEFAULT_ID))
    expect(localStorage.getItem(activeLocationStorageKey('cloud'))).toBe(
      CLOUD_DEFAULT_ID,
    )
  })

  it('user whose cloud list comes back empty keeps the location they had', async () => {
    // Given cloud mode with a stored id and a list that loads but is empty
    mockMode('cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), 'ghost')

    // When the provider mounts and the empty list resolves
    renderProvider([emptyLocationsMock])
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Then the id is left alone: there is no location to fall back TO, and
    // clobbering it would discard the user's choice for the moment a real list
    // arrives. Rendering is unaffected — `activeLocation` is simply undefined.
    expect(activeId()).toBe('ghost')
    expect(localStorage.getItem(activeLocationStorageKey('cloud'))).toBe(
      'ghost',
    )
    expect(screen.getByTestId('active-location-name')).toHaveTextContent('—')
  })
})

describe('ActiveLocationProvider — the stored id is per data mode', () => {
  beforeEach(async () => {
    clearStoredActiveLocationIds()
    await seedLocalLocations()
  })

  afterEach(() => {
    clearStoredActiveLocationIds()
  })

  it('user switching local → cloud → local comes back to each modes own last location', async () => {
    // Given a last location remembered for each mode, from disjoint id spaces
    localStorage.setItem(activeLocationStorageKey('local'), 'loc-garage')
    localStorage.setItem(activeLocationStorageKey('cloud'), CLOUD_OTHER_ID)
    mockMode('local')
    const { rerenderSameTree } = renderProvider([getLocationsMock])

    // Then local mode opens on the local location
    await waitFor(() => expect(activeId()).toBe('loc-garage'))

    // When the user switches to cloud
    mockMode('cloud')
    rerenderSameTree()

    // Then the cloud location is restored — not carried over from local, and
    // not reset to the cloud default
    await waitFor(() => expect(activeId()).toBe(CLOUD_OTHER_ID))
    expect(screen.getByTestId('active-location-name')).toHaveTextContent(
      'Cloud Office',
    )

    // When the user switches back
    mockMode('local')
    rerenderSameTree()

    // Then the local location is restored, untouched by the cloud session
    await waitFor(() => expect(activeId()).toBe('loc-garage'))
    expect(localStorage.getItem(activeLocationStorageKey('cloud'))).toBe(
      CLOUD_OTHER_ID,
    )
  })

  it('user switching locations in cloud does not disturb the local slot', async () => {
    // Given cloud mode with a local location already remembered
    localStorage.setItem(activeLocationStorageKey('local'), 'loc-garage')
    mockMode('cloud')
    const user = userEvent.setup()
    renderProvider([getLocationsMock], CLOUD_OTHER_ID)
    await waitFor(() => expect(activeId()).toBe(CLOUD_DEFAULT_ID))

    // When the user picks the other cloud location
    await user.click(screen.getByRole('button', { name: 'switch' }))

    // Then the write lands in the cloud slot only
    await waitFor(() =>
      expect(localStorage.getItem(activeLocationStorageKey('cloud'))).toBe(
        CLOUD_OTHER_ID,
      ),
    )
    expect(localStorage.getItem(activeLocationStorageKey('local'))).toBe(
      'loc-garage',
    )
  })

  it('user upgrading with a location stored under the legacy key keeps it', async () => {
    // Given the pre-upgrade state: one bare key, no per-mode slots
    localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, 'loc-garage')
    mockMode('local')

    // When the app starts after the upgrade
    renderProvider()

    // Then the user is still in their location, which has moved into the local
    // slot — the legacy key is read once and retired, not consulted forever
    await waitFor(() => expect(activeId()).toBe('loc-garage'))
    await waitFor(() =>
      expect(localStorage.getItem(activeLocationStorageKey('local'))).toBe(
        'loc-garage',
      ),
    )
    expect(localStorage.getItem(ACTIVE_LOCATION_STORAGE_KEY)).toBeNull()
  })

  it('user upgrading and signing into cloud does not inherit the legacy local id', async () => {
    // Given the same pre-upgrade bare key, but the session is a cloud one
    localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, 'loc-garage')
    mockMode('cloud')

    // When the app starts
    renderProvider([getLocationsMock])

    // Then cloud opens on its own default, and the legacy id is preserved for
    // local mode rather than being spent on a cloud session
    await waitFor(() => expect(activeId()).toBe(CLOUD_DEFAULT_ID))
    await waitFor(() =>
      expect(localStorage.getItem(activeLocationStorageKey('local'))).toBe(
        'loc-garage',
      ),
    )
  })
})
