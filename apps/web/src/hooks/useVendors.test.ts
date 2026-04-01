import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  useCreateVendor,
  useDeleteVendor,
  useItemCountByVendor,
  useUpdateVendor,
  useVendors,
} from './useVendors'

const mockUseGetVendorsQuery = vi.fn()
const mockUseItemCountByVendorQuery = vi.fn()
let capturedItemCountByVendorOptions: Record<string, unknown> | undefined
const mockCloudCreateVendor = vi.fn()
const mockCloudUpdateVendor = vi.fn()
const mockCloudDeleteVendor = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetVendorsQuery: () => mockUseGetVendorsQuery(),
    useItemCountByVendorQuery: (options?: Record<string, unknown>) => {
      capturedItemCountByVendorOptions = options
      return mockUseItemCountByVendorQuery()
    },
    useCreateVendorMutation: () => [mockCloudCreateVendor, {}],
    useUpdateVendorMutation: () => [mockCloudUpdateVendor, {}],
    useDeleteVendorMutation: () => [mockCloudDeleteVendor, {}],
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
  capturedItemCountByVendorOptions = undefined
})

// ─── useVendors ───────────────────────────────────────────────────────────────

describe('useVendors (cloud mode)', () => {
  it('user can fetch vendors via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo returns vendors
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetVendorsQuery.mockReturnValue({
      data: {
        vendors: [{ id: 'v-1', name: 'Costco', userId: 'u1' }],
      },
      loading: false,
      error: undefined,
    })

    // When the hook is called
    const { result } = renderHook(() => useVendors(), {
      wrapper: createWrapper(),
    })

    // Then it returns vendors from Apollo
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.[0]?.name).toBe('Costco')
  })

  it('deserializes ISO date strings to Date objects in cloud mode', async () => {
    // Given cloud mode and Apollo returns vendors with ISO date strings
    localStorage.setItem('data-mode', 'cloud')
    mockUseGetVendorsQuery.mockReturnValue({
      data: {
        vendors: [
          {
            id: 'v-1',
            name: 'Costco',
            userId: 'u1',
            createdAt: '2026-01-15T10:00:00.000Z',
          },
        ],
      },
      loading: false,
      error: undefined,
    })

    // When the hook is called
    const { result } = renderHook(() => useVendors(), {
      wrapper: createWrapper(),
    })

    // Then createdAt is a Date instance, not a string
    await waitFor(() => expect(result.current.data).toBeDefined())
    const vendor = result.current.data?.[0] as
      | { createdAt: unknown }
      | undefined
    expect(vendor?.createdAt).toBeInstanceOf(Date)
    expect((vendor?.createdAt as Date).getTime()).toBe(
      new Date('2026-01-15T10:00:00.000Z').getTime(),
    )
  })
})

// ─── useCreateVendor ──────────────────────────────────────────────────────────

describe('useCreateVendor (cloud mode)', () => {
  it('user can create a vendor via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudCreateVendor.mockResolvedValue({
      data: { createVendor: { id: 'v-new', name: 'Costco', userId: 'u1' } },
    })
    mockUseGetVendorsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })

    // When the mutation is called
    const { result } = renderHook(() => useCreateVendor(), {
      wrapper: createWrapper(),
    })
    const created = await result.current.mutateAsync('Costco')

    // Then it delegates to cloudCreate
    expect(mockCloudCreateVendor).toHaveBeenCalledWith({
      variables: { name: 'Costco' },
    })
    expect((created as { name: string } | undefined)?.name).toBe('Costco')
  })
})

// ─── useUpdateVendor ──────────────────────────────────────────────────────────

describe('useUpdateVendor (cloud mode)', () => {
  it('user can update a vendor via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudUpdateVendor.mockResolvedValue({
      data: { updateVendor: { id: 'v-1', name: 'Walmart' } },
    })
    mockUseGetVendorsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })

    // When the mutation is called
    const { result } = renderHook(() => useUpdateVendor(), {
      wrapper: createWrapper(),
    })
    const updated = await result.current.mutateAsync({
      id: 'v-1',
      updates: { name: 'Walmart' },
    })

    // Then it delegates to cloudUpdate
    expect(mockCloudUpdateVendor).toHaveBeenCalledWith({
      variables: { id: 'v-1', name: 'Walmart' },
    })
    expect((updated as { name: string } | undefined)?.name).toBe('Walmart')
  })
})

// ─── useDeleteVendor ──────────────────────────────────────────────────────────

describe('useDeleteVendor (cloud mode)', () => {
  it('user can delete a vendor via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo mutation resolves
    localStorage.setItem('data-mode', 'cloud')
    mockCloudDeleteVendor.mockResolvedValue({ data: { deleteVendor: true } })
    mockUseGetVendorsQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })

    // When the mutation is called
    const { result } = renderHook(() => useDeleteVendor(), {
      wrapper: createWrapper(),
    })
    const deleted = await result.current.mutateAsync('v-1')

    // Then it delegates to cloudDelete
    expect(mockCloudDeleteVendor).toHaveBeenCalledWith({
      variables: { id: 'v-1' },
    })
    expect(deleted).toBe(true)
  })
})

// ─── useItemCountByVendor ─────────────────────────────────────────────────────

describe('useItemCountByVendor (cloud mode)', () => {
  it('user can get item count for a vendor via Apollo in cloud mode', async () => {
    // Given cloud mode and Apollo returns item count
    localStorage.setItem('data-mode', 'cloud')
    mockUseItemCountByVendorQuery.mockReturnValue({
      data: { itemCountByVendor: 4 },
      loading: false,
      error: undefined,
    })

    // When the hook is called with a vendorId
    const { result } = renderHook(() => useItemCountByVendor('v-1'), {
      wrapper: createWrapper(),
    })

    // Then it returns the count from Apollo
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toBe(4)
  })

  it('useItemCountByVendorQuery is called with fetchPolicy cache-and-network to avoid stale counts after item update', () => {
    // Given cloud mode — item counts can go stale after useUpdateItem because
    // the previous cache.modify() DELETE approach has been replaced by
    // cache-and-network to fetch fresh counts on mount
    localStorage.setItem('data-mode', 'cloud')
    mockUseItemCountByVendorQuery.mockReturnValue({
      data: { itemCountByVendor: 4 },
      loading: false,
      error: undefined,
    })

    // When the hook is rendered
    renderHook(() => useItemCountByVendor('v-1'), {
      wrapper: createWrapper(),
    })

    // Then Apollo is called with fetchPolicy: 'cache-and-network'
    expect(capturedItemCountByVendorOptions).toMatchObject({
      fetchPolicy: 'cache-and-network',
    })
  })
})
