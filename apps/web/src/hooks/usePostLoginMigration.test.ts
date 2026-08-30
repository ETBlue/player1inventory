import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapCarts, getAllItems, getLocations } from '@/db/operations'
import { fetchLocalPayload } from '@/lib/exportData'
import { importCloudData } from '@/lib/importData'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
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
// getAllItems drives the prompting path, getLocations backs useLocations' LOCAL
// branch. Every test below that sets `data-mode: 'cloud'` must seed the CLOUD
// list instead — see `mockCloudLocations` — because as of PR 2 useLocations is
// dual-mode and no longer reads Dexie in cloud mode.
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

// `useLocations` is dual-mode: in cloud mode the list the ActiveLocationProvider
// validates the stored active id against comes from GetLocations, not Dexie.
// This per-file factory REPLACES the one in `src/test/setup.ts`, so the other
// location hooks are stubbed here too.
const mockGetLocationsQuery = vi.fn(() => ({
  data: undefined as { locations: unknown[] } | undefined,
  loading: false,
  error: undefined,
}))

function mockCloudLocations(
  rows: { id: string; name: string; order: number; isDefault: boolean }[],
) {
  mockGetLocationsQuery.mockReturnValue({
    data: {
      locations: rows.map((r) => ({
        __typename: 'Location',
        ...r,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
    },
    loading: false,
    error: undefined,
  })
}

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  const mutationStub = () => [
    vi.fn().mockResolvedValue({ data: undefined }),
    {},
  ]
  return {
    ...original,
    useGetLocationsQuery: () => mockGetLocationsQuery(),
    useCreateLocationMutation: mutationStub,
    useUpdateLocationMutation: mutationStub,
    useDeleteLocationMutation: mutationStub,
    useReorderLocationsMutation: mutationStub,
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

// The hook reads the location list (useLocations) so it never copies by a
// location id the provider is about to correct — that needs a QueryClient, and
// the real app always has one (mounted in __root.tsx).
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

// `vi.resetAllMocks()` below strips the factory implementations, so re-arm the
// Dexie reads the provider and hook depend on before every test.
beforeEach(() => {
  vi.mocked(getAllItems).mockResolvedValue([])
  vi.mocked(getLocations).mockResolvedValue([])
  vi.mocked(bootstrapCarts).mockResolvedValue(undefined)
  mockGetLocationsQuery.mockReturnValue({
    data: undefined,
    loading: false,
    error: undefined,
  })
})

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
    const { result } = renderHook(() => usePostLoginMigration(), { wrapper })

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
    const { result } = renderHook(() => usePostLoginMigration(), { wrapper })

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

// The CLOUD location list is server-generated: every id is a cuid. That is the
// whole reason this hook cannot use `useActiveLocation().activeLocationId` as
// the copy target — the payload it is flattening comes from the LOCAL Dexie
// database, whose ids the cloud list never contains.
const CLOUD_HOME_ID = 'clx7k2p9a0000qwer1234abcd'
const CLOUD_OFFICE_ID = 'clx7k2p9a0001qwer5678efgh'

describe('usePostLoginMigration — the LOCAL active location is what gets migrated', () => {
  // Cloud has no per-location ItemStock, so the copy sends the stock of ONE
  // location out of the local payload. That id must therefore be a local one:
  // flattening a local payload by the cloud active id matches no ItemStock row
  // at all, so every item uploads zeroed and every cart is dropped.
  function seedCloudLocations() {
    // afterEach resets every mock, so re-arm the ones the hook reads. These
    // tests run in cloud mode, so the list comes from GetLocations.
    vi.mocked(getAllItems).mockResolvedValue([])
    mockCloudLocations([
      { id: CLOUD_HOME_ID, name: 'My Home', order: 0, isDefault: true },
      { id: CLOUD_OFFICE_ID, name: 'Office', order: 1, isDefault: false },
    ])
  }

  it('user auto-importing after sign-in copies the local active location stock', async () => {
    // Given the user was last in the LOCAL 'office' pantry and chose a copy
    // strategy, and cloud mode's own active location is a server cuid
    seedCloudLocations()
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), CLOUD_OFFICE_ID)
    localStorage.setItem(activeLocationStorageKey('local'), 'office')
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'skip')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockResolvedValue(undefined)

    // When the hook mounts and runs the auto-import
    const { result } = renderHook(() => usePostLoginMigration(), { wrapper })
    await waitFor(() => expect(result.current.state).toBe('done'))

    // Then the local office stock is what gets copied — not the cloud cuid,
    // which names no row in the payload being flattened
    expect(mockImportCloudData).toHaveBeenCalledWith(
      emptyPayload,
      'skip',
      expect.anything(),
      expect.objectContaining({ locationId: 'office' }),
    )
  })

  it('user confirming the prompt copies the local active location stock', async () => {
    // Given the user is prompted after signing in, with LOCAL 'office' active
    seedCloudLocations()
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), CLOUD_OFFICE_ID)
    localStorage.setItem(activeLocationStorageKey('local'), 'office')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockResolvedValue(undefined)

    const { result } = renderHook(() => usePostLoginMigration(), { wrapper })

    // When the user confirms the import
    await result.current.importData('append')

    // Then the local office stock is what gets copied
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
  it('a location reset mid-migration does not start a second copy', async () => {
    // Given a stored CLOUD active location that no longer exists
    vi.mocked(getAllItems).mockResolvedValue([])
    mockCloudLocations([
      { id: CLOUD_HOME_ID, name: 'My Home', order: 0, isDefault: true },
    ])
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), 'ghost')
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'skip')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    // And an import that is still in flight (so nothing has marked it done)
    mockImportCloudData.mockReturnValue(new Promise(() => {}))

    // When the hook mounts and the provider resets the stale location
    renderHook(() => usePostLoginMigration(), { wrapper })
    await waitFor(() =>
      expect(localStorage.getItem(activeLocationStorageKey('cloud'))).toBe(
        CLOUD_HOME_ID,
      ),
    )

    // Then the pantry is copied up exactly once — a second copy would run the
    // stored strategy again over the rows the first one just created
    expect(mockImportCloudData).toHaveBeenCalledTimes(1)
  })

  // The one-shot ref makes the FIRST call the only call, so that call must
  // already carry the right location. The provider correcting the CLOUD active
  // id mid-flight must not change it: the copy target comes from the local
  // slot, and re-entering to "fix" it would run the strategy a second time.
  it('a stale cloud location does not change which local location is copied', async () => {
    // Given a stored CLOUD active location that no longer exists, while the
    // user's LOCAL pantry was last on 'office'
    vi.mocked(getAllItems).mockResolvedValue([])
    mockCloudLocations([
      { id: CLOUD_HOME_ID, name: 'My Home', order: 0, isDefault: true },
    ])
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), 'ghost')
    localStorage.setItem(activeLocationStorageKey('local'), 'office')
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'skip')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockResolvedValue(undefined)

    // When the hook mounts
    const { result } = renderHook(() => usePostLoginMigration(), { wrapper })
    await waitFor(() => expect(result.current.state).toBe('done'))

    // Then the copy runs against the local location, exactly once
    expect(mockImportCloudData).toHaveBeenCalledTimes(1)
    expect(mockImportCloudData).toHaveBeenCalledWith(
      emptyPayload,
      'skip',
      expect.anything(),
      expect.objectContaining({ locationId: 'office' }),
    )
  })
})
