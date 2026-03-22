import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useItemLogs } from './useInventoryLogs'

const mockItemLogsQuery = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useItemLogsQuery: () => mockItemLogsQuery(),
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
