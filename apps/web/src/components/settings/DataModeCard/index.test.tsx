import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { getLocations } from '@/db/operations'
import {
  ACTIVE_LOCATION_STORAGE_KEY,
  ActiveLocationProvider,
} from '@/hooks/useActiveLocation'
import { importLocalData } from '@/lib/importData'
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

describe('DataModeCard — multi-location migration warning', () => {
  // Cloud has no per-location ItemStock (deferred in PR D). Copying a local
  // pantry up therefore sends only the active location's stock, and the stock
  // of every other location is silently left behind — so warn first.
  afterEach(async () => {
    localStorage.clear()
    await db.locations.clear()
  })

  async function seedLocations(...names: Array<[string, string]>) {
    const now = new Date()
    await db.locations.bulkPut(
      names.map(([id, name], order) => ({
        id,
        name,
        order,
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

  it('user with several locations is warned which one gets copied', async () => {
    // Given three locations with 'office' active
    await seedLocations(
      ['local', 'My Home'],
      ['office', 'Office'],
      ['shed', 'Shed'],
    )
    localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, 'office')
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

    // Then the warning names the location being copied and the ones left behind
    expect(
      await screen.findByRole('heading', {
        name: 'Only Office will be copied',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/My Home/)).toBeInTheDocument()
    expect(screen.getByText(/Shed/)).toBeInTheDocument()

    // And nothing is migrated until the user confirms
    expect(localStorage.getItem('migration-strategy')).toBeNull()
    expect(reloadMock).not.toHaveBeenCalled()

    // When the user confirms
    await user.click(screen.getByRole('button', { name: 'Copy anyway' }))

    // Then the copy proceeds with the chosen strategy
    expect(localStorage.getItem('migration-strategy')).toBe('skip')
    expect(localStorage.getItem('data-mode')).toBe('cloud')
    expect(reloadMock).toHaveBeenCalledOnce()
  })

  it('user with a single location is not warned', async () => {
    // Given only the default location
    await seedLocations(['local', 'My Home'])
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

    // Then no warning interrupts the common case — the copy starts immediately
    expect(
      screen.queryByRole('heading', { name: /will be copied/ }),
    ).not.toBeInTheDocument()
    expect(localStorage.getItem('migration-strategy')).toBe('skip')
    expect(reloadMock).toHaveBeenCalledOnce()
  })
})

describe('DataModeCard — the warning cannot be skipped by timing', () => {
  // `useLocations()` resolves asynchronously. Treating a not-yet-loaded list as
  // "one location" would let a fast-clicking multi-location user start the copy
  // with no warning at all, which is the unsafe default.
  afterEach(async () => {
    localStorage.clear()
    vi.mocked(getLocations).mockReset()
    await db.locations.clear()
  })

  it('user cannot start the copy while the location list is still loading', async () => {
    // Given the location query has not resolved yet
    vi.mocked(getLocations).mockReturnValue(new Promise(() => {}))
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })
    const user = userEvent.setup()
    renderCard()

    // When the user clicks through to a copy strategy
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    await user.click(screen.getByRole('button', { name: 'Yes, copy data' }))
    await user.click(screen.getByRole('button', { name: 'Skip conflicts' }))

    // Then nothing is copied — the app cannot yet know whether to warn
    expect(localStorage.getItem('migration-strategy')).toBeNull()
    expect(localStorage.getItem('data-mode')).toBeNull()
    expect(reloadMock).not.toHaveBeenCalled()
  })
})

// Cloud has no per-location ItemStock, so a cloud payload's stock is inline and
// has to be placed somewhere on the way down. It must go to the location the
// user is ACTIVE in — the same rule the outbound copy follows. `doSwitch`
// reloads the page but does NOT reset `active-location-id`, so hard-coding the
// default location leaves the user staring at an empty pantry (PR D review I-4).
describe('DataModeCard — cloud to local copy lands in the active location', () => {
  afterEach(async () => {
    localStorage.clear()
    vi.mocked(importLocalData).mockClear()
    await db.locations.clear()
  })

  async function seedLocations() {
    const now = new Date()
    await db.locations.bulkPut([
      {
        id: 'local',
        name: 'My Home',
        order: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'office',
        name: 'Office',
        order: 1,
        createdAt: now,
        updatedAt: now,
      },
    ])
  }

  it('user copying their cloud data down gets it in the location they are in', async () => {
    // Given cloud mode with 'office' as the active location
    await seedLocations()
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, 'office')
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: vi.fn() },
      writable: true,
    })
    const user = userEvent.setup()
    renderCard()

    // When the user copies their cloud data down
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    await user.click(screen.getByRole('button', { name: /append/i }))

    // Then the import is told to place the stock in 'office'
    await waitFor(() => expect(importLocalData).toHaveBeenCalled())
    expect(vi.mocked(importLocalData).mock.calls[0][2]).toBe('office')
  })

  it('user signing out with a copy also keeps their active location', async () => {
    // Given the same setup, taking the sign-out route instead
    await seedLocations()
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, 'office')
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: vi.fn() },
      writable: true,
    })
    const user = userEvent.setup()
    renderCard()

    // When the user signs out, switches offline and copies their data
    await user.click(screen.getByRole('button', { name: 'Sign Out' }))
    await user.click(screen.getByRole('button', { name: /switch to offline/i }))
    await user.click(screen.getByRole('button', { name: /copy/i }))

    // Then the copy lands in 'office' too
    await waitFor(() => expect(importLocalData).toHaveBeenCalled())
    expect(vi.mocked(importLocalData).mock.calls[0][2]).toBe('office')
  })
})
