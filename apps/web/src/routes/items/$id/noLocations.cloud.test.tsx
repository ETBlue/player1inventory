import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import { type cloudLocation, LOC_A } from '@/test/cloudFixtures'
import type { PantryItem } from '@/types'

// Households H5, review of task F.7. A household can have no location. The
// item page itself does not need one (the item is catalog data), but two of
// its tabs are location-scoped:
// - the Stock tab rendered NOTHING (`viewed` was undefined, `return null`);
// - the log tab showed a spinner forever (`useItemLogs` waits for a location).
// Both are now wrapped in `NoLocationsGate`, like Pantry, Shopping and Cooking.
//
// The location list is replaced (`useLocations`), and so is the item read
// (`useItem`), because setup.ts's `useGetItemQuery` stub has no item and the
// item page would say "not found" before any tab renders.

let locations: ReturnType<typeof cloudLocation>[] = []

vi.mock('@/hooks/useLocations', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/useLocations')>()
  return {
    ...real,
    useLocations: () => ({
      data: locations.map((l) => ({
        ...l,
        createdAt: new Date(l.createdAt),
        updatedAt: new Date(l.updatedAt),
      })),
      isLoading: false,
      isError: false,
    }),
  }
})

const MILK: PantryItem = {
  id: 'item-milk',
  name: 'Milk',
  tagIds: [],
  vendorIds: [],
  targetUnit: 'package',
  consumeAmount: 1,
  packedQuantity: 0,
  unpackedQuantity: 0,
  targetQuantity: 0,
  refillThreshold: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
} as PantryItem

vi.mock('@/hooks/useItems', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/useItems')>()
  return {
    ...real,
    useItem: () => ({ data: MILK, isLoading: false, isError: false }),
  }
})

const EMPTY_TEXT = 'You have no locations in this household yet.'

let queryClient: QueryClient

beforeEach(() => {
  localStorage.setItem('data-mode', 'cloud')
  localStorage.setItem('e2e-skip-onboarding', 'true')
  localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
  locations = []
  sessionStorage.clear()
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
})

afterEach(() => {
  localStorage.removeItem('data-mode')
  localStorage.removeItem('e2e-skip-onboarding')
  localStorage.removeItem(activeLocationStorageKey('cloud'))
})

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe.each([
  { tab: 'stock', path: '/items/item-milk/stock' },
  { tab: 'log', path: '/items/item-milk/log' },
])('the item $tab tab with no locations', ({ tab, path }) => {
  it(`user sees the empty locations screen on the item ${tab} tab when they have no locations`, async () => {
    // Given the household has no location the caller can see
    renderAt(path)

    // Then the tab says so, with the button, and no spinner is left running
    const main = await screen.findByRole('main')
    expect(await within(main).findByText(EMPTY_TEXT)).toBeInTheDocument()
    expect(
      within(main).getByRole('button', { name: 'Create a location' }),
    ).toBeInTheDocument()
    expect(main.querySelector('.animate-spin')).toBeNull()
  })
})
