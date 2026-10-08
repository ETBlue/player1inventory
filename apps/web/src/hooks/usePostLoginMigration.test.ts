import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
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
    // `ActiveLocationProvider` calls this on every render (Rules of Hooks).
    useBootstrapCartsMutation: mutationStub,
  }
})

// The hook takes auth as an argument now — it no longer calls Clerk's
// `useAuth()` itself. `PostLoginMigrationDialog` is where the Clerk/E2E split
// lives, so every test here passes a signed-in session directly.
const SIGNED_IN = { isLoaded: true, isSignedIn: true }

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
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })

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
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })

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

// The CLOUD location list is server-generated: every id is a cuid. The local
// list uses the `'local'` sentinel plus whatever `createLocation` minted, so a
// test cannot confuse the two lists.
const CLOUD_HOME_ID = 'clx7k2p9a0000qwer1234abcd'
const CLOUD_OFFICE_ID = 'clx7k2p9a0001qwer5678efgh'

// REWRITTEN BY CLOUD LOCATIONS PR 4b TASK 7. This describe used to be
// `usePostLoginMigration — the LOCAL active location is what gets migrated`
// and held 2 its asserting `importCloudData` was called with
// `{ locationId: 'office' }` — the one local location whose stock went up,
// because the cloud import surface was flat. The remap rule keeps every
// location now, so the option is gone and the two its with it. What replaces
// them is the inverse rule: the copy names NO location.
describe('usePostLoginMigration — the auth argument gates everything', () => {
  // The hook no longer reads Clerk. If the argument were ignored, a signed-out
  // session would start a copy.
  it('no copy and no prompt while the session is not signed in', async () => {
    // Given a stored strategy and a resolved location list, but a session that
    // Clerk has loaded and reports as signed out
    vi.mocked(getAllItems).mockResolvedValue([])
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockResolvedValue(undefined)

    // When the hook mounts with that session
    const { result } = renderHook(
      () => usePostLoginMigration({ isLoaded: true, isSignedIn: false }),
      { wrapper },
    )

    // Then nothing is copied and the strategy key survives for the next sign-in
    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(mockImportCloudData).not.toHaveBeenCalled()
    expect(localStorage.getItem(MIGRATION_STRATEGY_KEY)).toBe('clear')
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBeNull()
  })

  it('no copy while Clerk has not loaded yet', async () => {
    // Given the same stored strategy, with Clerk still loading
    vi.mocked(getAllItems).mockResolvedValue([])
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockResolvedValue(undefined)

    // When the hook mounts
    const { result } = renderHook(
      () => usePostLoginMigration({ isLoaded: false, isSignedIn: false }),
      { wrapper },
    )

    // Then nothing is copied
    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(mockImportCloudData).not.toHaveBeenCalled()
    expect(localStorage.getItem(MIGRATION_STRATEGY_KEY)).toBe('clear')
  })
})

describe('usePostLoginMigration — the copy names no location', () => {
  function seedCloudLocations() {
    // afterEach resets every mock, so re-arm the ones the hook reads. These
    // tests run in cloud mode, so the list comes from GetLocations.
    vi.mocked(getAllItems).mockResolvedValue([])
    mockCloudLocations([
      { id: CLOUD_HOME_ID, name: 'My Home', order: 0, isDefault: true },
      { id: CLOUD_OFFICE_ID, name: 'Office', order: 1, isDefault: false },
    ])
  }

  it('user auto-importing after sign-in sends the whole pantry, not one location', async () => {
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
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })
    await waitFor(() => expect(result.current.state).toBe('done'))

    // Then no location is named: neither the local slot nor the cloud cuid is
    // passed, so `importCloudData` carries every location through the remap
    const call = mockImportCloudData.mock.calls[0]
    expect(call[0]).toBe(emptyPayload)
    expect(call[1]).toBe('skip')
    expect(call[3]).toBeUndefined()
  })

  it('user confirming the prompt sends the whole pantry, not one location', async () => {
    // Given the user is prompted after signing in, with LOCAL 'office' active
    seedCloudLocations()
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), CLOUD_OFFICE_ID)
    localStorage.setItem(activeLocationStorageKey('local'), 'office')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockResolvedValue(undefined)

    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })

    // When the user confirms the import
    await result.current.importData('append')

    // Then the copy ran, with no location named
    const call = mockImportCloudData.mock.calls[0]
    expect(call[0]).toBe(emptyPayload)
    expect(call[1]).toBe('skip')
    expect(call[3]).toBeUndefined()
  })
})

describe('usePostLoginMigration — the auto-import waits for the location list', () => {
  // The copy is one-shot and destructive on the cloud side, and the `clear`
  // strategy deletes every Location row before the remap re-reads them. So it
  // must not start while this hook's own GetLocations is still in flight.
  it('no copy starts while the location list is unresolved', async () => {
    // Given cloud mode and a GetLocations query that has not resolved —
    // `useLocations` reports `data: undefined`
    vi.mocked(getAllItems).mockResolvedValue([])
    mockGetLocationsQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    })
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockResolvedValue(undefined)

    // When the hook mounts
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })

    // Then nothing is copied and the strategy key is still there to retry with
    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(mockImportCloudData).not.toHaveBeenCalled()
    expect(localStorage.getItem(MIGRATION_STRATEGY_KEY)).toBe('clear')
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBeNull()
  })

  it('the copy starts once the location list resolves', async () => {
    // Given the same unresolved list
    vi.mocked(getAllItems).mockResolvedValue([])
    mockGetLocationsQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    })
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockResolvedValue(undefined)
    const { result, rerender } = renderHook(
      () => usePostLoginMigration(SIGNED_IN),
      {
        wrapper,
      },
    )
    expect(mockImportCloudData).not.toHaveBeenCalled()

    // When GetLocations answers
    mockCloudLocations([
      { id: CLOUD_HOME_ID, name: 'My Home', order: 0, isDefault: true },
    ])
    rerender()

    // Then the copy runs
    await waitFor(() => expect(result.current.state).toBe('done'))
    expect(mockImportCloudData).toHaveBeenCalledTimes(1)
  })
})

describe('usePostLoginMigration — the auto-import runs once', () => {
  // `locationsLoaded` is in the effect's dep array and is a BOOLEAN, so a
  // location being added or renamed does NOT re-fire the effect. The trigger
  // that does is the list becoming unknown again and then known: `data` goes
  // undefined → defined, so the boolean goes true → false → true.
  //
  // That is not hypothetical. `importCloudData` calls `client.resetStore()`
  // itself at the end of the `clear` path (`importData.ts`), which empties the
  // Apollo cache and refetches every active query — including the
  // `GetLocations` behind `useLocations`. During that refetch `cloud.data` is
  // undefined. MIGRATION_PROMPTED_KEY is written only after `importCloudData`
  // RESOLVES, so the window is open while the copy is still running: without
  // the one-shot ref the effect re-enters and starts a second `clear` import
  // over the rows the first one just wrote.
  it('the location list going unknown and back mid-migration does not start a second copy', async () => {
    // Given cloud mode with a resolved location list, the `clear` strategy
    // stored, and a copy that is still in flight
    vi.mocked(getAllItems).mockResolvedValue([])
    mockCloudLocations([
      { id: CLOUD_HOME_ID, name: 'My Home', order: 0, isDefault: true },
    ])
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), CLOUD_HOME_ID)
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockReturnValue(new Promise(() => {}))
    const { rerender } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })
    await waitFor(() => expect(mockImportCloudData).toHaveBeenCalledTimes(1))

    // When the cache is reset mid-flight — GetLocations has no data, then has
    // it again
    mockGetLocationsQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    })
    rerender()
    mockCloudLocations([
      { id: CLOUD_HOME_ID, name: 'My Home', order: 0, isDefault: true },
    ])
    rerender()
    // A second copy would be dispatched from a microtask — `fetchLocalPayload`
    // resolves before `importCloudData` is reached — so let the queue drain.
    // Asserting straight after `rerender()` passes even with the one-shot ref
    // deleted, because the second call has not happened YET.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Then the pantry is copied up exactly once — and MIGRATION_PROMPTED_KEY
    // has not been written yet, so nothing else was blocking a second copy
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBeNull()
    expect(mockImportCloudData).toHaveBeenCalledTimes(1)
  })

  // NEGATIVE CONTROL, named as one. The provider rewrites a stale CLOUD active
  // id to the default once `useLocations()` resolves, and this test asserts
  // that does not start a second copy. It STAYS GREEN with the one-shot ref
  // deleted, because `activeLocationId` is no longer in the effect's dep array
  // at all — PR 4b task 7 removed it. Kept because the provider's rewrite is
  // real and a future dep-array edit could put it back in scope; it is not
  // evidence that the one-shot works. The test above is.
  it('a stale cloud location reset does not start a second copy', async () => {
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
    renderHook(() => usePostLoginMigration(SIGNED_IN), { wrapper })
    await waitFor(() =>
      expect(localStorage.getItem(activeLocationStorageKey('cloud'))).toBe(
        CLOUD_HOME_ID,
      ),
    )

    // Then the pantry is copied up exactly once
    expect(mockImportCloudData).toHaveBeenCalledTimes(1)
  })
})
