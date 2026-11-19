import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapCarts, getAllItems, getLocations } from '@/db/operations'
import { fetchLocalPayload } from '@/lib/exportData'
import { importCloudData } from '@/lib/importData'
import { elementAt } from '@/test/narrow'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
} from './useActiveLocation'
import {
  canCopyInto,
  isCopyPromptPausedPath,
  MIGRATION_PROMPTED_KEY,
  MIGRATION_SKIP_HOUSEHOLDS_KEY,
  MIGRATION_STRATEGY_KEY,
  type MigrationHousehold,
  skipCopyPromptIn,
  usePostLoginMigration,
} from './usePostLoginMigration'

// Mock fetchLocalPayload — controlled per test
vi.mock('@/lib/exportData', () => ({
  fetchLocalPayload: vi.fn(),
}))

// Mock importCloudData — controlled per test.
//
// Spread the real module rather than returning a bare object: the hook also
// imports `isForbiddenImportError`, and a factory that omits it hands the hook
// `undefined` and throws in the `catch` it is supposed to serve. Spreading also
// means the tests below run the REAL detector, which reads `extensions.code`,
// so a rejection has to carry a genuine `CombinedGraphQLErrors` to be reported
// as forbidden.
vi.mock('@/lib/importData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/importData')>()
  return { ...actual, importCloudData: vi.fn() }
})

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
  rows: { id: string; name: string; order: number }[],
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
//
// Since owner decision O22-A it also takes the household the stored copy would
// go into. Most tests below are not about that confirm, so they act as the
// OWNER of their household and press Copy here with `pressCopyHere`.
const OWNER_HOUSEHOLD = {
  id: 'household-own',
  name: 'Our Home',
  role: 'owner' as const,
}
const SIGNED_IN = {
  isLoaded: true,
  isSignedIn: true,
  household: OWNER_HOUSEHOLD,
}

type HookResult = { current: ReturnType<typeof usePostLoginMigration> }

// A stored strategy waits on "Copy your offline data into …?" (owner decision
// O22-A). This waits for that dialog and presses Copy here.
async function pressCopyHere(result: HookResult) {
  await waitFor(() => expect(result.current.state).toBe('confirming'))
  await act(async () => {
    result.current.confirmCopy()
  })
}

const mockFetchLocalPayload = vi.mocked(fetchLocalPayload)
const mockImportCloudData = vi.mocked(importCloudData)

// What the server sends when a payload names a row id another account holds:
// the bare word `Forbidden` with the code in `extensions`. The message is
// deliberately the same one the server sends for "that row does not exist", so
// only the code tells the two apart — see `isForbiddenImportError`.
function forbiddenError() {
  return new CombinedGraphQLErrors({
    errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
  })
}

// What a cloud import that skipped nothing resolves to.
const NOTHING_SKIPPED = { skipped: { locationNames: [], rowCount: 0 } }

// A payload that needs NO "Import into which location?" answer: it has a
// `locations` and an `itemStocks` key, and no `'local'` row. Most tests below
// are about the error states and the one-shot, not the dialog, so they use it.
// Real local data always has `'local'`; `localPayload` below is that shape,
// and the dialog tests use it (households H4 task E.4).
const emptyPayload = {
  version: 1 as const,
  exportedAt: new Date().toISOString(),
  locations: [],
  itemStocks: [],
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
  // REWRITTEN BY TASK 11 OF THE IMPORT OWNERSHIP GUARD. It used to be
  // `transitions to done even when importCloudData rejects` and asserted the
  // state was 'done'. That behaviour is the bug: the dialog closed as if the
  // copy had worked, so the user was left in a half-copied cloud account and
  // was told nothing. Both localStorage assertions below are unchanged.
  it('user sees an error when the automatic copy is refused', async () => {
    // Given a stored 'clear' strategy, and a server that refuses the copy
    // because the local data names another account's row id
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockImplementation(() =>
      Promise.reject(forbiddenError()),
    )

    // When the hook mounts, and the user presses Copy here
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })
    await pressCopyHere(result)

    // Then the state is 'error', not 'done', so the dialog can say so
    await waitFor(() => {
      expect(result.current.state).toBe('error')
    })

    // And the refusal is reported as a cross-account one, which is what picks
    // the sentence the user reads
    expect(result.current.error?.forbidden).toBe(true)

    // And: MIGRATION_STRATEGY_KEY is removed so the failed import doesn't loop
    expect(localStorage.getItem(MIGRATION_STRATEGY_KEY)).toBeNull()

    // And: MIGRATION_PROMPTED_KEY is NOT set — we preserve the ability to retry
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBeNull()
  })

  it('user sees a generic error when the automatic copy fails for another reason', async () => {
    // Given a stored strategy and a failure that is NOT a refusal
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockImplementation(() =>
      Promise.reject(new Error('resetStore failed: GraphQL error')),
    )

    // When the hook mounts, and the user presses Copy here
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })
    await pressCopyHere(result)

    // Then the state is 'error' and the message is carried through for the
    // generic sentence, with `forbidden` false — a plain Error saying anything
    // at all is not a cross-account refusal
    await waitFor(() => {
      expect(result.current.state).toBe('error')
    })
    expect(result.current.error).toEqual({
      forbidden: false,
      role: false,
      message: 'resetStore failed: GraphQL error',
    })
  })

  it('transitions to done and sets prompted key when importCloudData succeeds', async () => {
    // Given: MIGRATION_STRATEGY_KEY is set to 'clear'
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')

    // And: both fetchLocalPayload and importCloudData resolve successfully
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockResolvedValue(NOTHING_SKIPPED)

    // When: the hook mounts, and the user presses Copy here
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })
    await pressCopyHere(result)

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

describe('usePostLoginMigration — the Import button path', () => {
  // `PostLoginMigrationDialog` calls this from
  // `onClick={() => importData('append')}` and does not await it. Before the
  // try/catch a refusal was an unhandled promise rejection: nothing set a new
  // state, so the dialog sat on 'importing' with its Import button disabled
  // and reading '...' for the rest of the session.
  it('user sees an error when they press Import and it is refused', async () => {
    // Given a local pantry and no stored strategy, so the user is prompted
    // rather than auto-imported, and a server that refuses the copy.
    // The pantry has to be non-empty: with no local items the effect writes
    // MIGRATION_PROMPTED_KEY itself and never prompts, and the last assertion
    // below would then be reading the effect's write rather than the failure's.
    vi.mocked(getAllItems).mockResolvedValue([
      { id: 'item-1', name: 'Milk' },
    ] as unknown as Awaited<ReturnType<typeof getAllItems>>)
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockImplementation(() =>
      Promise.reject(forbiddenError()),
    )
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })
    await waitFor(() => expect(result.current.state).toBe('prompting'))

    // When the user presses Import
    // The promise RESOLVING is half of what is asserted here: a rejection
    // would be the unhandled one this task removed.
    await act(async () => {
      await expect(result.current.importData('append')).resolves.toBeUndefined()
    })

    // Then the state is 'error' and not left on 'importing'
    expect(result.current.state).toBe('error')
    expect(result.current.error?.forbidden).toBe(true)

    // And MIGRATION_PROMPTED_KEY is not set by the failure, so a refresh still
    // offers the copy
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBeNull()
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
    mockImportCloudData.mockResolvedValue(NOTHING_SKIPPED)

    // When the hook mounts with that session
    const { result } = renderHook(
      () =>
        usePostLoginMigration({
          isLoaded: true,
          isSignedIn: false,
          household: OWNER_HOUSEHOLD,
        }),
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
    mockImportCloudData.mockResolvedValue(NOTHING_SKIPPED)

    // When the hook mounts
    const { result } = renderHook(
      () =>
        usePostLoginMigration({
          isLoaded: false,
          isSignedIn: false,
          household: OWNER_HOUSEHOLD,
        }),
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
      { id: CLOUD_HOME_ID, name: 'My Home', order: 0 },
      { id: CLOUD_OFFICE_ID, name: 'Office', order: 1 },
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
    mockImportCloudData.mockResolvedValue(NOTHING_SKIPPED)

    // When the hook mounts, and the user presses Copy here
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })
    await pressCopyHere(result)
    await waitFor(() => expect(result.current.state).toBe('done'))

    // Then no location is named: neither the local slot nor the cloud cuid is
    // passed, so `importCloudData` carries every location through the remap
    const call = elementAt(mockImportCloudData.mock.calls)
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
    mockImportCloudData.mockResolvedValue(NOTHING_SKIPPED)

    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })

    // When the user confirms the import
    await result.current.importData('append')

    // Then the copy ran, with no location named
    const call = elementAt(mockImportCloudData.mock.calls)
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
    mockImportCloudData.mockResolvedValue(NOTHING_SKIPPED)

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
    mockImportCloudData.mockResolvedValue(NOTHING_SKIPPED)
    const { result, rerender } = renderHook(
      () => usePostLoginMigration(SIGNED_IN),
      {
        wrapper,
      },
    )
    expect(mockImportCloudData).not.toHaveBeenCalled()

    // When GetLocations answers
    mockCloudLocations([{ id: CLOUD_HOME_ID, name: 'My Home', order: 0 }])
    rerender()

    // Then the copy runs, once the user presses Copy here
    await pressCopyHere(result)
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
    mockCloudLocations([{ id: CLOUD_HOME_ID, name: 'My Home', order: 0 }])
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), CLOUD_HOME_ID)
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockReturnValue(new Promise(() => {}))
    const { result, rerender } = renderHook(
      () => usePostLoginMigration(SIGNED_IN),
      { wrapper },
    )
    await pressCopyHere(result)
    await waitFor(() => expect(mockImportCloudData).toHaveBeenCalledTimes(1))

    // When the cache is reset mid-flight — GetLocations has no data, then has
    // it again
    mockGetLocationsQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    })
    rerender()
    mockCloudLocations([{ id: CLOUD_HOME_ID, name: 'My Home', order: 0 }])
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
    mockCloudLocations([{ id: CLOUD_HOME_ID, name: 'My Home', order: 0 }])
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), 'ghost')
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'skip')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    // And an import that is still in flight (so nothing has marked it done)
    mockImportCloudData.mockReturnValue(new Promise(() => {}))

    // When the hook mounts and the provider resets the stale location
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })
    await pressCopyHere(result)
    await waitFor(() =>
      expect(localStorage.getItem(activeLocationStorageKey('cloud'))).toBe(
        CLOUD_HOME_ID,
      ),
    )

    // Then the pantry is copied up exactly once
    expect(mockImportCloudData).toHaveBeenCalledTimes(1)
  })
})

// Bug 2026-10-31 (`docs/global/bugs/2026-10-31-bug-cloud-copy-aborted-on-pantry.md`).
// `importCloudData` ends with `client.resetStore()`, which makes GetLocations
// data undefined and then defined again, so `locationsLoaded` goes
// true → false → true and the effect re-runs. A failed copy has already
// removed MIGRATION_STRATEGY_KEY, and MIGRATION_PROMPTED_KEY is unset, so the
// re-run used to take the prompting branch and replace 'error' with
// 'prompting'. The user never saw the error and was asked again.
describe('usePostLoginMigration — a failed copy stays failed', () => {
  function seedPromptableCloudSession() {
    // A non-empty local pantry, so the prompting branch WOULD prompt if it ran
    vi.mocked(getAllItems).mockResolvedValue([
      { id: 'item-1', name: 'Milk' },
    ] as unknown as Awaited<ReturnType<typeof getAllItems>>)
    mockCloudLocations([{ id: CLOUD_HOME_ID, name: 'My Home', order: 0 }])
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), CLOUD_HOME_ID)
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
  }

  async function reloadLocationList(rerender: () => void) {
    // GetLocations has no data, then has it again — what resetStore does
    mockGetLocationsQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    })
    rerender()
    mockCloudLocations([{ id: CLOUD_HOME_ID, name: 'My Home', order: 0 }])
    rerender()
    // The prompting branch sets its state after `getAllItems()` resolves, so
    // let the queue drain before asserting.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it('user sees the error of a failed automatic copy, not the prompt again', async () => {
    // Given a stored strategy and a copy that fails
    seedPromptableCloudSession()
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')
    mockImportCloudData.mockImplementation(() =>
      Promise.reject(new Error('The operation was aborted.')),
    )
    const { result, rerender } = renderHook(
      () => usePostLoginMigration(SIGNED_IN),
      { wrapper },
    )
    await pressCopyHere(result)
    await waitFor(() => expect(result.current.state).toBe('error'))

    // When the location list reloads after the failure
    await reloadLocationList(rerender)

    // Then the state is still 'error', with its message
    expect(result.current.state).toBe('error')
    expect(result.current.error?.message).toBe('The operation was aborted.')
  })

  it('user sees the error of a failed Import press, not the prompt again', async () => {
    // Given no stored strategy, so the user is prompted, and a copy that fails
    seedPromptableCloudSession()
    mockImportCloudData.mockImplementation(() =>
      Promise.reject(new Error('The operation was aborted.')),
    )
    const { result, rerender } = renderHook(
      () => usePostLoginMigration(SIGNED_IN),
      { wrapper },
    )
    await waitFor(() => expect(result.current.state).toBe('prompting'))

    // When the user presses Import and the copy fails
    await act(async () => {
      await result.current.importData('append')
    })
    expect(result.current.state).toBe('error')

    // And the location list reloads after the failure
    await reloadLocationList(rerender)

    // Then the state is still 'error', with its message
    expect(result.current.state).toBe('error')
    expect(result.current.error?.message).toBe('The operation was aborted.')
  })
})

// ─── A failed local read (docs/global/bugs/2026-11-18-bug-post-login-migration-unhandled-read.md)
//
// The prompting branch reads the local items with `getAllItems()`. In cloud
// mode that read can fail (a blocked or closed IndexedDB, a private window).
// It had no `.catch`, so the browser got an unhandled rejection. Like the
// other failures in this hook, MIGRATION_PROMPTED_KEY stays unset so a later
// run can try again.
describe('usePostLoginMigration — a failed local read', () => {
  const readFailure = new Error('IndexedDB is blocked')
  let unhandled: unknown[] = []
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason)
  }

  beforeEach(() => {
    unhandled = []
    process.on('unhandledRejection', onUnhandled)
    mockCloudLocations([{ id: CLOUD_HOME_ID, name: 'My Home', order: 0 }])
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), CLOUD_HOME_ID)
  })

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled)
  })

  /** Let the read, its handlers and Node's unhandled-rejection check run. */
  async function drain() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it('a failed local read is logged, asks nothing and leaves the prompt unset', async () => {
    // Given a local database that cannot be read
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getAllItems).mockRejectedValue(readFailure)

    // When the hook runs after sign-in
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })
    await drain()

    // Then it stays idle, nothing is marked as asked, and the failure is
    // logged instead of left unhandled
    expect(getAllItems).toHaveBeenCalled()
    expect(result.current.state).toBe('idle')
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBeNull()
    expect(unhandled).toEqual([])
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('local items'),
      readFailure,
    )
    log.mockRestore()
  })

  it('user is asked to copy once a later local read works', async () => {
    // Given a first read that fails, and local data that can be read later
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getAllItems)
      .mockRejectedValueOnce(readFailure)
      .mockResolvedValue([{ id: 'item-1', name: 'Milk' }] as unknown as Awaited<
        ReturnType<typeof getAllItems>
      >)
    const { result, rerender } = renderHook(
      () => usePostLoginMigration(SIGNED_IN),
      { wrapper },
    )
    await drain()
    expect(result.current.state).toBe('idle')

    // When the effect runs again (the location list goes unknown and back)
    mockGetLocationsQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    })
    rerender()
    mockCloudLocations([{ id: CLOUD_HOME_ID, name: 'My Home', order: 0 }])
    rerender()

    // Then the user is asked whether to copy
    await waitFor(() => expect(result.current.state).toBe('prompting'))
    log.mockRestore()
  })
})

// ─── "Import into which location?" before the copy (households H4 task E.4) ──
//
// Local data always has its default location `'local'`. Decision O3: the copy
// always asks where it goes, even with one cloud location. Decision O2: not
// for `clear`.
describe('usePostLoginMigration — the copy asks where the local default goes', () => {
  const localPayload = {
    ...emptyPayload,
    locations: [
      {
        id: 'local',
        name: 'My Home',
        order: 0,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  }

  function seed() {
    vi.mocked(getAllItems).mockResolvedValue([
      { id: 'item-1', name: 'Milk' },
    ] as unknown as Awaited<ReturnType<typeof getAllItems>>)
    mockCloudLocations([{ id: CLOUD_HOME_ID, name: 'Home', order: 0 }])
    localStorage.setItem('data-mode', 'cloud')
    mockFetchLocalPayload.mockResolvedValue(localPayload)
    mockImportCloudData.mockResolvedValue({
      skipped: { locationNames: [], rowCount: 0 },
    })
  }

  it('user pressing Import is asked where before anything is copied, and the answer is used', async () => {
    // Given a prompted user with local data
    seed()
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })
    await waitFor(() => expect(result.current.state).toBe('prompting'))

    // When the user presses Import
    await act(async () => {
      await result.current.importData('append')
    })

    // Then the dialog is open, with the local data waiting, and nothing copied
    expect(result.current.state).toBe('choosing-location')
    expect(result.current.pendingPayload).toBe(localPayload)
    expect(mockImportCloudData).not.toHaveBeenCalled()

    // When the user picks Home
    await act(async () => {
      await result.current.chooseLocation({ locationId: CLOUD_HOME_ID })
    })

    // Then the copy ran into Home, and is done
    expect(result.current.state).toBe('done')
    const call = elementAt(mockImportCloudData.mock.calls)
    expect(call[1]).toBe('skip')
    expect(call[3]).toEqual({ target: { locationId: CLOUD_HOME_ID } })
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBe('1')
  })

  it('user switching to cloud with a stored strategy is asked where too', async () => {
    // Given a stored `replace` strategy
    seed()
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'replace')

    // When the hook mounts, and the user presses Copy here
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })
    await pressCopyHere(result)

    // Then it waits for the answer, and has copied nothing
    await waitFor(() => expect(result.current.state).toBe('choosing-location'))
    expect(mockImportCloudData).not.toHaveBeenCalled()

    // When the user picks a new location
    await act(async () => {
      await result.current.chooseLocation({ newLocationName: 'My Home' })
    })

    // Then the copy ran with the stored strategy and that answer
    const call = elementAt(mockImportCloudData.mock.calls)
    expect(call[1]).toBe('replace')
    expect(call[3]).toEqual({ target: { newLocationName: 'My Home' } })
    expect(localStorage.getItem(MIGRATION_STRATEGY_KEY)).toBeNull()
  })

  it('user switching to cloud with clear is not asked (decision O2)', async () => {
    // Given a stored `clear` strategy
    seed()
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')

    // When the hook mounts, and the user presses Copy here
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })
    await pressCopyHere(result)

    // Then the copy runs at once, with no target
    await waitFor(() => expect(result.current.state).toBe('done'))
    const call = elementAt(mockImportCloudData.mock.calls)
    expect(call[1]).toBe('clear')
    expect(call[3]).toBeUndefined()
  })

  it('user cancelling the question is asked again whether to copy, and nothing is copied', async () => {
    // Given a stored strategy and the question open
    seed()
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'skip')
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })
    await pressCopyHere(result)
    await waitFor(() => expect(result.current.state).toBe('choosing-location'))

    // When the user cancels
    act(() => result.current.cancelLocation())

    // Then the prompt is back, nothing was copied, and the stored strategy is
    // gone so a reload does not start the copy by itself
    expect(result.current.state).toBe('prompting')
    expect(mockImportCloudData).not.toHaveBeenCalled()
    expect(localStorage.getItem(MIGRATION_STRATEGY_KEY)).toBeNull()
  })

  it('user who is not an owner or manager is told so', async () => {
    // Given the copy is refused for the household role
    seed()
    const { ImportRefusedError } = await import('@/lib/importData')
    mockImportCloudData.mockRejectedValue(new ImportRefusedError('role'))
    const { result } = renderHook(() => usePostLoginMigration(SIGNED_IN), {
      wrapper,
    })
    await waitFor(() => expect(result.current.state).toBe('prompting'))

    // When the user presses Import and picks Home
    await act(async () => {
      await result.current.importData('append')
    })
    await act(async () => {
      await result.current.chooseLocation({ locationId: CLOUD_HOME_ID })
    })

    // Then the error is the role one
    expect(result.current.state).toBe('error')
    expect(result.current.error).toMatchObject({ role: true, forbidden: false })
  })
})

// ─── Owner decision O22-A: a stored copy asks first ──────────────────────────
//
// A person can choose "Copy local data" while switching to cloud. The copy
// then runs by itself once the household's locations load. Before O22-A it
// ran into WHATEVER household came next: a person in no household waited,
// with the key stored, and the copy ran into the shared household they joined
// later. Now it waits for "Copy your offline data into {household}?".
describe('usePostLoginMigration — a stored copy asks first (O22-A)', () => {
  function seed() {
    vi.mocked(getAllItems).mockResolvedValue([
      { id: 'item-1', name: 'Milk' },
    ] as unknown as Awaited<ReturnType<typeof getAllItems>>)
    mockCloudLocations([{ id: CLOUD_HOME_ID, name: 'Home', order: 0 }])
    localStorage.setItem('data-mode', 'cloud')
    mockFetchLocalPayload.mockResolvedValue(emptyPayload)
    mockImportCloudData.mockResolvedValue(NOTHING_SKIPPED)
  }

  function renderWith(household: MigrationHousehold | undefined) {
    return renderHook(
      ({ h }: { h: MigrationHousehold | undefined }) =>
        usePostLoginMigration({
          isLoaded: true,
          isSignedIn: true,
          household: h,
        }),
      { wrapper, initialProps: { h: household } },
    )
  }

  // Lets a copy that WOULD start reach `importCloudData` before asserting it
  // did not. Without it, an absence check passes only because the microtask
  // that sends the copy has not run yet.
  async function drain() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it('user with a stored copy is asked before anything is copied', async () => {
    // Given a stored `clear` copy and a household that has loaded
    seed()
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')

    // When the hook mounts
    const { result } = renderWith(OWNER_HOUSEHOLD)

    // Then it asks, with the stored strategy waiting, and has sent nothing
    await waitFor(() => expect(result.current.state).toBe('confirming'))
    expect(result.current.waitingStrategy).toBe('clear')
    await drain()
    expect(result.current.state).toBe('confirming')
    expect(mockFetchLocalPayload).not.toHaveBeenCalled()
    expect(mockImportCloudData).not.toHaveBeenCalled()
  })

  it('user pressing Copy here has the stored copy run', async () => {
    // Given the question is open for a stored `clear` copy
    seed()
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')
    const { result } = renderWith(OWNER_HOUSEHOLD)

    // When the user presses Copy here
    await pressCopyHere(result)

    // Then the copy ran with the stored strategy, and the keys are consumed
    await waitFor(() => expect(result.current.state).toBe('done'))
    expect(mockImportCloudData).toHaveBeenCalledTimes(1)
    expect(elementAt(mockImportCloudData.mock.calls)[1]).toBe('clear')
    expect(localStorage.getItem(MIGRATION_STRATEGY_KEY)).toBeNull()
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBe('1')
  })

  it("user pressing Don't copy has nothing copied, and is not asked again", async () => {
    // Given the question is open, and the device has local data
    seed()
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'skip')
    const { result, unmount } = renderWith(OWNER_HOUSEHOLD)
    await waitFor(() => expect(result.current.state).toBe('confirming'))

    // When the user presses Don't copy
    act(() => result.current.declineCopy())

    // Then nothing is copied, the stored copy is gone, and the prompt is
    // marked as answered
    expect(result.current.state).toBe('done')
    expect(localStorage.getItem(MIGRATION_STRATEGY_KEY)).toBeNull()
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBe('1')
    await drain()
    expect(mockImportCloudData).not.toHaveBeenCalled()

    // And after a reload neither the question nor the one with no stored
    // strategy comes back
    unmount()
    const next = renderWith(OWNER_HOUSEHOLD)
    await drain()
    expect(next.result.current.state).toBe('idle')
    expect(mockImportCloudData).not.toHaveBeenCalled()
  })

  it('nothing is asked or copied while the household is loading', async () => {
    // Given a stored copy, locations loaded, and the household not known yet
    seed()
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'clear')
    const { result, rerender } = renderWith(undefined)

    // Then nothing is asked and nothing is sent
    await drain()
    expect(result.current.state).toBe('idle')
    expect(mockImportCloudData).not.toHaveBeenCalled()
    expect(localStorage.getItem(MIGRATION_STRATEGY_KEY)).toBe('clear')

    // When the household arrives, the question opens
    rerender({ h: OWNER_HOUSEHOLD })
    await waitFor(() => expect(result.current.state).toBe('confirming'))
  })

  // The state the whole-branch review found: the person chose "Copy local
  // data" and is in NO household. GetLocations fails with NO_HOUSEHOLD, and
  // there is no household to name. The copy waits, with the key stored.
  it('a stored copy waits, unsent, while the person is in no household', async () => {
    // Given a stored copy, a GetLocations that failed with NO_HOUSEHOLD, and
    // no household
    seed()
    mockGetLocationsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: new CombinedGraphQLErrors({
        errors: [
          {
            message: 'You are not in any household',
            extensions: { code: 'NO_HOUSEHOLD' },
          },
        ],
      }) as unknown as undefined,
    })
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'replace')

    // When the hook mounts
    const { result } = renderWith(undefined)
    await drain()

    // Then no copy is sent, nothing is asked, and the key is still stored
    expect(result.current.state).toBe('idle')
    expect(mockFetchLocalPayload).not.toHaveBeenCalled()
    expect(mockImportCloudData).not.toHaveBeenCalled()
    expect(localStorage.getItem(MIGRATION_STRATEGY_KEY)).toBe('replace')
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBeNull()
  })
})

describe('usePostLoginMigration — a joined household is skipped, not every household', () => {
  // Bug 2026-11-19 (docs/global/bugs/2026-11-19-bug-join-turns-off-copy-prompt.md).
  // "Sign in to join" used to set `migration-prompted`, which turns the
  // question off on this device for good. Now Join names the joined
  // household in `migration-skip-households`, and the question still comes
  // in any other household.
  const JOINED = {
    id: 'household-joined',
    name: 'the Lin home',
    role: 'manager' as const,
  }

  function seed() {
    vi.mocked(getAllItems).mockResolvedValue([
      { id: 'item-1', name: 'Milk' },
    ] as unknown as Awaited<ReturnType<typeof getAllItems>>)
    mockCloudLocations([{ id: CLOUD_HOME_ID, name: 'Home', order: 0 }])
    localStorage.setItem('data-mode', 'cloud')
  }

  function renderWith(
    household: MigrationHousehold | undefined,
    paused = false,
  ) {
    return renderHook(
      ({ h, p }: { h: MigrationHousehold | undefined; p: boolean }) =>
        usePostLoginMigration({
          isLoaded: true,
          isSignedIn: true,
          household: h,
          paused: p,
        }),
      { wrapper, initialProps: { h: household, p: paused } },
    )
  }

  async function drain() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it('user in the household they joined is not asked to copy, even as a manager', async () => {
    // Given local items, and a device that joined this household. A manager
    // could copy, so only the skip stops the question (owner decision O12-A)
    seed()
    skipCopyPromptIn(JOINED.id)

    // When the hook mounts in that household
    const { result } = renderWith(JOINED)
    await drain()

    // Then nothing is asked, and the question is not turned off for good
    expect(result.current.state).toBe('idle')
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBeNull()
  })

  it('user who joined a household is asked again in their own household', async () => {
    // Given local items, and a device that joined ANOTHER household
    seed()
    skipCopyPromptIn(JOINED.id)

    // When the hook mounts in the person's own household
    const { result } = renderWith(OWNER_HOUSEHOLD)

    // Then the question comes
    await waitFor(() => expect(result.current.state).toBe('prompting'))
  })

  it('a stored copy does not ask in the household joined', async () => {
    // Given a stored copy and a device that joined this household
    seed()
    skipCopyPromptIn(JOINED.id)
    localStorage.setItem(MIGRATION_STRATEGY_KEY, 'skip')

    // When the hook mounts there
    const { result } = renderWith(JOINED)
    await drain()

    // Then it does not ask, and the stored copy stays for a later household
    expect(result.current.state).toBe('idle')
    expect(localStorage.getItem(MIGRATION_STRATEGY_KEY)).toBe('skip')
  })

  it('with a household skipped, nothing is asked until the household is known', async () => {
    // Given a device that joined a household, and a household still loading
    seed()
    skipCopyPromptIn(JOINED.id)
    const { result, rerender } = renderWith(undefined)
    await drain()

    // Then nothing is asked yet: it may be the household joined
    expect(result.current.state).toBe('idle')

    // When the household loads and it is another one
    rerender({ h: OWNER_HOUSEHOLD, p: false })

    // Then the question comes
    await waitFor(() => expect(result.current.state).toBe('prompting'))
  })

  it('nothing is asked on the join and sign-in pages', async () => {
    // Given local items and no skip at all (a person on their way to join)
    seed()

    // When the hook mounts while paused
    const { result, rerender } = renderWith(OWNER_HOUSEHOLD, true)
    await drain()

    // Then nothing is asked and nothing is stored
    expect(result.current.state).toBe('idle')
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBeNull()

    // When the person leaves those pages without joining
    rerender({ h: OWNER_HOUSEHOLD, p: false })

    // Then the question comes in their own household
    await waitFor(() => expect(result.current.state).toBe('prompting'))
  })

  // docs/global/bugs/2026-11-19-bug-manual-import-names-no-household.md: the
  // question with no stored strategy names the household and reads the role,
  // so it waits for the household like the stored copy does.
  it('with no skip at all, the question waits until the household is known', async () => {
    // Given local items, no skip list, and a household still loading
    seed()
    const { result, rerender } = renderWith(undefined)
    await drain()

    // Then nothing is asked yet, and nothing is stored
    expect(result.current.state).toBe('idle')
    expect(localStorage.getItem(MIGRATION_PROMPTED_KEY)).toBeNull()

    // When the household loads
    rerender({ h: OWNER_HOUSEHOLD, p: false })

    // Then the question comes
    await waitFor(() => expect(result.current.state).toBe('prompting'))
  })

  it('a broken skip list is read as empty', async () => {
    // Given a value that is not a JSON list
    seed()
    localStorage.setItem(MIGRATION_SKIP_HOUSEHOLDS_KEY, '{not json')

    // When the hook mounts
    const { result } = renderWith(OWNER_HOUSEHOLD)

    // Then it asks as usual
    await waitFor(() => expect(result.current.state).toBe('prompting'))
  })
})

describe('skipCopyPromptIn', () => {
  afterEach(() => localStorage.clear())

  it('adds each household once', () => {
    skipCopyPromptIn('a')
    skipCopyPromptIn('b')
    skipCopyPromptIn('a')
    expect(
      JSON.parse(localStorage.getItem(MIGRATION_SKIP_HOUSEHOLDS_KEY) ?? ''),
    ).toEqual(['a', 'b'])
  })
})

describe('isCopyPromptPausedPath', () => {
  it('pauses on the join page and the sign-in page only', () => {
    expect(isCopyPromptPausedPath('/join/abc')).toBe(true)
    expect(isCopyPromptPausedPath('/sign-in')).toBe(true)
    expect(isCopyPromptPausedPath('/')).toBe(false)
    expect(isCopyPromptPausedPath('/joined')).toBe(false)
    expect(isCopyPromptPausedPath('/settings/household/members')).toBe(false)
  })
})

describe('canCopyInto', () => {
  it('an owner can copy with every strategy', () => {
    expect(canCopyInto('owner', 'skip')).toBe(true)
    expect(canCopyInto('owner', 'replace')).toBe(true)
    expect(canCopyInto('owner', 'clear')).toBe(true)
  })

  it('a manager can copy, but not with clear', () => {
    expect(canCopyInto('manager', 'skip')).toBe(true)
    expect(canCopyInto('manager', 'replace')).toBe(true)
    expect(canCopyInto('manager', 'clear')).toBe(false)
  })

  it('a member cannot copy at all', () => {
    expect(canCopyInto('member', 'skip')).toBe(false)
    expect(canCopyInto('member', 'replace')).toBe(false)
    expect(canCopyInto('member', 'clear')).toBe(false)
  })
})
