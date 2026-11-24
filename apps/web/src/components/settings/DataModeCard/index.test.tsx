import { useClerk } from '@clerk/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { getLocations } from '@/db/operations'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
} from '@/hooks/useActiveLocation'
import type { ExportPayload } from '@/lib/exportData'
import { fetchCloudPayload } from '@/lib/exportData'
import { importLocalData } from '@/lib/importData'
import { callArgs } from '@/test/narrow'
import { DataModeCard } from '.'

// A cloud payload: stock inline on the item, no itemStocks table.
const CLOUD_PAYLOAD = {
  version: 1,
  exportedAt: new Date().toISOString(),
  items: [],
  tags: [],
  tagTypes: [],
  vendors: [],
  recipes: [],
  inventoryLogs: [],
  shoppingCarts: [],
  cartItems: [],
  shelves: [],
}

// DataModeCard reads the location list (useLocations → TanStack Query) to decide
// whether a local → cloud copy needs the multi-location warning.
function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveLocationProvider>
        <DataModeCard />
      </ActiveLocationProvider>
    </QueryClientProvider>,
  )
}

// Partial mock so a test can hold the location query unresolved.
vi.mock('@/db/operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/operations')>()
  return { ...actual, getLocations: vi.fn(() => actual.getLocations()) }
})

// Cloud→local copy: stub the network fetch and observe the local import call.
vi.mock('@/lib/exportData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/exportData')>()
  return { ...actual, fetchCloudPayload: vi.fn(async () => CLOUD_PAYLOAD) }
})

vi.mock('@/lib/importData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/importData')>()
  return { ...actual, importLocalData: vi.fn(async () => {}) }
})

vi.mock('@clerk/react', () => ({
  useUser: vi.fn(() => ({
    user: {
      id: 'user_123',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
    },
  })),
  useClerk: vi.fn(() => ({ signOut: vi.fn() })),
}))

describe('DataModeCard', () => {
  afterEach(async () => {
    localStorage.clear()
    await db.locations.clear()
  })

  it('shows login-free mode UI in local mode', () => {
    // Given localStorage has no 'data-mode' key (defaults to local)
    // (afterEach clears localStorage; no explicit setup needed)

    // When DataModeCard is rendered
    renderCard()

    // Then "Offline Mode" text is shown
    expect(screen.getByText('Offline Mode')).toBeInTheDocument()

    // And "Switch..." button is shown
    expect(
      screen.getByRole('button', { name: 'Switch...' }),
    ).toBeInTheDocument()

    // And cloud mode button is NOT shown (only one "Switch..." button exists)
    expect(screen.getAllByRole('button', { name: 'Switch...' })).toHaveLength(1)
  })

  it('shows confirm dialog when user clicks Enable sharing', async () => {
    // Given local mode
    const user = userEvent.setup()
    renderCard()

    // When user clicks "Switch..."
    await user.click(screen.getByRole('button', { name: 'Switch...' }))

    // Then dialog with "Switch to cloud mode?" title appears
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Switch to cloud mode?' }),
    ).toBeInTheDocument()
  })

  it('shows copy dialog when user confirms switch to cloud', async () => {
    // Given local mode
    const user = userEvent.setup()
    renderCard()

    // When user clicks "Switch..." then confirms "Switch to cloud"
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))

    // Then the copy dialog appears
    expect(
      screen.getByRole('heading', { name: 'Copy local data to cloud?' }),
    ).toBeInTheDocument()
  })

  it('switches to cloud without copying when user clicks Switch without copying', async () => {
    // Given local mode and mocked reload
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })
    const user = userEvent.setup()
    renderCard()

    // When user goes through Switch... → Switch to cloud → Switch without copying
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    await user.click(
      screen.getByRole('button', { name: 'Switch without copying' }),
    )

    // Then data-mode is set to cloud
    expect(localStorage.getItem('data-mode')).toBe('cloud')
    // And migration-prompted flag is set (so PostLoginMigrationDialog won't show)
    expect(localStorage.getItem('migration-prompted')).toBe('1')
    // And migration-strategy is NOT set
    expect(localStorage.getItem('migration-strategy')).toBeNull()
    // And reload was called
    expect(reloadMock).toHaveBeenCalledOnce()
  })

  it('shows strategy dialog when user clicks Yes copy data', async () => {
    // Given local mode
    const user = userEvent.setup()
    renderCard()

    // When user clicks through to "Yes, copy data"
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    await user.click(screen.getByRole('button', { name: 'Yes, copy data' }))

    // Then the strategy dialog appears
    expect(
      screen.getByRole('heading', { name: 'How to handle conflicts?' }),
    ).toBeInTheDocument()
  })

  it('goes back to copy dialog when user cancels strategy dialog', async () => {
    // Given local mode, strategy dialog is open
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    await user.click(screen.getByRole('button', { name: 'Yes, copy data' }))
    expect(
      screen.getByRole('heading', { name: 'How to handle conflicts?' }),
    ).toBeInTheDocument()

    // When user clicks Cancel in strategy dialog
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    // Then the copy dialog is shown again
    expect(
      screen.getByRole('heading', { name: 'Copy local data to cloud?' }),
    ).toBeInTheDocument()
  })

  it('stores strategy and switches to cloud when user chooses Skip conflicts', async () => {
    // Given local mode and mocked reload
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })
    const user = userEvent.setup()
    renderCard()

    // When user selects "Skip conflicts" strategy
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    await user.click(screen.getByRole('button', { name: 'Yes, copy data' }))
    await user.click(screen.getByRole('button', { name: 'Skip conflicts' }))

    // Then migration-strategy is stored
    expect(localStorage.getItem('migration-strategy')).toBe('skip')
    // And data-mode is cloud
    expect(localStorage.getItem('data-mode')).toBe('cloud')
    // And reload was called
    expect(reloadMock).toHaveBeenCalledOnce()
  })

  it('shows cloud mode UI when data-mode is cloud', () => {
    // Given cloud mode is set in localStorage
    localStorage.setItem('data-mode', 'cloud')

    // When DataModeCard is rendered
    renderCard()

    // Then "Cloud Mode" text is shown
    expect(screen.getByText('Cloud Mode')).toBeInTheDocument()

    // And "Switch..." button is shown
    expect(
      screen.getByRole('button', { name: 'Switch...' }),
    ).toBeInTheDocument()
  })

  it('shows Sign Out button in cloud mode', () => {
    // Given cloud mode is set in localStorage
    localStorage.setItem('data-mode', 'cloud')

    // When DataModeCard is rendered
    renderCard()

    // Then "Sign Out" button is shown
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument()
  })

  // A PRODUCTION CHANGE MADE FOR A TEST (households H4 task E.6). The E2E
  // build has no `ClerkProvider`, so `useClerk()` throws there. The cloud
  // section used to be left out whole in E2E mode, and no spec could drive
  // the cloud → local copy. Now only Sign Out, which needs Clerk, is left out.
  it('shows Switch and no Sign Out in cloud mode in the E2E build, without calling Clerk', () => {
    // Given cloud mode in the E2E build, where `useClerk()` would throw
    localStorage.setItem('data-mode', 'cloud')
    vi.stubEnv('VITE_E2E_TEST_USER_ID', 'e2e-test-user')
    vi.mocked(useClerk).mockClear()
    try {
      // When DataModeCard is rendered
      renderCard()

      // Then "Switch..." is shown, "Sign Out" is not, and Clerk was not asked
      expect(
        screen.getByRole('button', { name: 'Switch...' }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Sign Out' }),
      ).not.toBeInTheDocument()
      expect(useClerk).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('shows sign out offline dialog when user clicks Sign Out', async () => {
    // Given cloud mode
    localStorage.setItem('data-mode', 'cloud')
    const user = userEvent.setup()
    renderCard()

    // When user clicks "Sign Out"
    await user.click(screen.getByRole('button', { name: 'Sign Out' }))

    // Then the sign out / offline dialog appears
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Switch to offline mode?' }),
    ).toBeInTheDocument()
  })

  it('shows migrate dialog when user chooses to switch to offline', async () => {
    // Given cloud mode and the askOffline dialog is open
    localStorage.setItem('data-mode', 'cloud')
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'Sign Out' }))

    // When user clicks "Switch to offline"
    await user.click(screen.getByRole('button', { name: 'Switch to offline' }))

    // Then the migrate dialog appears
    expect(
      screen.getByRole('heading', { name: 'Copy cloud data to this device?' }),
    ).toBeInTheDocument()
  })

  it('clears migration-prompted when storing a strategy so auto-migration can run', async () => {
    // Given local mode and migration-prompted already set (simulates a prior cloud session)
    localStorage.setItem('migration-prompted', '1')
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })
    const user = userEvent.setup()
    renderCard()

    // When user selects a copy strategy
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    await user.click(screen.getByRole('button', { name: 'Yes, copy data' }))
    await user.click(screen.getByRole('button', { name: 'Clear & import' }))

    // Then migration-prompted is cleared so usePostLoginMigration won't skip auto-migration
    expect(localStorage.getItem('migration-prompted')).toBeNull()
    // And the strategy is stored
    expect(localStorage.getItem('migration-strategy')).toBe('clear')
  })

  it('shows conflict dialog when user clicks Copy in the copy dialog', async () => {
    // Given cloud mode and user is NOT in a family group (copy dialog opens directly)
    localStorage.setItem('data-mode', 'cloud')
    const user = userEvent.setup()
    renderCard()

    // When user clicks "Switch..." (which opens copy dialog directly since no family group)
    await user.click(screen.getByRole('button', { name: 'Switch...' }))

    // Then the copy dialog appears
    expect(
      screen.getByRole('heading', {
        name: 'Copy your cloud data to local storage?',
      }),
    ).toBeInTheDocument()

    // When user clicks "Copy"
    await user.click(screen.getByRole('button', { name: 'Copy' }))

    // Then the conflict dialog appears (not idle)
    expect(
      screen.getByRole('heading', { name: 'Local storage already has items' }),
    ).toBeInTheDocument()
  })
})

// REWRITTEN BY CLOUD LOCATIONS PR 4b TASK 7. Two describes and 3 its lived
// here: `DataModeCard — multi-location migration warning` (2 its) pinned
// `MigrationLocationWarningDialog`'s confirm/cancel flow, and
// `DataModeCard — the warning cannot be skipped by timing` (1 it) pinned the
// three strategy buttons being disabled until `useLocations()` had resolved.
// The copy keeps every location now, so the warning stopped being true, the
// component was deleted, and the card reads no location list at all. These 2
// its pin the inverse rule.
describe('DataModeCard — a copy to cloud carries every location', () => {
  afterEach(async () => {
    localStorage.clear()
    vi.mocked(getLocations).mockReset()
    await db.locations.clear()
  })

  async function seedLocations(...names: Array<[string, string]>) {
    const now = new Date()
    await db.locations.bulkPut(
      names.map(([id, name], order) => ({
        id,
        name,
        order,
        isDefault: id === 'local',
        createdAt: now,
        updatedAt: now,
      })),
    )
  }

  async function chooseCopyStrategy(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    await user.click(screen.getByRole('button', { name: 'Yes, copy data' }))
    await user.click(screen.getByRole('button', { name: 'Skip conflicts' }))
  }

  it('user with several locations is not asked which one to copy', async () => {
    // Given three locations with 'office' active — the case that used to warn
    await seedLocations(
      ['local', 'My Home'],
      ['office', 'Office'],
      ['shed', 'Shed'],
    )
    localStorage.setItem(activeLocationStorageKey('local'), 'office')
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })
    const user = userEvent.setup()
    renderCard()
    await screen.findByRole('button', { name: 'Switch...' })

    // When the user picks a copy strategy
    await chooseCopyStrategy(user)

    // Then the switch happens on that one press — no extra confirmation
    expect(localStorage.getItem('migration-strategy')).toBe('skip')
    expect(localStorage.getItem('data-mode')).toBe('cloud')
    expect(reloadMock).toHaveBeenCalledOnce()
    // NEGATIVE CONTROL (deleting a component cannot make its heading appear)
    expect(
      screen.queryByRole('heading', { name: /will be copied/ }),
    ).not.toBeInTheDocument()
  })

  it('user can start the copy before the location list has loaded', async () => {
    // Given the location query never resolves. The card used to disable all
    // three strategy buttons until it did, so it could tell a single-location
    // pantry from a multi-location one. It no longer needs to know.
    vi.mocked(getLocations).mockReturnValue(new Promise(() => {}))
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })
    const user = userEvent.setup()
    renderCard()

    // When the user clicks through to a copy strategy
    await chooseCopyStrategy(user)

    // Then the switch happens anyway
    expect(localStorage.getItem('migration-strategy')).toBe('skip')
    expect(localStorage.getItem('data-mode')).toBe('cloud')
    expect(reloadMock).toHaveBeenCalledOnce()
  })
})

// `activeLocationId` is where a PRE-v15 payload's inline stock would go. It
// must be a LOCAL location id: after the reload the app is in local mode, and
// the provider reads the `active-location-id:local` slot — stock written under
// the cloud active id (a cuid) belongs to no location the local pantry can
// show (PR D review I-4). A cloud export has carried `itemStocks` since PR 4b,
// so for the copy this is only a safety net; `homeLocationId` (below) is what
// places a cloud payload.
describe('DataModeCard — cloud to local copy lands in the local active location', () => {
  afterEach(async () => {
    localStorage.clear()
    vi.mocked(importLocalData).mockClear()
    await db.locations.clear()
  })

  // A cloud Location id is a server-generated cuid — it can never name a row in
  // the LOCAL `locations` table.
  const CLOUD_LOCATION_ID = 'clx7k2p9a0001qwer5678efgh'

  function stubReload() {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: vi.fn() },
      writable: true,
    })
  }

  async function seedLocations() {
    const now = new Date()
    await db.locations.bulkPut([
      {
        id: 'local',
        name: 'My Home',
        order: 0,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'office',
        name: 'Office',
        order: 1,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      },
    ])
  }

  it('user copying their cloud data down gets it in the local location they were in', async () => {
    // Given cloud mode, whose active location is a server cuid naming no LOCAL
    // location, while the user's offline pantry was last on 'office'
    await seedLocations()
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), CLOUD_LOCATION_ID)
    localStorage.setItem(activeLocationStorageKey('local'), 'office')
    stubReload()
    const user = userEvent.setup()
    renderCard()

    // When the user copies their cloud data down
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    await user.click(screen.getByRole('button', { name: /append/i }))

    // Then the import is told to place the stock in the LOCAL 'office' — the
    // cloud cuid would write ItemStock rows under a location the local
    // database does not have, i.e. an empty pantry after the reload
    await waitFor(() => expect(importLocalData).toHaveBeenCalled())
    expect(
      callArgs(vi.mocked(importLocalData).mock, 0)[2]?.activeLocationId,
    ).toBe('office')
  })

  it('user signing out with a copy also keeps their local active location', async () => {
    // Given the same setup, taking the sign-out route instead
    await seedLocations()
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), CLOUD_LOCATION_ID)
    localStorage.setItem(activeLocationStorageKey('local'), 'office')
    stubReload()
    const user = userEvent.setup()
    renderCard()

    // When the user signs out, switches offline and copies their data
    await user.click(screen.getByRole('button', { name: 'Sign Out' }))
    await user.click(screen.getByRole('button', { name: /switch to offline/i }))
    await user.click(screen.getByRole('button', { name: /copy/i }))

    // Then the copy lands in the local 'office' too
    await waitFor(() => expect(importLocalData).toHaveBeenCalled())
    expect(
      callArgs(vi.mocked(importLocalData).mock, 0)[2]?.activeLocationId,
    ).toBe('office')
  })

  it('user whose stored local location was deleted gets the copy in their default one', async () => {
    // Given a stored local active location that no longer exists locally
    await seedLocations()
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), CLOUD_LOCATION_ID)
    localStorage.setItem(activeLocationStorageKey('local'), 'deleted-shed')
    stubReload()
    const user = userEvent.setup()
    renderCard()

    // When the user copies their cloud data down
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    await user.click(screen.getByRole('button', { name: /append/i }))

    // Then it lands in the local `isDefault` location, not the dangling id
    await waitFor(() => expect(importLocalData).toHaveBeenCalled())
    expect(
      callArgs(vi.mocked(importLocalData).mock, 0)[2]?.activeLocationId,
    ).toBe('local')
  })
})

// Households H4 task E.5 (decision T18): the cloud -> local copy puts the
// cloud ACTIVE location into local "My Home". Every other location keeps its
// id. The active location here is Garage, at order 1, so "the active one" and
// "the first by order" (the old rule, decision O4) are different locations.
describe('DataModeCard — cloud to local copy puts the cloud active location into My Home', () => {
  const HOME = 'clx_home_cuid'
  const GARAGE = 'clx_garage_cuid'

  afterEach(async () => {
    localStorage.clear()
    vi.mocked(importLocalData).mockReset()
    vi.mocked(importLocalData).mockImplementation(async () => {})
    vi.mocked(fetchCloudPayload).mockReset()
    vi.mocked(fetchCloudPayload).mockImplementation(async () => CLOUD_PAYLOAD)
    await db.transaction(
      'rw',
      [db.locations, db.items, db.itemStocks],
      async () => {
        await db.locations.clear()
        await db.items.clear()
        await db.itemStocks.clear()
      },
    )
  })

  function stubReload() {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: vi.fn() },
      writable: true,
    })
  }

  // A cloud export since households task 3.12: `locations` and `itemStocks`,
  // and no `isDefault` key on any location row.
  function cloudPayload() {
    const now = new Date().toISOString()
    const location = (id: string, name: string, order: number) => ({
      id,
      name,
      order,
      createdAt: now,
      updatedAt: now,
    })
    const stock = (id: string, locationId: string) => ({
      id,
      itemId: 'item-1',
      locationId,
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      createdAt: now,
      updatedAt: now,
    })
    return {
      ...CLOUD_PAYLOAD,
      items: [
        {
          id: 'item-1',
          name: 'Milk',
          tagIds: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
      locations: [location(HOME, 'Home', 0), location(GARAGE, 'Garage', 1)],
      itemStocks: [stock('stock-home', HOME), stock('stock-garage', GARAGE)],
    }
  }

  async function switchAndCopy(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    await user.click(screen.getByRole('button', { name: /append/i }))
  }

  it('user copying cloud data down gets the active cloud location as My Home', async () => {
    // Given cloud mode on Garage, and the real local import
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), GARAGE)
    vi.mocked(fetchCloudPayload).mockImplementation(
      async () => cloudPayload() as unknown as ExportPayload,
    )
    const actual =
      await vi.importActual<typeof import('@/lib/importData')>(
        '@/lib/importData',
      )
    vi.mocked(importLocalData).mockImplementation(actual.importLocalData)
    stubReload()
    const user = userEvent.setup()
    renderCard()

    // When the user copies their cloud data down
    await switchAndCopy(user)

    // Then Garage's stock is on 'local', and Home keeps its own id
    await waitFor(async () =>
      expect((await db.itemStocks.get('stock-garage'))?.locationId).toBe(
        'local',
      ),
    )
    expect(await db.locations.get('local')).toMatchObject({ name: 'Garage' })
    expect((await db.itemStocks.get('stock-home'))?.locationId).toBe(HOME)
  })

  it('user signing out with a copy also gets the active cloud location as My Home', async () => {
    // Given cloud mode on Garage
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), GARAGE)
    stubReload()
    const user = userEvent.setup()
    renderCard()

    // When the user signs out, switches offline and copies their data
    await user.click(screen.getByRole('button', { name: 'Sign Out' }))
    await user.click(screen.getByRole('button', { name: /switch to offline/i }))
    await user.click(screen.getByRole('button', { name: /copy/i }))

    // Then the copy is told to put Garage into My Home
    await waitFor(() => expect(importLocalData).toHaveBeenCalled())
    expect(
      callArgs(vi.mocked(importLocalData).mock, 0)[2]?.homeLocationId,
    ).toBe(GARAGE)
  })
})

// Issue #405: every question of a data mode switch can be backed out of, in
// both directions. Cancel and Escape close the question with nothing copied
// and the mode unchanged. A second question's Cancel goes back one step.
//
// The fixture can tell "nothing happened" from a choice: every choice either
// writes `data-mode` (Start Fresh, Switch without copying, a strategy), calls
// `fetchCloudPayload` / `importLocalData` (Copy and a conflict choice), or
// calls `reload`. Each test checks all of them.
describe('DataModeCard — backing out of a switch', () => {
  let reloadMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })
    vi.mocked(importLocalData).mockClear()
    vi.mocked(fetchCloudPayload).mockClear()
  })

  afterEach(async () => {
    localStorage.clear()
    await db.locations.clear()
  })

  // Nothing was chosen: the mode is what it was, no copy ran, no reload.
  function expectNothingChanged(mode: 'cloud' | null) {
    expect(localStorage.getItem('data-mode')).toBe(mode)
    expect(localStorage.getItem('migration-strategy')).toBeNull()
    expect(localStorage.getItem('migration-prompted')).toBeNull()
    expect(fetchCloudPayload).not.toHaveBeenCalled()
    expect(importLocalData).not.toHaveBeenCalled()
    expect(reloadMock).not.toHaveBeenCalled()
  }

  const COPY_DOWN_TITLE = 'Copy your cloud data to local storage?'
  const CONFLICT_TITLE = 'Local storage already has items'
  const COPY_UP_TITLE = 'Copy local data to cloud?'

  // ── cloud → local ──────────────────────────────────────────────────────────

  it('user can cancel the question about copying cloud data to this device', async () => {
    // Given cloud mode, with the copy question open
    localStorage.setItem('data-mode', 'cloud')
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    expect(
      screen.getByRole('heading', { name: COPY_DOWN_TITLE }),
    ).toBeInTheDocument()

    // When the user clicks Cancel
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    // Then the question closes, and the app stays in cloud mode with
    // nothing copied
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expectNothingChanged('cloud')
    expect(screen.getByText('Cloud Mode')).toBeInTheDocument()
  })

  it('user can close the question about copying cloud data with Escape', async () => {
    // Given cloud mode, with the copy question open
    localStorage.setItem('data-mode', 'cloud')
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    expect(
      screen.getByRole('heading', { name: COPY_DOWN_TITLE }),
    ).toBeInTheDocument()

    // When the user presses Escape
    await user.keyboard('{Escape}')

    // Then it is the same as Cancel
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expectNothingChanged('cloud')
  })

  it('user who presses Enter right after the copy question opens does not switch', async () => {
    // Given cloud mode
    localStorage.setItem('data-mode', 'cloud')
    const user = userEvent.setup()
    renderCard()

    // When the copy question opens, focus is on Cancel
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()

    // And the user presses Enter
    await user.keyboard('{Enter}')

    // Then nothing is chosen. (Before issue #405 the focus was on Start
    // Fresh, so Enter switched to local mode.)
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expectNothingChanged('cloud')
  })

  it('user can still start fresh in local mode without a copy', async () => {
    // Given cloud mode, with the copy question open
    localStorage.setItem('data-mode', 'cloud')
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Switch...' }))

    // When the user clicks Start Fresh
    await user.click(screen.getByRole('button', { name: 'Start Fresh' }))

    // Then the app switches to local mode with nothing copied
    expect(localStorage.getItem('data-mode')).toBe('local')
    expect(reloadMock).toHaveBeenCalledOnce()
    expect(fetchCloudPayload).not.toHaveBeenCalled()
    expect(importLocalData).not.toHaveBeenCalled()
  })

  it('user can go back from the conflict question to the copy question', async () => {
    // Given cloud mode, with the conflict question open
    localStorage.setItem('data-mode', 'cloud')
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(
      screen.getByRole('heading', { name: CONFLICT_TITLE }),
    ).toBeInTheDocument()

    // When the user clicks Cancel
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    // Then the copy question shows again, and nothing was copied
    expect(
      await screen.findByRole('heading', { name: COPY_DOWN_TITLE }),
    ).toBeInTheDocument()
    expectNothingChanged('cloud')
  })

  it('user who presses Escape on the conflict question goes back to the copy question', async () => {
    // Given cloud mode, with the conflict question open
    localStorage.setItem('data-mode', 'cloud')
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()

    // When the user presses Escape
    await user.keyboard('{Escape}')

    // Then it is the same as Cancel
    expect(
      await screen.findByRole('heading', { name: COPY_DOWN_TITLE }),
    ).toBeInTheDocument()
    expectNothingChanged('cloud')
  })

  // ── local → cloud ──────────────────────────────────────────────────────────

  it('user can close the switch-to-cloud question with Escape', async () => {
    // Given local mode, with the first question open
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    expect(
      screen.getByRole('heading', { name: 'Switch to cloud mode?' }),
    ).toBeInTheDocument()

    // When the user presses Escape
    await user.keyboard('{Escape}')

    // Then it closes, and the app stays in local mode
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expectNothingChanged(null)
  })

  it('user can cancel the question about copying local data to the cloud', async () => {
    // Given local mode, with the copy question open
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    expect(
      screen.getByRole('heading', { name: COPY_UP_TITLE }),
    ).toBeInTheDocument()

    // When the user clicks Cancel
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    // Then it closes, and the app stays in local mode
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expectNothingChanged(null)
  })

  it('user can close the question about copying local data with Escape', async () => {
    // Given local mode, with the copy question open
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    expect(
      screen.getByRole('heading', { name: COPY_UP_TITLE }),
    ).toBeInTheDocument()

    // When the user presses Escape
    await user.keyboard('{Escape}')

    // Then it is the same as Cancel
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expectNothingChanged(null)
  })

  it('user who presses Enter right after the local copy question opens does not switch', async () => {
    // Given local mode
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Switch...' }))

    // When the copy question opens, focus is on Cancel
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()

    // And the user presses Enter
    await user.keyboard('{Enter}')

    // Then nothing is chosen. (Before issue #405 the focus was on "Switch
    // without copying", so Enter switched to cloud mode.)
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expectNothingChanged(null)
  })

  it('user who presses Escape on the conflict strategy question goes back to the copy question', async () => {
    // Given local mode, with the strategy question open
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    await user.click(screen.getByRole('button', { name: 'Yes, copy data' }))
    expect(
      screen.getByRole('heading', { name: 'How to handle conflicts?' }),
    ).toBeInTheDocument()

    // When the user presses Escape
    await user.keyboard('{Escape}')

    // Then it is the same as its Cancel: back to the copy question
    expect(
      await screen.findByRole('heading', { name: COPY_UP_TITLE }),
    ).toBeInTheDocument()
    expectNothingChanged(null)
  })
})
