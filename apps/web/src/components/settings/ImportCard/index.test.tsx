import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  ACTIVE_LOCATION_STORAGE_KEY,
  ActiveLocationProvider,
} from '@/hooks/useActiveLocation'
import { importCloudData } from '@/lib/importData'
import { ImportCard } from '.'

// Only the cloud write path is stubbed; conflict detection and the local path
// run for real against fake-indexeddb.
vi.mock('@/lib/importData', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/importData')>()
  return { ...original, importCloudData: vi.fn().mockResolvedValue(undefined) }
})

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveLocationProvider>
        <ImportCard />
      </ActiveLocationProvider>
    </QueryClientProvider>,
  )
}

// A post-v15 backup: stock lives on ItemStock rows, not on the item.
const v15Payload = {
  version: 1,
  exportedAt: new Date().toISOString(),
  items: [
    {
      id: 'item-1',
      name: 'Milk',
      tagIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  itemStocks: [
    {
      id: 'stock-1',
      itemId: 'item-1',
      locationId: 'office',
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  locations: [],
  tags: [],
  tagTypes: [],
  vendors: [],
  recipes: [],
  inventoryLogs: [],
  shoppingCarts: [],
  cartItems: [],
  shelves: [],
}

async function uploadPayload(container: HTMLElement, payload: unknown) {
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement
  const json = JSON.stringify(payload)
  const file = new File([json], 'backup.json', { type: 'application/json' })
  // jsdom's File has no .text() — the card reads the file with it.
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(json) })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('ImportCard — cloud import scopes stock to the active location', () => {
  afterEach(async () => {
    localStorage.clear()
    vi.mocked(importCloudData).mockClear()
    await db.locations.clear()
  })

  it('user importing a backup in cloud mode migrates the active location stock', async () => {
    // Given cloud mode with 'office' as the active location
    const now = new Date()
    await db.locations.bulkPut([
      {
        id: 'local',
        name: 'My Home',
        order: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'office',
        name: 'Office',
        order: 1,
        createdAt: now,
        updatedAt: now,
      },
    ])
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, 'office')
    const { container } = renderCard()

    // When the user picks a v15 backup file
    await uploadPayload(container, v15Payload)

    // Then the cloud import is told which location's stock to flatten
    await waitFor(() => expect(importCloudData).toHaveBeenCalled())
    expect(vi.mocked(importCloudData).mock.calls[0][3]).toMatchObject({
      locationId: 'office',
    })
  })
})
