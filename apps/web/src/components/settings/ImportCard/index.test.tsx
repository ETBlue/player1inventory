import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
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
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

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
function v15Payload(...stockLocationIds: string[]) {
  const iso = new Date().toISOString()
  return {
    version: 1,
    exportedAt: iso,
    items: [
      {
        id: 'item-1',
        name: 'Milk',
        tagIds: [],
        createdAt: iso,
        updatedAt: iso,
      },
    ],
    itemStocks: stockLocationIds.map((locationId, i) => ({
      id: `stock-${i}`,
      itemId: 'item-1',
      locationId,
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 1,
      createdAt: iso,
      updatedAt: iso,
    })),
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

async function seedLocations(...entries: Array<[string, string]>) {
  const now = new Date()
  await db.locations.bulkPut(
    entries.map(([id, name], order) => ({
      id,
      name,
      order,
      createdAt: now,
      updatedAt: now,
    })),
  )
}

describe('ImportCard — cloud import scopes stock to the active location', () => {
  afterEach(async () => {
    localStorage.clear()
    vi.mocked(importCloudData).mockClear()
    vi.mocked(toast.error).mockClear()
    await db.locations.clear()
  })

  it('user importing a backup in cloud mode migrates the active location stock', async () => {
    // Given cloud mode with 'office' as the active location, and a backup that
    // holds stock for it
    await seedLocations(['local', 'My Home'], ['office', 'Office'])
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, 'office')
    const { container } = renderCard()

    // When the user picks a v15 backup file
    await uploadPayload(container, v15Payload('local', 'office'))

    // Then the cloud import is told which location's stock to flatten
    await waitFor(() => expect(importCloudData).toHaveBeenCalled())
    expect(vi.mocked(importCloudData).mock.calls[0][3]).toMatchObject({
      locationId: 'office',
    })
  })

  it('user importing another devices backup keeps its stock instead of zeroing it', async () => {
    // Given a backup written on another device, whose single location id does
    // not exist here (this device only has 'local')
    await seedLocations(['local', 'My Home'])
    localStorage.setItem('data-mode', 'cloud')
    const { container } = renderCard()

    // When the user imports it
    await uploadPayload(container, v15Payload('kitchen-a1b2'))

    // Then the import flattens by the location the backup actually has —
    // flattening by 'local' would have uploaded every item with zeroed stock
    await waitFor(() => expect(importCloudData).toHaveBeenCalled())
    expect(vi.mocked(importCloudData).mock.calls[0][3]).toMatchObject({
      locationId: 'kitchen-a1b2',
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('user is told, not silently zeroed, when the backup locations are unknown', async () => {
    // Given a backup holding stock in two locations, neither of them this
    // device's — there is no safe way to pick one
    await seedLocations(['local', 'My Home'])
    localStorage.setItem('data-mode', 'cloud')
    const { container } = renderCard()

    // When the user imports it
    await uploadPayload(container, v15Payload('kitchen-a1b2', 'garage-c3d4'))

    // Then the import is refused with an explicit error instead of uploading
    // zeroed stock and dropping every cart
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(importCloudData).not.toHaveBeenCalled()
  })
})

// Inbound (file / cloud → local) must mirror the outbound rule: restored stock
// goes to the location the user is ACTIVE in, not always 'local'. Landing it in
// 'local' while the user is in another location renders an empty pantry with no
// explanation (PR D review I-4).
describe('ImportCard — local import lands in the active location', () => {
  afterEach(async () => {
    localStorage.clear()
    vi.mocked(toast.error).mockClear()
    await db.locations.clear()
    await db.items.clear()
    await db.itemStocks.clear()
    await db.shoppingCarts.clear()
    await db.cartItems.clear()
  })

  // A pre-v15 backup: stock inline on the item, no itemStocks table.
  function legacyPayload() {
    const iso = new Date().toISOString()
    return {
      version: 1,
      exportedAt: iso,
      items: [
        {
          id: 'item-1',
          name: 'Milk',
          tagIds: [],
          targetUnit: 'package',
          targetQuantity: 4,
          refillThreshold: 1,
          packedQuantity: 3,
          unpackedQuantity: 0,
          consumeAmount: 1,
          createdAt: iso,
          updatedAt: iso,
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
  }

  it('user restoring a legacy backup sees it in the location they are in', async () => {
    // Given local mode with 'office' as the active location
    await seedLocations(['local', 'My Home'], ['office', 'Office'])
    localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, 'office')
    const { container } = renderCard()

    // When the user restores a pre-v15 backup
    await uploadPayload(container, legacyPayload())

    // Then the synthesised stock lands in 'office' — the pantry they are
    // looking at — instead of the default location
    await waitFor(async () => {
      expect(await db.itemStocks.count()).toBe(1)
    })
    const stocks = await db.itemStocks.toArray()
    expect(stocks[0].locationId).toBe('office')
  })
})
