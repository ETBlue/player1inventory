import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
  addInventoryLog,
  createItem,
  createVendor,
  updateItem,
} from '@/db/operations'
import i18n from '@/i18n'
import { routeTree } from '@/routeTree.gen'

// The Log tab layout (design 2026-11-25, inventory log layout), on the real
// page in local mode. The label and date rules have their own unit tests in
// `lib/inventoryLogDisplay.test.ts`; this file checks the page puts them
// together, with the item's unit, in both languages.

function renderLog(itemId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/items/${itemId}/log`] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

// 500 g per bag, tracked in grams: 2 bags and 0 g.
async function flourWithLogs() {
  const item = await createItem({
    name: 'Flour',
    tagIds: [],
    packageUnit: 'bag',
    measurementUnit: 'g',
    amountPerPackage: 500,
    targetUnit: 'measurement',
    targetQuantity: 1000,
    refillThreshold: 0,
    packedQuantity: 2,
    unpackedQuantity: 0,
  })
  const vendor = await createVendor('Costco')
  // A purchase of 2 bags, then a real stock count to 1 bag + 470 g
  await addInventoryLog({
    itemId: item.id,
    delta: 2,
    quantity: 2,
    occurredAt: new Date(2026, 10, 24, 9, 5),
    logKey: 'purchase',
    logParams: { vendorId: vendor.id, vendorName: 'Costco' },
  })
  await updateItem(item.id, { packedQuantity: 1, unpackedQuantity: 470 })
  return item
}

describe('Item Log tab', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await i18n.changeLanguage('en')
    await db.delete()
  })

  it('user sees each row with the amount in the item unit, the kind, the total after, and the date', async () => {
    // Given flour bought, then counted
    const item = await flourWithLogs()

    // When the user opens the Log tab
    renderLog(item.id)

    // Then the newest row is first: the stock count, in grams
    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    const [count, purchase] = rows as [HTMLElement, HTMLElement]
    expect(within(count).getByText('−30 g')).toBeInTheDocument()
    expect(within(count).getByText('Stock count')).toBeInTheDocument()
    expect(count).toHaveTextContent('970 g')
    // And the purchase, converted from bags, with its vendor and date
    expect(within(purchase).getByText('+1000 g')).toBeInTheDocument()
    expect(within(purchase).getByText('Bought at Costco')).toBeInTheDocument()
    expect(purchase).toHaveTextContent('1000 g')
    expect(
      within(purchase).getByText('Tue, Nov 24, 2026 · 09:05'),
    ).toBeInTheDocument()
  })

  it('user reading in Traditional Chinese sees the labels and the date in Chinese', async () => {
    // Given the app language is Traditional Chinese
    await i18n.changeLanguage('tw')
    const item = await flourWithLogs()

    // When the user opens the Log tab
    renderLog(item.id)

    // Then the labels and the date are in Chinese
    expect(await screen.findByText('盤點')).toBeInTheDocument()
    expect(screen.getByText('在 Costco 購買')).toBeInTheDocument()
    expect(screen.getByText('2026/11/24（週二）09:05')).toBeInTheDocument()
  })
})
