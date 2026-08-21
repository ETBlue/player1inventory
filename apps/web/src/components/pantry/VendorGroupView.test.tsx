import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem, createLocation, createVendor } from '@/db/operations'
import { ACTIVE_LOCATION_STORAGE_KEY } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import { DEFAULT_LOCATION_ID } from '@/types'

// Every group card renders its name as `aria-label` on an explicit
// role="button" (GroupCard). Toolbar controls are native <button>/<a>, which
// carry no role attribute, so this selector matches group cards only.
const cardsInDomOrder = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>('[role="button"][aria-label]'),
  ).map((el) => el.getAttribute('aria-label') ?? '')

const divider = () => screen.getByText(/not stocked here/i)

const isBefore = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

const stockItem = (name: string, vendorIds: string[], locationId: string) =>
  createItem(
    {
      name,
      tagIds: [],
      vendorIds,
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
    },
    locationId,
  )

describe('VendorGroupView location partition', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.vendors.clear()
    await db.shoppingCarts.clear()
    await db.cartItems.clear()
    await db.locations.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    localStorage.clear()
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderVendorGroupView = () => {
    const history = createMemoryHistory({
      initialEntries: ['/?groupBy=vendor'],
    })
    const router = createRouter({
      routeTree,
      history,
      context: { queryClient },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user sees vendors with nothing stocked here below a divider', async () => {
    // Given four vendors — two whose only item is stocked in the active
    // (default) location, and two whose only item is stocked ONLY in another
    // location (Cabin). The second pair is the load-bearing fixture: without
    // it a location-blind implementation would pass this test.
    const cabin = await createLocation('Cabin')
    const alpine = await createVendor('Alpine Mart')
    const costco = await createVendor('Costco')
    const bodega = await createVendor('Bodega')
    const depot = await createVendor('Depot')

    await stockItem('Trail Mix', [alpine.id], DEFAULT_LOCATION_ID)
    await stockItem('Bread', [bodega.id], DEFAULT_LOCATION_ID)
    await stockItem('Firewood', [costco.id], cabin.id)
    await stockItem('Nails', [depot.id], cabin.id)

    // When the vendor group view renders
    renderVendorGroupView()
    await screen.findByRole('button', { name: 'Alpine Mart' })

    // Then the two stocked-here vendors sit above the divider...
    expect(
      isBefore(screen.getByRole('button', { name: 'Alpine Mart' }), divider()),
    ).toBe(true)
    expect(
      isBefore(screen.getByRole('button', { name: 'Bodega' }), divider()),
    ).toBe(true)

    // ...and the two stocked-only-elsewhere vendors sit below it
    expect(
      isBefore(divider(), screen.getByRole('button', { name: 'Costco' })),
    ).toBe(true)
    expect(
      isBefore(divider(), screen.getByRole('button', { name: 'Depot' })),
    ).toBe(true)

    // And the divider counts exactly the below-the-line groups
    expect(divider()).toHaveTextContent('2 not stocked here')

    // And the view's incidental vendor order is preserved within each section
    // (filtering groups, it never re-sorts — see ruling R3)
    const dbOrder = (await db.vendors.toArray()).map((v) => v.name)
    const rendered = cardsInDomOrder()
    expect(
      rendered.filter((n) => n === 'Alpine Mart' || n === 'Bodega'),
    ).toEqual(dbOrder.filter((n) => n === 'Alpine Mart' || n === 'Bodega'))
    expect(rendered.filter((n) => n === 'Costco' || n === 'Depot')).toEqual(
      dbOrder.filter((n) => n === 'Costco' || n === 'Depot'),
    )
  })

  it('user sees no divider when every vendor is stocked here', async () => {
    // Given two vendors, both with an item stocked in the active location
    const alpine = await createVendor('Alpine Mart')
    const bodega = await createVendor('Bodega')
    await stockItem('Trail Mix', [alpine.id], DEFAULT_LOCATION_ID)
    await stockItem('Bread', [bodega.id], DEFAULT_LOCATION_ID)

    renderVendorGroupView()
    await screen.findByRole('button', { name: 'Alpine Mart' })

    // Then nothing sinks and no divider is rendered
    expect(screen.queryByText(/not stocked here/i)).not.toBeInTheDocument()
  })

  it('user sees the no-vendor card below the divider when its items are stocked only elsewhere', async () => {
    // Given an unfiled item that exists but is stocked only in Cabin, plus a
    // vendor stocked here so the list has a populated top section
    const cabin = await createLocation('Cabin')
    const alpine = await createVendor('Alpine Mart')
    await stockItem('Trail Mix', [alpine.id], DEFAULT_LOCATION_ID)
    await stockItem('Firewood', [], cabin.id)

    renderVendorGroupView()
    await screen.findByRole('button', { name: 'Alpine Mart' })

    // Then the no-vendor bucket is not hidden — it sinks below the divider
    const noVendor = await screen.findByRole('button', { name: 'No vendor' })
    expect(isBefore(divider(), noVendor)).toBe(true)
    expect(divider()).toHaveTextContent('1 not stocked here')
  })

  it('user sees no no-vendor card when nothing is unfiled anywhere', async () => {
    // Given every item — here and elsewhere — is assigned to a vendor
    const cabin = await createLocation('Cabin')
    const alpine = await createVendor('Alpine Mart')
    const costco = await createVendor('Costco')
    await stockItem('Trail Mix', [alpine.id], DEFAULT_LOCATION_ID)
    await stockItem('Firewood', [costco.id], cabin.id)

    renderVendorGroupView()
    await screen.findByRole('button', { name: 'Alpine Mart' })

    // Then the bucket is genuinely empty and stays hidden
    expect(
      screen.queryByRole('button', { name: 'No vendor' }),
    ).not.toBeInTheDocument()
    // ...and only Costco sinks
    expect(divider()).toHaveTextContent('1 not stocked here')
  })
})
