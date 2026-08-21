import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem, createLocation, createShelf } from '@/db/operations'
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

const stockItem = (name: string, locationId: string) =>
  createItem(
    {
      name,
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
    },
    locationId,
  )

describe('ShelfGroupView location partition', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.shelves.clear()
    await db.recipes.clear()
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

  const renderShelfGroupView = () => {
    const history = createMemoryHistory({ initialEntries: ['/?groupBy=shelf'] })
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

  it('user sees shelves with nothing stocked here below a divider, still ordered by `order`', async () => {
    // Given four selection shelves — Alpha/Charlie hold an item stocked in the
    // active (default) location, Bravo/Delta hold one stocked ONLY in another
    // location (Cabin). The second pair is the load-bearing fixture: without
    // it a location-blind implementation would pass this test. Selection
    // shelves are deliberate — their `getItemCount` reports the raw itemIds
    // length, so partitioning on that instead of the location-scoped item list
    // would put Bravo/Delta on the wrong side.
    const cabin = await createLocation('Cabin')
    const milk = await stockItem('Milk', DEFAULT_LOCATION_ID)
    const eggs = await stockItem('Eggs', DEFAULT_LOCATION_ID)
    // Nuts is on no shelf, so the "Unsorted" bucket is non-empty here.
    await stockItem('Nuts', DEFAULT_LOCATION_ID)
    const firewood = await stockItem('Firewood', cabin.id)

    // Created in reverse `order` so only the sort can produce Alpha < Charlie
    // and Bravo < Delta in the rendered output.
    await createShelf({
      name: 'Delta',
      type: 'selection',
      order: 3,
      itemIds: [firewood.id],
    })
    await createShelf({
      name: 'Charlie',
      type: 'selection',
      order: 2,
      itemIds: [eggs.id],
    })
    await createShelf({
      name: 'Bravo',
      type: 'selection',
      order: 1,
      itemIds: [firewood.id],
    })
    await createShelf({
      name: 'Alpha',
      type: 'selection',
      order: 0,
      itemIds: [milk.id],
    })

    renderShelfGroupView()
    await screen.findByRole('button', { name: 'Alpha' })

    // Then the stocked-here shelves and the non-empty Unsorted bucket sit
    // above the divider...
    expect(
      isBefore(screen.getByRole('button', { name: 'Alpha' }), divider()),
    ).toBe(true)
    expect(
      isBefore(screen.getByRole('button', { name: 'Charlie' }), divider()),
    ).toBe(true)
    expect(
      isBefore(screen.getByRole('button', { name: 'Unsorted' }), divider()),
    ).toBe(true)

    // ...and the shelves whose only item lives in Cabin sit below it
    expect(
      isBefore(divider(), screen.getByRole('button', { name: 'Bravo' })),
    ).toBe(true)
    expect(
      isBefore(divider(), screen.getByRole('button', { name: 'Delta' })),
    ).toBe(true)

    // And the divider counts exactly the below-the-line groups
    expect(divider()).toHaveTextContent('2 not stocked here')

    // And the `order` sort still holds within each section
    expect(cardsInDomOrder()).toEqual([
      'Alpha',
      'Charlie',
      'Unsorted',
      'Bravo',
      'Delta',
    ])
  })

  it('user sees no divider when every shelf and the Unsorted bucket are stocked here', async () => {
    // Given two shelves holding items stocked in the active location, plus a
    // shelf-less item so the Unsorted bucket is non-empty too
    const milk = await stockItem('Milk', DEFAULT_LOCATION_ID)
    const eggs = await stockItem('Eggs', DEFAULT_LOCATION_ID)
    await stockItem('Nuts', DEFAULT_LOCATION_ID)
    await createShelf({
      name: 'Alpha',
      type: 'selection',
      order: 0,
      itemIds: [milk.id],
    })
    await createShelf({
      name: 'Charlie',
      type: 'selection',
      order: 1,
      itemIds: [eggs.id],
    })

    renderShelfGroupView()
    await screen.findByRole('button', { name: 'Alpha' })

    // Then nothing sinks and no divider is rendered
    expect(screen.queryByText(/not stocked here/i)).not.toBeInTheDocument()
  })

  it("a selection shelf's item count only counts items stocked in the active location", async () => {
    // Regression: `getItemCount` returned a selection shelf's raw `itemIds`
    // length, which is location-blind. A shelf holding one item stocked here
    // and one stocked only in Cabin therefore advertised "2" while sitting
    // among the location-scoped counts — and a shelf holding nothing here
    // could sit below the "not stocked here" divider still showing a non-zero
    // count, the feature contradicting itself on screen.
    const cabin = await createLocation('Cabin')
    const milk = await stockItem('Milk', DEFAULT_LOCATION_ID)
    const firewood = await stockItem('Firewood', cabin.id)
    const kindling = await stockItem('Kindling', cabin.id)

    await createShelf({
      name: 'Pantry',
      type: 'selection',
      order: 0,
      itemIds: [milk.id, firewood.id],
    })
    await createShelf({
      name: 'Woodpile',
      type: 'selection',
      order: 1,
      itemIds: [firewood.id, kindling.id],
    })

    renderShelfGroupView()
    await screen.findByRole('button', { name: 'Pantry' })

    // Then the mixed shelf counts only the item stocked here...
    expect(screen.getByRole('button', { name: 'Pantry' })).toHaveTextContent(
      '1 / 1 active',
    )

    // ...and the shelf with nothing here reads zero, matching its position
    // below the divider rather than contradicting it
    expect(screen.getByRole('button', { name: 'Woodpile' })).toHaveTextContent(
      '0 / 0 active',
    )
    expect(
      isBefore(divider(), screen.getByRole('button', { name: 'Woodpile' })),
    ).toBe(true)
  })

  it('user still sees the Unsorted card when it holds nothing here — it sinks rather than hides', async () => {
    // Given every item stocked here belongs to a shelf, so Unsorted is empty
    // in the active location. It is unconditional (ruling R2) and must remain
    // visible, below the divider.
    const milk = await stockItem('Milk', DEFAULT_LOCATION_ID)
    await createShelf({
      name: 'Alpha',
      type: 'selection',
      order: 0,
      itemIds: [milk.id],
    })

    renderShelfGroupView()
    await screen.findByRole('button', { name: 'Alpha' })

    const unsorted = screen.getByRole('button', { name: 'Unsorted' })
    expect(isBefore(divider(), unsorted)).toBe(true)
    expect(divider()).toHaveTextContent('1 not stocked here')
  })
})
