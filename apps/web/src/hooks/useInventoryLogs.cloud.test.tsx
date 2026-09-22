import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/client'
import {
  AddInventoryLogDocument,
  ItemLogsDocument,
  LastPurchaseDatesDocument,
} from '@/generated/graphql'
import {
  bootstrapCartsMock,
  getLocationsMock,
  LOC_A,
  LOC_B,
} from '@/test/cloudFixtures'
import { DEFAULT_LOCATION_ID, type PantryItem } from '@/types'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
  useActiveLocation,
} from './useActiveLocation'
import * as dataModeHooks from './useDataMode'
import { useAddInventoryLog, useItemLogs } from './useInventoryLogs'
import { useItemSortData } from './useItemSortData'

// The REAL generated hooks, driven through `MockedProvider` with the real
// documents. `src/test/setup.ts` stubs every generated hook, and a stubbed
// `useItemLogsQuery` would swallow the variables — so "the logs of the active
// location came back" could pass against a hook that sent no `locationId` at
// all, which is exactly what PR 3a Task 4 fixes.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())

// `@apollo/client/react` is unmocked too: the write path calls
// `useApolloClient()` to resolve the target location (`useCloudLocationId`),
// and setup.ts's stub returns `{ data: {} }` from `query`, which would take the
// degraded fall-through branch and make the fresh-session test below unable to
// fail.
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

type ServerLog = {
  __typename: 'InventoryLog'
  id: string
  itemId: string
  locationId: string
  delta: number
  quantity: number
  occurredAt: string
  note: string | null
  logKey: string | null
  logParams: Record<string, string> | null
}

const log = (
  id: string,
  itemId: string,
  locationId: string,
  delta: number,
  occurredAt: string,
): ServerLog => ({
  __typename: 'InventoryLog',
  id,
  itemId,
  locationId,
  delta,
  quantity: Math.max(delta, 0),
  occurredAt,
  note: null,
  logKey: null,
  logParams: null,
})

// THE FIXTURE IS THE TEST. Milk has logs at BOTH locations, with different
// ids, different counts (2 in Cloud Kitchen, 1 in Cloud Garage) and different
// purchase dates. With logs at one location only, "the logs of the location I
// asked for" and "every log of this item" are the same list, so every
// assertion below would pass against a hook that sent no `locationId` — root
// CLAUDE.md, "Proving a Test Works".
const MILK_A1 = log('log-a1', 'item-milk', LOC_A, 2, '2026-03-01T00:00:00.000Z')
const MILK_A2 = log('log-a2', 'item-milk', LOC_A, 3, '2026-03-02T00:00:00.000Z')
const MILK_B1 = log('log-b1', 'item-milk', LOC_B, 5, '2026-03-20T00:00:00.000Z')
const RICE_B1 = log('log-b2', 'item-rice', LOC_B, 1, '2026-03-21T00:00:00.000Z')

// The server's state. The mutation mock appends to it and every query mock
// reads it, so the assertions are on what the server ended up holding rather
// than on the arguments a spy recorded.
let logs: ServerLog[] = []

const logsAt = (itemId: string, locationId: string) =>
  logs
    .filter((l) => l.itemId === itemId && l.locationId === locationId)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))

// The `ItemLogs` selection set does not ask for `locationId`; returning it
// would be a response the server could never produce.
const wire = ({ locationId: _drop, ...rest }: ServerLog) => rest

// One mock PER LOCATION, both wired to the same state. Registering only the
// expected location would make the test pass for the wrong reason: an
// unmatched mock is a link error, indistinguishable from a hundred other
// failures. With both registered, a read that went to the wrong location
// resolves happily — and is caught by the row assertions instead.
const itemLogsMock = (locationId: string) => ({
  request: {
    query: ItemLogsDocument,
    // A function `variables` is Apollo 4's variable matcher.
    variables: (vars: Record<string, unknown>) =>
      vars.locationId === locationId,
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: (vars: Record<string, unknown>) => ({
    data: { itemLogs: logsAt(vars.itemId as string, locationId).map(wire) },
  }),
})

const lastPurchaseMock = (locationId: string) => ({
  request: {
    query: LastPurchaseDatesDocument,
    variables: (vars: Record<string, unknown>) =>
      vars.locationId === locationId,
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: (vars: Record<string, unknown>) => ({
    data: {
      lastPurchaseDates: (vars.itemIds as string[]).map((itemId) => {
        const purchases = logsAt(itemId, locationId).filter((l) => l.delta > 0)
        return {
          __typename: 'LastPurchaseDateResult',
          itemId,
          date: purchases.at(-1)?.occurredAt ?? null,
        }
      }),
    },
  }),
})

const addLogMock = (locationId: string) => ({
  request: {
    query: AddInventoryLogDocument,
    variables: (vars: Record<string, unknown>) =>
      vars.locationId === locationId,
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: (vars: Record<string, unknown>) => {
    const created = log(
      `log-new-${logs.length}`,
      vars.itemId as string,
      locationId,
      vars.delta as number,
      vars.occurredAt as string,
    )
    logs = [...logs, created]
    return { data: { addInventoryLog: wire(created) } }
  },
})

const MOCKS = [
  bootstrapCartsMock,
  getLocationsMock,
  itemLogsMock(LOC_A),
  itemLogsMock(LOC_B),
  lastPurchaseMock(LOC_A),
  lastPurchaseMock(LOC_B),
  addLogMock(LOC_A),
  addLogMock(LOC_B),
  // The `'local'` sentinel is registered TOO, and that is the point. Register
  // only the two real locations and a write sent with the sentinel fails as
  // "No more mocked responses" — a link error indistinguishable from a hundred
  // other failures. With this mock present the bad write resolves happily and
  // is caught by the row assertion that says nothing landed under `'local'`.
  // The real server refuses it with FORBIDDEN instead.
  addLogMock(DEFAULT_LOCATION_ID),
]

function makeWrapper(mocks: MockedProviderProps['mocks'] = MOCKS) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    // The app's OWN cache configuration, not `MockedProvider`'s default
    // `InMemoryCache`. A `keyArgs` policy applied only in production would make
    // these tests prove nothing about the real client.
    <MockedProvider
      mocks={mocks}
      cache={createCache()}
      mockLinkDefaultOptions={{ delay: 0 }}
    >
      <QueryClientProvider client={queryClient}>
        <ActiveLocationProvider>{children}</ActiveLocationProvider>
      </QueryClientProvider>
    </MockedProvider>
  )
}

const pantryItem = (id: string, name: string): PantryItem => ({
  id,
  name,
  tagIds: [],
  vendorIds: [],
  targetUnit: 'package',
  targetQuantity: 0,
  refillThreshold: 0,
  packedQuantity: 0,
  unpackedQuantity: 0,
  consumeAmount: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
})

describe('cloud inventory-log reads are scoped to the active location', () => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    localStorage.clear()
    logs = [MILK_A1, MILK_A2, MILK_B1, RICE_B1]
  })

  it('user viewing an item in the DEFAULT location sees only that location logs', async () => {
    // Given Cloud Kitchen is active, and Milk has logs in both locations
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)

    // When the item's log list is read
    const { result } = renderHook(() => useItemLogs('item-milk'), {
      wrapper: makeWrapper(),
    })

    // Then only Cloud Kitchen's two logs come back — not Cloud Garage's
    await waitFor(() => expect(result.current.data).toHaveLength(2))
    expect(result.current.data?.map((l) => l.id)).toEqual(['log-a1', 'log-a2'])
    expect(result.current.data?.map((l) => l.id)).not.toContain('log-b1')
  })

  it('user viewing an item in a NON-DEFAULT location sees only that location logs', async () => {
    // Given Cloud Garage — which is not the default — is active
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_B)

    // When the item's log list is read
    const { result } = renderHook(() => useItemLogs('item-milk'), {
      wrapper: makeWrapper(),
    })

    // Then only Cloud Garage's single log comes back
    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(result.current.data?.map((l) => l.id)).toEqual(['log-b1'])
  })

  // The per-item `useLastPurchaseDate` used to be proved here too. It is gone
  // (#305) — `ItemCard` takes the date as a prop from the batch query below,
  // which this next test already covers with the same two-location fixture.
  it('sorting data in a NON-DEFAULT location uses that location purchase dates', async () => {
    // Given Cloud Garage is active and the list holds both items
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_B)
    const items = [
      pantryItem('item-milk', 'Milk'),
      pantryItem('item-rice', 'Rice'),
    ]

    // When the sort data is read
    const { result } = renderHook(() => useItemSortData(items), {
      wrapper: makeWrapper(),
    })

    // Then Milk's date is Cloud Garage's 2026-03-20, not Cloud Kitchen's
    // 2026-03-02, and Rice — stocked only in Cloud Garage — has one too
    await waitFor(() =>
      expect(result.current.purchaseDates?.get('item-milk')).toBeInstanceOf(
        Date,
      ),
    )
    expect(result.current.purchaseDates?.get('item-milk')?.toISOString()).toBe(
      '2026-03-20T00:00:00.000Z',
    )
    expect(result.current.purchaseDates?.get('item-rice')?.toISOString()).toBe(
      '2026-03-21T00:00:00.000Z',
    )
  })

  it('user switching location reads the new location logs, not the cached ones', async () => {
    // Given Cloud Kitchen is active and its logs have been read once
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    const { result } = renderHook(
      () => ({ logs: useItemLogs('item-milk'), active: useActiveLocation() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.logs.data).toHaveLength(2))

    // When the user switches to Cloud Garage with the location switcher
    await act(async () => {
      result.current.active.setActiveLocationId(LOC_B)
    })

    // Then Cloud Garage's single log is served, and the Kitchen's two are not.
    //
    // MEASURED, so nobody counts this as the cache-key guard: it stays GREEN
    // when `'locationId'` is dropped from the `itemLogs` `keyArgs` in
    // `createCache`. `useItemLogs` reads `cache-and-network`, so it refetches
    // on every switch and lands on the right rows even from one collapsed
    // store entry — what a collapsed key costs is the wrong list rendered
    // while that refetch is in flight. The `keyArgs` guard is
    // `apollo/client.test.ts`. What this test DOES pin is that the hook sends
    // the new location at all: it goes red the moment the variable stops
    // following the active location.
    await waitFor(() => expect(result.current.logs.data).toHaveLength(1))
    expect(result.current.logs.data?.map((l) => l.id)).toEqual(['log-b1'])

    // And switching back still gives the Kitchen its own two rows
    await act(async () => {
      result.current.active.setActiveLocationId(LOC_A)
    })
    await waitFor(() => expect(result.current.logs.data).toHaveLength(2))
    expect(result.current.logs.data?.map((l) => l.id)).toEqual([
      'log-a1',
      'log-a2',
    ])
  })
})

describe('cloud inventory-log writes name the location', () => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    localStorage.clear()
    logs = [MILK_A1, MILK_A2, MILK_B1, RICE_B1]
  })

  it('user adding a log in a NON-DEFAULT location writes it there', async () => {
    // Given Cloud Garage is active
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_B)
    const { result } = renderHook(() => useAddInventoryLog(), {
      wrapper: makeWrapper(),
    })

    // When a log is added
    await act(async () => {
      await result.current.mutateAsync({
        itemId: 'item-milk',
        delta: 4,
        quantity: 9,
        occurredAt: new Date('2026-04-01T00:00:00.000Z'),
      })
    })

    // Then the row landed in Cloud Garage, and Cloud Kitchen is untouched
    expect(logsAt('item-milk', LOC_B)).toHaveLength(2)
    expect(logsAt('item-milk', LOC_A)).toHaveLength(2)
    expect(logsAt('item-milk', LOC_B).at(-1)?.delta).toBe(4)
  })

  describe('a fresh cloud session, before GetLocations has resolved', () => {
    beforeEach(() => {
      // No stored slot at all — the state a first cloud sign-in is actually in.
      // Every other test in this file seeds it with a real cuid and therefore
      // pre-resolves the very thing that breaks here.
      localStorage.removeItem(activeLocationStorageKey('cloud'))
    })

    it('user adding a log immediately has it written to the real default location', async () => {
      // Given a brand-new cloud session with no remembered location, so the
      // active id is still the `'local'` sentinel
      const { result } = renderHook(() => useAddInventoryLog(), {
        wrapper: makeWrapper(),
      })

      // When a log is added before the location list has loaded
      await act(async () => {
        await result.current.mutateAsync({
          itemId: 'item-milk',
          delta: 6,
          quantity: 8,
          occurredAt: new Date('2026-04-02T00:00:00.000Z'),
        })
      })

      // Then it landed in the isDefault location — NOT under the `'local'`
      // sentinel, which names no cloud Location and whose write the server
      // refuses with FORBIDDEN
      expect(logsAt('item-milk', LOC_A)).toHaveLength(3)
      expect(logsAt('item-milk', LOC_A).at(-1)?.delta).toBe(6)
      expect(logsAt('item-milk', DEFAULT_LOCATION_ID)).toHaveLength(0)
    })
  })
})
