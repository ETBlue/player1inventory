import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem, createLocation, createRecipe } from '@/db/operations'
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

describe('RecipeGroupView location partition', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
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

  const renderRecipeGroupView = () => {
    const history = createMemoryHistory({
      initialEntries: ['/?groupBy=recipe'],
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

  it('user sees recipes with nothing stocked here below a divider', async () => {
    // Given four recipes — two built from items stocked in the active
    // (default) location, and two built from items stocked ONLY in another
    // location (Cabin). The second pair is the load-bearing fixture: without
    // it a location-blind implementation would pass this test.
    const cabin = await createLocation('Cabin')
    const lettuce = await stockItem('Lettuce', DEFAULT_LOCATION_ID)
    const bread = await stockItem('Bread', DEFAULT_LOCATION_ID)
    const firewood = await stockItem('Firewood', cabin.id)
    const beans = await stockItem('Beans', cabin.id)

    await createRecipe({
      name: 'Salad',
      items: [{ itemId: lettuce.id, defaultAmount: 1 }],
    })
    await createRecipe({
      name: 'Campfire Stew',
      items: [{ itemId: firewood.id, defaultAmount: 1 }],
    })
    await createRecipe({
      name: 'Toast',
      items: [{ itemId: bread.id, defaultAmount: 1 }],
    })
    await createRecipe({
      name: 'Chili',
      items: [{ itemId: beans.id, defaultAmount: 1 }],
    })

    renderRecipeGroupView()
    await screen.findByRole('button', { name: 'Salad' })

    // Then the two stocked-here recipes sit above the divider...
    expect(
      isBefore(screen.getByRole('button', { name: 'Salad' }), divider()),
    ).toBe(true)
    expect(
      isBefore(screen.getByRole('button', { name: 'Toast' }), divider()),
    ).toBe(true)

    // ...and the two built only from elsewhere-stocked items sit below it
    expect(
      isBefore(
        divider(),
        screen.getByRole('button', { name: 'Campfire Stew' }),
      ),
    ).toBe(true)
    expect(
      isBefore(divider(), screen.getByRole('button', { name: 'Chili' })),
    ).toBe(true)

    // And the divider counts exactly the below-the-line groups
    expect(divider()).toHaveTextContent('2 not stocked here')

    // And the view's incidental recipe order is preserved within each section
    // (filtering groups, it never re-sorts — see ruling R3)
    const dbOrder = (await db.recipes.toArray()).map((r) => r.name)
    const rendered = cardsInDomOrder()
    const top = ['Salad', 'Toast']
    const bottom = ['Campfire Stew', 'Chili']
    expect(rendered.filter((n) => top.includes(n))).toEqual(
      dbOrder.filter((n) => top.includes(n)),
    )
    expect(rendered.filter((n) => bottom.includes(n))).toEqual(
      dbOrder.filter((n) => bottom.includes(n)),
    )
  })

  it('user sees no divider when every recipe is stocked here', async () => {
    // Given two recipes, both built from items stocked in the active location
    const lettuce = await stockItem('Lettuce', DEFAULT_LOCATION_ID)
    const bread = await stockItem('Bread', DEFAULT_LOCATION_ID)
    await createRecipe({
      name: 'Salad',
      items: [{ itemId: lettuce.id, defaultAmount: 1 }],
    })
    await createRecipe({
      name: 'Toast',
      items: [{ itemId: bread.id, defaultAmount: 1 }],
    })

    renderRecipeGroupView()
    await screen.findByRole('button', { name: 'Salad' })

    // Then nothing sinks and no divider is rendered
    expect(screen.queryByText(/not stocked here/i)).not.toBeInTheDocument()
  })

  it('user sees the not-added-to-recipe card below the divider when its items are stocked only elsewhere', async () => {
    // Given an item that belongs to no recipe and is stocked only in Cabin,
    // plus a recipe stocked here so the list has a populated top section
    const cabin = await createLocation('Cabin')
    const lettuce = await stockItem('Lettuce', DEFAULT_LOCATION_ID)
    await stockItem('Firewood', cabin.id)
    await createRecipe({
      name: 'Salad',
      items: [{ itemId: lettuce.id, defaultAmount: 1 }],
    })

    renderRecipeGroupView()
    await screen.findByRole('button', { name: 'Salad' })

    // Then the bucket is not hidden — it sinks below the divider
    const unfiled = await screen.findByRole('button', {
      name: 'Not added to recipe',
    })
    expect(isBefore(divider(), unfiled)).toBe(true)
    expect(divider()).toHaveTextContent('1 not stocked here')
  })

  it('user sees no not-added-to-recipe card when every item anywhere belongs to a recipe', async () => {
    // Given every item — here and elsewhere — is part of some recipe
    const cabin = await createLocation('Cabin')
    const lettuce = await stockItem('Lettuce', DEFAULT_LOCATION_ID)
    const firewood = await stockItem('Firewood', cabin.id)
    await createRecipe({
      name: 'Salad',
      items: [{ itemId: lettuce.id, defaultAmount: 1 }],
    })
    await createRecipe({
      name: 'Campfire Stew',
      items: [{ itemId: firewood.id, defaultAmount: 1 }],
    })

    renderRecipeGroupView()
    await screen.findByRole('button', { name: 'Salad' })

    // Then the bucket is genuinely empty and stays hidden
    expect(
      screen.queryByRole('button', { name: 'Not added to recipe' }),
    ).not.toBeInTheDocument()
    // ...and only Campfire Stew sinks
    expect(divider()).toHaveTextContent('1 not stocked here')
  })
})
