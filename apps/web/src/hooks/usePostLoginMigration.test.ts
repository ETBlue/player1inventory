import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchLocalPayload } from '@/lib/exportData'
import { importCloudData } from '@/lib/importData'
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

// Mock getAllItems (used in the prompting path)
vi.mock('@/db/operations', () => ({
  getAllItems: vi.fn().mockResolvedValue([]),
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
