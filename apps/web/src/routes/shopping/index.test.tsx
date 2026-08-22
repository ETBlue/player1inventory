import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
  addToCart,
  createItem,
  createLocation,
  createVendor,
} from '@/db/operations'
import { ACTIVE_LOCATION_STORAGE_KEY } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import { cartIdFor, DEFAULT_LOCATION_ID } from '@/types'

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

describe('Shopping index page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    await db.shoppingCarts.clear()
    await db.cartItems.clear()
    await db.vendors.clear()
    await db.locations.clear()
    sessionStorage.clear()
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderShoppingIndex = () => {
    const history = createMemoryHistory({ initialEntries: ['/shopping'] })
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

  it('user can see the shopping page title', async () => {
    // Given an empty database
    renderShoppingIndex()

    // Then at least one Shopping text is visible (toolbar title + nav links)
    const shoppingElements = await screen.findAllByText(/shopping/i)
    expect(shoppingElements.length).toBeGreaterThan(0)
  })

  it('user can see vendor names in the cart list', async () => {
    // Given two vendors, each with an item stocked in the active location
    const costco = await createVendor('Costco')
    const iherb = await createVendor('iHerb')
    await createItem({
      name: 'Milk',
      tagIds: [],
      vendorIds: [costco.id],
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await createItem({
      name: 'Fish Oil',
      tagIds: [],
      vendorIds: [iherb.id],
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    renderShoppingIndex()

    // Then both vendor names are displayed
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()
    expect(await screen.findByText(/iherb/i)).toBeInTheDocument()
  })

  it('vendor card with nothing stocked in the active location renders below the divider', async () => {
    // Given two vendors whose items are stocked in the active (default)
    // location, and two whose only item is stocked ONLY in another location
    // (Cabin). The second pair is the load-bearing fixture: without it a
    // location-blind implementation would pass this test. The control vendors
    // stocked here also give a reliable "data has loaded" signal to wait on,
    // so the ordering assertions cannot pass vacuously before the
    // vendors/items queries resolve.
    const cabin = await createLocation('Cabin')
    const alpine = await createVendor('Alpine Mart')
    const bodega = await createVendor('Bodega')
    const costco = await createVendor('Costco')
    const depot = await createVendor('Depot')

    await stockItem('Trail Mix', [alpine.id], DEFAULT_LOCATION_ID)
    await stockItem('Bread', [bodega.id], DEFAULT_LOCATION_ID)
    await stockItem('Firewood', [costco.id], cabin.id)
    await stockItem('Nails', [depot.id], cabin.id)

    renderShoppingIndex()
    // Wait for the settled partition before reading positions: while the item
    // query is still pending every vendor counts as unstocked, and a card is
    // remounted when it moves between sections, so an element captured earlier
    // can already be detached.
    await waitFor(() =>
      expect(divider()).toHaveTextContent('2 not stocked here'),
    )

    // Then the two vendors stocked here sit above the divider...
    expect(isBefore(screen.getByText(/alpine mart/i), divider())).toBe(true)
    expect(isBefore(screen.getByText(/bodega/i), divider())).toBe(true)

    // ...and the two stocked-only-elsewhere vendors render (no longer hidden)
    // below it
    expect(isBefore(divider(), screen.getByText(/costco/i))).toBe(true)
    expect(isBefore(divider(), screen.getByText(/depot/i))).toBe(true)

    // And the divider counts exactly the below-the-line vendors
    expect(divider()).toHaveTextContent('2 not stocked here')
  })

  it('user sees no divider when every vendor is stocked in the active location', async () => {
    // Given two vendors, both with an item stocked in the active location
    const alpine = await createVendor('Alpine Mart')
    const bodega = await createVendor('Bodega')
    await stockItem('Trail Mix', [alpine.id], DEFAULT_LOCATION_ID)
    await stockItem('Bread', [bodega.id], DEFAULT_LOCATION_ID)

    renderShoppingIndex()
    await screen.findByText(/alpine mart/i)

    // Then nothing sinks and no divider is rendered (waited for, since the
    // divider is briefly present while the item query is still pending)
    await waitFor(() =>
      expect(screen.queryByText(/not stocked here/i)).not.toBeInTheDocument(),
    )
  })

  it('the chosen sort holds within each section of the partitioned vendor list', async () => {
    // Given vendors created in non-alphabetical order, two stocked here and
    // two stocked only in Cabin
    const cabin = await createLocation('Cabin')
    const zeta = await createVendor('Zeta Foods')
    const alphaMart = await createVendor('Alpha Mart')
    const yankee = await createVendor('Yankee Goods')
    const bravo = await createVendor('Bravo Bazaar')

    await stockItem('Trail Mix', [zeta.id], DEFAULT_LOCATION_ID)
    await stockItem('Bread', [alphaMart.id], DEFAULT_LOCATION_ID)
    await stockItem('Firewood', [yankee.id], cabin.id)
    await stockItem('Nails', [bravo.id], cabin.id)

    // When the list is sorted alphabetically
    const history = createMemoryHistory({
      initialEntries: ['/shopping?sort=alpha&dir=desc'],
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
    await waitFor(() =>
      expect(divider()).toHaveTextContent('2 not stocked here'),
    )

    // Then each section is alphabetised on its own — the partition groups but
    // never re-sorts
    expect(
      isBefore(
        screen.getByText(/alpha mart/i),
        screen.getByText(/zeta foods/i),
      ),
    ).toBe(true)
    expect(isBefore(screen.getByText(/zeta foods/i), divider())).toBe(true)
    expect(isBefore(divider(), screen.getByText(/bravo bazaar/i))).toBe(true)
    expect(
      isBefore(
        screen.getByText(/bravo bazaar/i),
        screen.getByText(/yankee goods/i),
      ),
    ).toBe(true)
  })

  it('no-vendor card renders below the divider when its items are stocked only elsewhere', async () => {
    // Given an unfiled item that exists but is stocked only in Cabin, plus a
    // vendor stocked here so the top section is populated
    const cabin = await createLocation('Cabin')
    const alpine = await createVendor('Alpine Mart')
    await stockItem('Trail Mix', [alpine.id], DEFAULT_LOCATION_ID)
    await stockItem('Firewood', [], cabin.id)

    renderShoppingIndex()
    await waitFor(() =>
      expect(divider()).toHaveTextContent('1 not stocked here'),
    )

    // Then the no-vendor bucket is not hidden — it sinks below the divider
    expect(isBefore(divider(), screen.getByText(/no vendor/i))).toBe(true)
  })

  it('user can see no-vendor card when items have no vendor', async () => {
    // Given an item with no vendor assigned
    await createItem({
      name: 'Unassigned Item',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    renderShoppingIndex()

    // Then the no-vendor card is visible
    expect(await screen.findByText(/no vendor/i)).toBeInTheDocument()
  })

  it('user does not see no-vendor card when all items have vendors', async () => {
    // Given a vendor and items all assigned to it
    const vendor = await createVendor('Costco')
    await createItem({
      name: 'Milk',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    renderShoppingIndex()

    // Then Costco is visible
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()

    // And the no-vendor card is NOT visible
    const noVendorTexts = screen.queryAllByText(/no vendor/i)
    expect(noVendorTexts).toHaveLength(0)
  })

  it('user can see no-vendor card counts only items with no vendor (regression: imported backup cart)', async () => {
    // Reproduces the bug where a backup imported before vendor-carts existed creates a
    // single no-vendor cart containing items that belong to vendors. The no-vendor card
    // should only count items that actually have no vendor, matching what the cart page shows.

    // Given a vendor + two items: one assigned to Costco, one with no vendor
    const vendor = await createVendor('Costco')
    const milkWithVendor = await createItem({
      name: 'Milk',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const centrumNoVendor = await createItem({
      name: 'Centrum',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    // Both items added to the no-vendor cart (simulating a pre-vendor-carts backup import)
    await db.shoppingCarts.put({ id: cartIdFor(DEFAULT_LOCATION_ID, null) })
    await addToCart(cartIdFor(DEFAULT_LOCATION_ID, null), milkWithVendor.id, 3) // vendor-assigned item, qty > 0
    await addToCart(cartIdFor(DEFAULT_LOCATION_ID, null), centrumNoVendor.id, 1) // no-vendor item, qty > 0

    renderShoppingIndex()

    // Then the no-vendor card shows "1 item · 1 in cart" (only Centrum counts)
    // NOT "1 item · 2 in cart" which was the bug
    expect(await screen.findByText(/1 item · 1 in cart/)).toBeInTheDocument()
    expect(screen.queryByText(/1 item · 2 in cart/)).not.toBeInTheDocument()
  })

  it('user can see cart with checked items reflected in vendor card', async () => {
    // Given a vendor with an item in its cart
    const vendor = await createVendor('Costco')
    const item = await createItem({
      name: 'Milk',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await addToCart(cartIdFor(DEFAULT_LOCATION_ID, vendor.id), item.id, 2)

    renderShoppingIndex()

    // Then Costco vendor card is visible
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()
  })

  it('last purchased sort orders vendor cards by most recently completed cart', async () => {
    // Given two vendors: Costco and iHerb, each with an item stocked here
    // (so both sit in the top, stocked-here section of the list)
    const costco = await createVendor('Costco')
    const iherb = await createVendor('iHerb')
    await createItem({
      name: 'Milk',
      tagIds: [],
      vendorIds: [costco.id],
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await createItem({
      name: 'Fish Oil',
      tagIds: [],
      vendorIds: [iherb.id],
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    // Costco: older lastPurchasedAt; iHerb: newer lastPurchasedAt
    const olderDate = new Date('2025-01-01T00:00:00Z')
    const newerDate = new Date('2025-06-01T00:00:00Z')
    await db.shoppingCarts.update(cartIdFor(DEFAULT_LOCATION_ID, costco.id), {
      lastPurchasedAt: olderDate,
    })
    await db.shoppingCarts.update(cartIdFor(DEFAULT_LOCATION_ID, iherb.id), {
      lastPurchasedAt: newerDate,
    })

    // Render shopping index with ?sort=recent
    const history = createMemoryHistory({
      initialEntries: ['/shopping?sort=recent&dir=desc'],
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

    // Assert iHerb appears before Costco (more recently purchased)
    const iherbEl = await screen.findByText(/iherb/i)
    const costcoEl = await screen.findByText(/costco/i)
    expect(iherbEl.compareDocumentPosition(costcoEl)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('vendor card shows updated item count after user adds item in vendor cart and returns to shopping page (regression)', async () => {
    // Given: a vendor with one item, no active cart yet
    const vendor = await createVendor('PX Mart')
    await createItem({
      name: 'Pineapple Cake',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    // Mount the full app starting at /shopping (uses the full routeTree + shared queryClient)
    const history = createMemoryHistory({ initialEntries: ['/shopping'] })
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

    // 1. Vendor card appears — no items in cart yet
    expect(await screen.findByText(/px mart/i)).toBeInTheDocument()

    // 2. Navigate to the vendor cart
    history.push(`/shopping/${vendor.id}`)

    // 3. Wait for the vendor cart page to appear
    expect(await screen.findByText(/pineapple cake/i)).toBeInTheDocument()

    // 4. Add item to cart — wait for cart to resolve (checkbox disabled until cart loads)
    const checkbox = screen.getByRole('checkbox', { name: /pineapple cake/i })
    await waitFor(() => expect(checkbox).not.toBeDisabled())
    await userEvent.click(checkbox)
    expect(await screen.findByText(/1 pack/i)).toBeInTheDocument()

    // 5. Navigate back to shopping index
    history.push('/shopping')

    // 6. Vendor card must now show updated count — this is the regression assertion
    await waitFor(
      () => {
        expect(screen.getByText(/1 item · 1 in cart/)).toBeInTheDocument()
      },
      { timeout: 3000 },
    )
  })

  it('vendor card counts only items in its own cart, not items from the null-vendor cart (regression)', async () => {
    // Reproduces the bug where a null-vendor cart (from a pre-vendor-carts backup import)
    // contains a vendor-assigned item. The vendor card should show 0 checked items —
    // only the vendor's own cart items count toward the vendor card stats.

    // Given: a Costco vendor with one item, and a no-vendor cart that also contains that item
    const vendor = await createVendor('Costco')
    const milk = await createItem({
      name: 'Milk',
      tagIds: [],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    // Null-vendor cart (simulates imported backup with 7 packs)
    await db.shoppingCarts.put({ id: cartIdFor(DEFAULT_LOCATION_ID, null) })
    await addToCart(cartIdFor(DEFAULT_LOCATION_ID, null), milk.id, 7)

    renderShoppingIndex()

    // Then the Costco vendor card shows 0 checked (no Costco cart exists with items)
    // NOT "1 item · 1 in cart (7 packs)" — those belong to the null-vendor cart
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()
    expect(screen.queryByText(/1 item · 1 in cart/)).not.toBeInTheDocument()
    expect(screen.queryByText(/7 packs/i)).not.toBeInTheDocument()
  })

  it('vendor card shows a location-scoped count with an inactive segment, ignoring an item not stocked in the active location (the trap)', async () => {
    // Given a vendor with: one active item and one inactive item stocked in the
    // active (default) location, plus a third item that only exists in another
    // location (Cabin) and must NOT be counted here at all.
    const cabin = await createLocation('Cabin')
    const vendor = await createVendor('Costco')
    await createItem(
      {
        name: 'Milk',
        tagIds: [],
        vendorIds: [vendor.id],
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      DEFAULT_LOCATION_ID,
    )
    await createItem(
      {
        name: 'Discontinued Snack',
        tagIds: [],
        vendorIds: [vendor.id],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      DEFAULT_LOCATION_ID,
    )
    await createItem(
      {
        name: 'Firewood',
        tagIds: [],
        vendorIds: [vendor.id],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      cabin.id,
    )

    renderShoppingIndex()

    // Then the card shows 2 items in vendor (Milk + Discontinued Snack — NOT
    // Firewood, which is only stocked in Cabin) and 1 inactive (Discontinued Snack)
    expect(await screen.findByText(/2 items · 1 inactive/)).toBeInTheDocument()
  })

  it('vendor card count changes when the active location switches (items split across two locations, with differing counts)', async () => {
    // Given the same vendor with THREE items stocked at the default location
    // (My Home) and only ONE item stocked at Cabin — the counts must differ
    // so this test cannot pass against a location-blind implementation.
    const cabin = await createLocation('Cabin')
    const vendor = await createVendor('Costco')
    await createItem(
      {
        name: 'Milk',
        tagIds: [],
        vendorIds: [vendor.id],
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      DEFAULT_LOCATION_ID,
    )
    await createItem(
      {
        name: 'Eggs',
        tagIds: [],
        vendorIds: [vendor.id],
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      DEFAULT_LOCATION_ID,
    )
    await createItem(
      {
        name: 'Bread',
        tagIds: [],
        vendorIds: [vendor.id],
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      DEFAULT_LOCATION_ID,
    )
    await createItem(
      {
        name: 'Firewood',
        tagIds: [],
        vendorIds: [vendor.id],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      cabin.id,
    )

    // When the page first renders at the default active location (My Home)
    renderShoppingIndex()

    // Then the card shows the 3 items stocked at My Home (Milk, Eggs, Bread) —
    // not the 1 stocked only at Cabin (Firewood)
    expect(await screen.findByText(/3 items/)).toBeInTheDocument()

    // When the user switches the active location to Cabin via the real UI.
    // Scoped to <main>: the desktop Sidebar mounts a switcher too, and jsdom
    // loads no CSS so the toolbar's `lg:hidden` copy is also in the DOM.
    const switcherTrigger = within(await screen.findByRole('main')).getByRole(
      'button',
      { name: /switch location/i },
    )
    await userEvent.click(switcherTrigger)
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Cabin' }),
    )

    // Then the card re-reads and now shows only the 1 item stocked at Cabin
    // (Firewood) — the 3-item figure from My Home is gone
    await waitFor(() => {
      expect(screen.getByText(/1 item(?! ·)/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/3 items/)).not.toBeInTheDocument()
  })

  it('no-vendor card applies the same location-scoped and inactive treatment as vendor cards', async () => {
    // Given two no-vendor items: one stocked here and inactive, one stocked
    // only in another location (Cabin) and must not be counted here.
    const cabin = await createLocation('Cabin')
    await createItem(
      {
        name: 'Expired Coupon',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      DEFAULT_LOCATION_ID,
    )
    await createItem(
      {
        name: 'Cabin Only Item',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      cabin.id,
    )

    renderShoppingIndex()

    // Then the no-vendor card shows 1 item (not 2) and 1 inactive
    expect(await screen.findByText(/1 item · 1 inactive/)).toBeInTheDocument()
  })

  it('sort=count orders vendor cards by the location-scoped count, not the global item count (R2)', async () => {
    // Given vendor "Many" with 3 items globally but only 1 stocked in the active
    // location (the other 2 live only in Cabin), and vendor "Few" with 2 items,
    // both stocked in the active location. A global-count sort would rank "Many"
    // first (3 > 2); the location-scoped sort must rank "Few" first (2 > 1).
    const cabin = await createLocation('Cabin')
    const many = await createVendor('Many')
    const few = await createVendor('Few')

    await createItem(
      {
        name: 'Many Item 1',
        tagIds: [],
        vendorIds: [many.id],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      DEFAULT_LOCATION_ID,
    )
    await createItem(
      {
        name: 'Many Item 2',
        tagIds: [],
        vendorIds: [many.id],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      cabin.id,
    )
    await createItem(
      {
        name: 'Many Item 3',
        tagIds: [],
        vendorIds: [many.id],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      cabin.id,
    )
    await createItem(
      {
        name: 'Few Item 1',
        tagIds: [],
        vendorIds: [few.id],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      DEFAULT_LOCATION_ID,
    )
    await createItem(
      {
        name: 'Few Item 2',
        tagIds: [],
        vendorIds: [few.id],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      },
      DEFAULT_LOCATION_ID,
    )

    // When sorted by count, descending
    const history = createMemoryHistory({
      initialEntries: ['/shopping?sort=count&dir=desc'],
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

    // Then "Few" (2 in this location) ranks before "Many" (1 in this location)
    const fewEl = await screen.findByText(/^Few$/i)
    const manyEl = await screen.findByText(/^Many$/i)
    expect(fewEl.compareDocumentPosition(manyEl)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })
})
