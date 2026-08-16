import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAllItems, getLocations } from '@/db/operations'
import { fetchLocalPayload } from '@/lib/exportData'
import { importCloudData } from '@/lib/importData'
import {
  ACTIVE_LOCATION_STORAGE_KEY,
  ActiveLocationProvider,
} from './useActiveLocation'
import {
  MIGRATION_PROMPTED_KEY,
  MIGRATION_STRATEGY_KEY,
  usePostLoginMigration,
} from './usePostLoginMigration'

// Mock fetchLocalPayload — controlled per test
vi.mock('@/lib/exportData', () => ({
  fetchLocalPayload: vi.fn(),
}))

// Mock importCloudData — controlled per test
vi.mock('@/lib/importData', () => ({
  importCloudData: vi.fn(),
}))

// Mock the Dexie operations the hook (and ActiveLocationProvider) reach for:
// getAllItems drives the prompting path, getLocations backs useLocations.
vi.mock('@/db/operations', () => ({
  getAllItems: vi.fn().mockResolvedValue([]),
  getLocations: vi.fn().mockResolvedValue([]),
  bootstrapCarts: vi.fn().mockResolvedValue(undefined),
}))

// Provide a stable apolloClient object to prevent useEffect from re-firing on
// every render. The global setup.ts mock returns a new object on each call,
// which would cause the effect to re-run when React re-renders due to setState.
const stableApolloClient = {
  cache: { evict: vi.fn(), gc: vi.fn() },
  query: vi.fn().mockResolvedValue({ data: {} }),
  mutate: vi.fn().mockResolvedValue({ data: {} }),
  resetStore: vi.fn().mockResolvedValue(null),
}
vi.mock('@apollo/client/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@apollo/client/react')>()
  return {
    ...original,
    useApolloClient: vi.fn(() => stableApolloClient),
  }
})

const mockFetchLocalPayload = vi.mocked(fetchLocalPayload)
const mockImportCloudData = vi.mocked(importCloudData)

const emptyPayload = {
  version: 1 as const,
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

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.resetAllMocks()
})

describe('usePostLoginMigration — auto-import path', () => {
  it('transitions to done even when importCloudData rejects', async () => {
    // Given: MIGRATION_STRATEGY_KEY is set to 'clear'
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')

    // And: fetchLocalPayload resolves and importCloudData rejects with an error
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockImplementation(() =>
      Promise.reject(new Error('resetStore failed: GraphQL error')),
    )

    // When: the hook mounts
    const { result } = renderHook(() => usePostLoginMigration())

    // Then: state transitions to 'done' (dialog closes) rather than staying 'auto-importing'
    await waitFor(() => {
      expect(result.current.state).toBe('done')
    })

    // And: MIGRATION_STRATEGY_KEY is removed so the failed import doesn't loop
    expect(localStorage.getItem(MIGRATION_STRATEGY_KEY)).toBeNull()

    // And: MIGRATION_PROMPTED_KEY is NOT set — we preserve the ability to retry
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBeNull()
  })

  it('transitions to done and sets prompted key when importCloudData succeeds', async () => {
    // Given: MIGRATION_STRATEGY_KEY is set to 'clear'
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')

    // And: both fetchLocalPayload and importCloudData resolve successfully
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockResolvedValue(undefined)

    // When: the hook mounts
    const { result } = renderHook(() => usePostLoginMigration())

    // Then: state transitions to 'done'
    await waitFor(() => {
      expect(result.current.state).toBe('done')
    })

    // And: MIGRATION_PROMPTED_KEY is set (won't prompt again)
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBe('1')

    // And: MIGRATION_STRATEGY_KEY is removed
    expect(localStorage.getItem(MIGRATION_STRATEGY_KEY)).toBeNull()
  })
})

describe('usePostLoginMigration — active location is what gets migrated', () => {
  // Cloud has no per-location ItemStock, so the copy sends the stock of the
  // location that is active at migration time. The hook must thread that id
  // down to importCloudData — otherwise the copy silently falls back to
  // 'local' and a user whose active location is elsewhere migrates the wrong
  // (or zeroed) quantities.
  function wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ActiveLocationProvider, null, children),
    )
  }

  function seedTwoLocations() {
    const now = new Date()
    // afterEach resets every mock, so re-arm the ones the hook reads.
    vi.mocked(getAllItems).mockResolvedValue([])
    vi.mocked(getLocations).mockResolvedValue([
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

  it('auto-import sends the active location id to importCloudData', async () => {
    // Given the user last worked in 'office' and chose a copy strategy
    seedTwoLocations()
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, 'office')
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'skip')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockResolvedValue(undefined)

    // When the hook mounts and runs the auto-import
    const { result } = renderHook(() => usePostLoginMigration(), { wrapper })
    await waitFor(() => expect(result.current.state).toBe('done'))

    // Then the office stock is what gets copied
    expect(mockImportCloudData).toHaveBeenCalledWith(
      emptyPayload,
      'skip',
      expect.anything(),
      expect.objectContaining({ locationId: 'office' }),
    )
  })

  it('manual import sends the active location id to importCloudData', async () => {
    // Given the user is prompted after signing in, with 'office' active
    seedTwoLocations()
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, 'office')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockResolvedValue(undefined)

    const { result } = renderHook(() => usePostLoginMigration(), { wrapper })

    // When the user confirms the import
    await result.current.importData('append')

    // Then the office stock is what gets copied
    expect(mockImportCloudData).toHaveBeenCalledWith(
      emptyPayload,
      'skip',
      expect.anything(),
      expect.objectContaining({ locationId: 'office' }),
    )
  })
})

describe('usePostLoginMigration — the auto-import runs once', () => {
  // `activeLocationId` is in the effect's dep array, and MIGRATION_PROMPTED_KEY
  // is only written after the import resolves — so a location change landing
  // mid-flight would re-enter the effect and fire a second copy. There is a
  // concrete trigger: ActiveLocationProvider resets a stale stored id to the
  // default once useLocations() resolves, which is asynchronous.
  function wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ActiveLocationProvider, null, children),
    )
  }

  it('a location reset mid-migration does not start a second copy', async () => {
    // Given a stored active location that no longer exists
    const now = new Date()
    vi.mocked(getAllItems).mockResolvedValue([])
    vi.mocked(getLocations).mockResolvedValue([
      {
        id: 'local',
        name: 'My Home',
        order: 0,
        createdAt: now,
        updatedAt: now,
      },
    ])
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, 'ghost')
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'skip')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    // And an import that is still in flight (so nothing has marked it done)
    mockImportCloudData.mockReturnValue(new Promise(() => {}))

    // When the hook mounts and the provider resets the stale location
    renderHook(() => usePostLoginMigration(), { wrapper })
    await waitFor(() =>
      expect(localStorage.getItem(ACTIVE_LOCATION_STORAGE_KEY)).toBe('local'),
    )

    // Then the pantry is copied up exactly once — a second copy would run the
    // stored strategy again over the rows the first one just created
    expect(mockImportCloudData).toHaveBeenCalledTimes(1)
  })
})
