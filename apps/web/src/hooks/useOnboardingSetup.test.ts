import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  getAllItems,
  getAllTags,
  getAllTagTypes,
  getVendors,
} from '@/db/operations'
import { useOnboardingSetup } from './useOnboardingSetup'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(async () => {
  await db.items.clear()
  await db.tagTypes.clear()
  await db.tags.clear()
  await db.vendors.clear()
})

afterEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

// ─── useOnboardingSetup ────────────────────────────────────────────────────────

describe('useOnboardingSetup (local mode)', () => {
  it('user can create tag types, tags, items, and vendors in order', async () => {
    // Given a set of item keys and vendor keys
    const itemKeys = ['rice', 'eggs']
    const vendorKeys = ['costco', 'px-mart']

    // When the mutation is called
    const { result } = renderHook(() => useOnboardingSetup(), {
      wrapper: createWrapper(),
    })

    await result.current.mutateAsync({ itemKeys, vendorKeys })

    // Then tag types were created (2 template tag types)
    const tagTypes = await getAllTagTypes()
    expect(tagTypes).toHaveLength(2)
    const tagTypeNames = tagTypes.map((tt) => tt.name)
    expect(tagTypeNames).toContain('Category')
    expect(tagTypeNames).toContain('Preservation')

    // Then tags were created
    const tags = await getAllTags()
    expect(tags.length).toBeGreaterThan(0)

    // Then only the selected items were created
    const items = await getAllItems()
    expect(items).toHaveLength(2)
    const itemNames = items.map((i) => i.name)
    expect(itemNames).toContain('Rice')
    expect(itemNames).toContain('Eggs')

    // Then only the selected vendors were created
    const vendors = await getVendors()
    expect(vendors).toHaveLength(2)
    const vendorNames = vendors.map((v) => v.name)
    expect(vendorNames).toContain('Costco')
    expect(vendorNames).toContain('PX Mart')
  })

  it('user can track progress with increasing percentages', async () => {
    // Given a progress callback
    const progressValues: number[] = []
    const onProgress = (pct: number) => {
      progressValues.push(pct)
    }

    // When the mutation is called with progress tracking
    const { result } = renderHook(() => useOnboardingSetup(), {
      wrapper: createWrapper(),
    })

    await result.current.mutateAsync({
      itemKeys: ['rice'],
      vendorKeys: ['costco'],
      onProgress,
    })

    // Then progress was reported with increasing values
    expect(progressValues.length).toBeGreaterThan(0)
    // Values should be increasing
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(
        progressValues[i - 1] as number,
      )
    }
    // Final value should be 100
    expect(progressValues[progressValues.length - 1]).toBe(100)
  })

  it('user can select only specific items and vendors', async () => {
    // Given only a subset of available items and vendors selected
    const { result } = renderHook(() => useOnboardingSetup(), {
      wrapper: createWrapper(),
    })

    await result.current.mutateAsync({
      itemKeys: ['rice'],
      vendorKeys: [],
    })

    // Then only rice was created (not eggs, milk, etc.)
    const items = await getAllItems()
    expect(items).toHaveLength(1)
    expect(items[0]?.name).toBe('Rice')

    // Then no vendors were created
    const vendors = await getVendors()
    expect(vendors).toHaveLength(0)
  })

  it('user gets items with correct tagIds resolved from template tag keys', async () => {
    // Given item keys with known tag keys
    const { result } = renderHook(() => useOnboardingSetup(), {
      wrapper: createWrapper(),
    })

    await result.current.mutateAsync({
      itemKeys: ['rice'], // rice has tagKeys: ['room-temperature', 'grains']
      vendorKeys: [],
    })

    // Then the created item should have tagIds matching the created tags
    const items = await getAllItems()
    expect(items).toHaveLength(1)
    const rice = items[0]
    expect(rice).toBeDefined()
    expect(rice?.tagIds).toHaveLength(2)

    // Verify the tag IDs actually correspond to the right tags
    const tags = await getAllTags()
    const riceTagNames = (rice?.tagIds ?? []).map(
      (id) => tags.find((t) => t.id === id)?.name,
    )
    expect(riceTagNames).toContain('Room Temperature')
    expect(riceTagNames).toContain('Grains')
  })
})
