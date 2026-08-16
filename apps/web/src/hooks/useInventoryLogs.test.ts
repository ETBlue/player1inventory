import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  ACTIVE_LOCATION_STORAGE_KEY,
  ActiveLocationProvider,
  useActiveLocation,
} from '@/hooks/useActiveLocation'
import { useAddInventoryLog, useItemLogs } from './useInventoryLogs'

const mockItemLogsQuery = vi.fn()
let capturedItemLogsQueryOptions: Record<string, unknown> | undefined

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useItemLogsQuery: (options?: Record<string, unknown>) => {
      capturedItemLogsQueryOptions = options
      return mockItemLogsQuery()
    },
    useAddInventoryLogMutation: () => [vi.fn(), {}],
  }
})

vi.mock('@/db/operations', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/db/operations')>()
  return {
    ...original,
    getItemLogs: vi.fn().mockResolvedValue([]),
    addInventoryLog: vi.fn().mockResolvedValue(undefined),
  }
})

// `useActiveLocation` is mocked to a fixed id ('cabin') by default so most
// tests don't need a real ActiveLocationProvider/Dexie location row. It's a
// vi.fn() (not a plain arrow function) so the last test below can swap in the
// real implementation via mockImplementation — see "the active location id
// is threaded to a real Dexie inventoryLogs row".
vi.mock('@/hooks/useActiveLocation', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/hooks/useActiveLocation')>()
  return {
    ...original,
    useActiveLocation: vi.fn(() => ({
      activeLocationId: 'cabin',
      setActiveLocationId: vi.fn(),
      activeLocation: undefined,
    })),
  }
})

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

afterEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  capturedItemLogsQueryOptions = undefined
})

describe('useItemLogs (cloud mode)', () => {
  it('user can see inventory logs — occurredAt ISO string is converted to a Date object', async () => {
    // Given cloud mode and Apollo returns log entries with ISO date strings
    localStorage.setItem('data-mode', 'cloud')
    const occurredAtStr = '2026-03-19T10:00:00.000Z'
    mockItemLogsQuery.mockReturnValue({
      data: {
        itemLogs: [
          {
            id: 'log-1',
            itemId: 'item-1',
            delta: 3,
            quantity: 5,
            occurredAt: occurredAtStr,
            note: 'checkout',
          },
        ],
      },
      loading: false,
      error: undefined,
    })

    // When the hook is rendered
    const { result } = renderHook(() => useItemLogs('item-1'), {
      wrapper: createWrapper(),
    })

    // Then occurredAt is a Date instance (GraphQL schema does not expose createdAt;
    // the hook falls back to occurredAt for the createdAt field)
    await waitFor(() => {
      expect(result.current.data).toHaveLength(1)
    })
    const log = result.current.data?.[0]
    expect(log.occurredAt).toBeInstanceOf(Date)
    expect(log.occurredAt.toISOString()).toBe(occurredAtStr)
    expect(log.createdAt).toBeInstanceOf(Date)
    expect(log.createdAt.toISOString()).toBe(occurredAtStr)
  })

  it('user sees loading state while Apollo query is in flight', () => {
    // Given cloud mode and Apollo query is loading
    localStorage.setItem('data-mode', 'cloud')
    mockItemLogsQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    })

    // When the hook is rendered
    const { result } = renderHook(() => useItemLogs('item-1'), {
      wrapper: createWrapper(),
    })

    // Then isLoading is true and data is undefined
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('useItemLogsQuery is called with fetchPolicy cache-and-network to avoid stale logs after checkout', () => {
    // Given cloud mode — logs can go stale after checkout/cooking because
    // Apollo refetchQueries only runs for mounted queries; cache-and-network
    // ensures fresh data is always fetched on mount
    localStorage.setItem('data-mode', 'cloud')
    mockItemLogsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })

    // When the hook is rendered
    renderHook(() => useItemLogs('item-1'), {
      wrapper: createWrapper(),
    })

    // Then Apollo is called with fetchPolicy: 'cache-and-network'
    expect(capturedItemLogsQueryOptions).toMatchObject({
      fetchPolicy: 'cache-and-network',
    })
  })
})

describe('useItemLogs (local mode)', () => {
  it('user can see inventory logs from local IndexedDB', async () => {
    // Given local mode (default) and IndexedDB returns log entries
    const { getItemLogs } = await import('@/db/operations')
    const localLogs = [
      {
        id: 'log-local-1',
        itemId: 'item-1',
        delta: 2,
        quantity: 4,
        occurredAt: new Date('2026-03-18T09:00:00.000Z'),
        createdAt: new Date('2026-03-18T09:00:00.000Z'),
      },
    ]
    vi.mocked(getItemLogs).mockResolvedValue(localLogs as never)

    // When the hook is rendered
    const { result } = renderHook(() => useItemLogs('item-1'), {
      wrapper: createWrapper(),
    })

    // Then local data is returned with Date objects intact
    await waitFor(() => {
      expect(result.current.data).toHaveLength(1)
    })
    const log = result.current.data?.[0]
    expect(log.occurredAt).toBeInstanceOf(Date)
    expect(log.itemId).toBe('item-1')
  })
})

describe('useAddInventoryLog (local mode)', () => {
  it('user adds a log entry — the active location id is threaded to addInventoryLog', async () => {
    // Given local mode with an active location other than the default
    const { addInventoryLog } = await import('@/db/operations')

    // When an inventory log is added
    const { result } = renderHook(() => useAddInventoryLog(), {
      wrapper: createWrapper(),
    })
    const occurredAt = new Date('2026-03-19T10:00:00.000Z')
    await act(async () => {
      await result.current.mutateAsync({
        itemId: 'item-1',
        delta: 2,
        quantity: 5,
        occurredAt,
      })
    })

    // Then addInventoryLog is called with the active location's id, not the
    // 'local' default
    expect(addInventoryLog).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: 'cabin' }),
    )
  })

  describe('with a real ActiveLocationProvider and real Dexie row', () => {
    // PR D review 3-Minor-4: the test above only asserts that the mocked
    // `addInventoryLog` was *called* with the mocked `useActiveLocation`'s
    // hardcoded 'cabin' string — it never exercises the real active-location
    // context or a real persisted row, so it can't catch a regression in the
    // actual read path (getItemLogs filters by `activeLocationId` from the
    // real provider). This test swaps both dependencies back to their real
    // implementations and asserts against a real Dexie `inventoryLogs` row.
    afterEach(async () => {
      // Restore the file-level mocks to their defaults so later tests (and
      // re-runs within this file) aren't affected by this describe block.
      vi.mocked(useActiveLocation).mockImplementation(() => ({
        activeLocationId: 'cabin',
        setActiveLocationId: vi.fn(),
        activeLocation: undefined,
      }))
      await db.locations.clear()
      await db.inventoryLogs.clear()
    })

    function createWrapperWithActiveLocation() {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      return ({ children }: { children: ReactNode }) =>
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(ActiveLocationProvider, null, children),
        )
    }

    it('user adds a log entry — the active location id is threaded to a real Dexie inventoryLogs row', async () => {
      // Given a real location (not the default) persisted in Dexie, made
      // active via the same localStorage key the real provider reads on
      // mount, and both `useActiveLocation` and `addInventoryLog` restored
      // to their real implementations
      const { addInventoryLog: realAddInventoryLog, createLocation } =
        await vi.importActual<typeof import('@/db/operations')>(
          '@/db/operations',
        )
      const { useActiveLocation: realUseActiveLocation } =
        await vi.importActual<typeof import('@/hooks/useActiveLocation')>(
          '@/hooks/useActiveLocation',
        )
      const cabin = await createLocation('Cabin')
      localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, cabin.id)
      vi.mocked(useActiveLocation).mockImplementation(realUseActiveLocation)
      const { addInventoryLog: mockedAddInventoryLog } = await import(
        '@/db/operations'
      )
      vi.mocked(mockedAddInventoryLog).mockImplementation(realAddInventoryLog)

      // When an inventory log is added
      const { result } = renderHook(() => useAddInventoryLog(), {
        wrapper: createWrapperWithActiveLocation(),
      })
      // Let ActiveLocationProvider's own effects (useLocations resolving,
      // bootstrapCarts) settle inside act() before mutating below — otherwise
      // their state updates land outside this test's act() blocks.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      const occurredAt = new Date('2026-03-19T10:00:00.000Z')
      await act(async () => {
        await result.current.mutateAsync({
          itemId: 'item-1',
          delta: 2,
          quantity: 5,
          occurredAt,
        })
      })

      // Then the real Dexie row carries the real active location's id, not
      // the DEFAULT_LOCATION_ID fallback `addInventoryLog` would apply if the
      // id were never threaded through at all
      const logs = await db.inventoryLogs
        .where('itemId')
        .equals('item-1')
        .toArray()
      expect(logs).toHaveLength(1)
      expect(logs[0]?.locationId).toBe(cabin.id)
    })
  })
})
