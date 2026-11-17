import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  addToCart,
  createItem,
  createRecipe,
  createShelf,
  createVendor,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { asLocationRole, resetRole } from '@/test/rolePermissions'
import { cartIdFor, DEFAULT_LOCATION_ID } from '@/types'

// Households H5 task F.6: a location `viewer` sees the ACTIVE location read
// only. Stock, carts and cooking are location rights, so a viewer gets no
// quick update, no Add, no "Add to {location}", no cart changes, no checkout
// and no cooking. The server refuses all of them for a viewer anyway; the page
// only hides what would fail.
//
// Every test runs twice: a viewer and a participant of the active location.
// The two differ ONLY in that role (`asLocationRole` in
// `test/rolePermissions.ts`): both are a household MANAGER, each has the
// other role on a second location, and neither has a role on a third. So a
// page that read the household role, or another location's role, fails one
// of the two runs. That the viewer is a household manager is Review Focus 4
// of the H5 plan: the catalog stays editable, the stock does not.
vi.mock('@/hooks/usePermissions', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/usePermissions')>()
  const { roleOverride } = await import('@/test/rolePermissions')
  return {
    ...real,
    usePermissions: () => {
      // The real hook always runs, so the hook order never changes
      const live = real.usePermissions()
      const role = roleOverride()
      return role ? real.permissionsFor(role) : live
    },
  }
})

let queryClient: QueryClient

beforeEach(async () => {
  await Promise.all([
    db.items.clear(),
    db.itemStocks.clear(),
    db.vendors.clear(),
    db.recipes.clear(),
    db.shelves.clear(),
    db.shoppingCarts.clear(),
    db.cartItems.clear(),
  ])
  sessionStorage.clear()
  localStorage.setItem('e2e-skip-onboarding', 'true')
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
})

afterEach(() => {
  resetRole()
  localStorage.removeItem('e2e-skip-onboarding')
})

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient },
  })
  render(
    <ApolloProvider client={noopApolloClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApolloProvider>,
  )
}

/** An item stocked at `locationId` (the active local location by default). */
function makeItem(
  name: string,
  extra: Record<string, unknown> = {},
  locationId: string = DEFAULT_LOCATION_ID,
) {
  return createItem(
    {
      name,
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [],
      ...extra,
    },
    locationId,
  )
}

async function search(query: string) {
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: /toggle search/i }),
  )
  await user.type(await screen.findByPlaceholderText(/search items/i), query)
  return user
}

const VIEW_ONLY_NOTE = 'You can view this location, but not change it.'

const people = [
  { who: 'location viewer', role: 'viewer', canEdit: false },
  { who: 'location participant', role: 'participant', canEdit: true },
] as const

/** Present for a participant, absent for a viewer. */
function expectFor(canEdit: boolean, el: HTMLElement | null) {
  if (canEdit) expect(el).toBeInTheDocument()
  else expect(el).toBeNull()
}

describe.each(people)('$who on the pantry', (person) => {
  const verb = person.canEdit ? 'sees' : 'does not see'

  it(`${person.who} ${verb} quick update, Add, or Add to location on the pantry list`, async () => {
    // Given Milk stocked here, and Bread stocked only at another location
    await makeItem('Milk')
    await makeItem('Bread', {}, 'loc-elsewhere')
    asLocationRole(person.role)
    renderAt('/')

    // Present first: the row
    expect(await screen.findByText('Milk')).toBeInTheDocument()
    expectFor(
      person.canEdit,
      screen.queryByRole('button', { name: 'Update quantity of Milk' }),
    )
    expectFor(
      person.canEdit,
      screen.queryByRole('button', { name: 'Add item' }),
    )

    // And a search for Bread, which is stocked only elsewhere. The "not
    // stocked here" section exists only with its action (`hasVisibleTail`),
    // so a viewer gets no row and no Add to location button
    await search('Bread')
    expect(
      await screen.findByRole('button', { name: /clear search/i }),
    ).toBeInTheDocument()
    if (person.canEdit) {
      expect(await screen.findByText('Bread')).toBeInTheDocument()
    }
    expectFor(
      person.canEdit,
      screen.queryByRole('button', { name: /^Add to .*: Bread$/ }),
    )
    expectFor(person.canEdit, screen.queryByText('Bread'))
  })

  it(`${person.who} ${verb} Create item from a pantry search`, async () => {
    await makeItem('Milk')
    asLocationRole(person.role)
    renderAt('/')
    expect(await screen.findByText('Milk')).toBeInTheDocument()

    // Creating an item here also stocks it here, a location write
    const user = await search('Butter')
    expect(
      await screen.findByRole('button', { name: /clear search/i }),
    ).toBeInTheDocument()
    expectFor(
      person.canEdit,
      screen.queryByRole('button', { name: /create item/i }),
    )
    if (!person.canEdit) {
      // The viewer is told why, where Create would have been
      expect(screen.getByText(VIEW_ONLY_NOTE)).toBeInTheDocument()
      await user.keyboard('{Enter}')
      expect(screen.queryByRole('dialog')).toBeNull()
    } else {
      expect(screen.queryByText(VIEW_ONLY_NOTE)).toBeNull()
    }
  })

  it(`${person.who} ${verb} the Add button on an empty pantry`, async () => {
    // Given nothing stocked here, but one item elsewhere (no onboarding)
    await makeItem('Bread', {}, 'loc-elsewhere')
    asLocationRole(person.role)
    renderAt('/')

    expect(await screen.findByText('Your pantry is empty')).toBeInTheDocument()
    expectFor(
      person.canEdit,
      screen.queryByRole('button', { name: 'Create item' }),
    )
    if (!person.canEdit) {
      expect(screen.getByText(VIEW_ONLY_NOTE)).toBeInTheDocument()
    }
  })

  it(`${person.who} ${verb} quick update on the shelf, vendor and recipe views`, async () => {
    const vendor = await createVendor('iHerb')
    const milk = await makeItem('Milk', { vendorIds: [vendor.id] })
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'selection',
      order: 0,
      itemIds: [milk.id],
    })
    const recipe = await createRecipe({
      name: 'Pancakes',
      items: [{ itemId: milk.id, defaultAmount: 1 }],
    })
    asLocationRole(person.role)

    for (const path of [
      `/?groupBy=shelf&id=${shelf.id}`,
      `/?groupBy=vendor&id=${vendor.id}`,
      `/?groupBy=recipe&id=${recipe.id}`,
    ]) {
      renderAt(path)
      expect(await screen.findByText('Milk')).toBeInTheDocument()
      expectFor(
        person.canEdit,
        screen.queryByRole('button', { name: 'Update quantity of Milk' }),
      )
      document.body.innerHTML = ''
    }
  })
})

describe.each(people)('$who on a cart', (person) => {
  const can = person.canEdit ? 'can' : 'cannot'

  it(`${person.who} sees the cart but ${can} check out`, async () => {
    // Given the iHerb cart here holds 3 Milk, and Eggs is not in it
    const vendor = await createVendor('iHerb')
    const milk = await makeItem('Milk', { vendorIds: [vendor.id] })
    const eggs = await makeItem('Eggs', { vendorIds: [vendor.id] })
    await db.shoppingCarts.put({
      id: cartIdFor(DEFAULT_LOCATION_ID, vendor.id),
    })
    await addToCart(cartIdFor(DEFAULT_LOCATION_ID, vendor.id), milk.id, 3)
    asLocationRole(person.role)
    renderAt(`/shopping/${vendor.id}`)

    // The rows and the amount show for both
    const remove = await screen.findByRole('checkbox', { name: 'Remove Milk' })
    expect(remove).toBeChecked()
    expect(screen.getByText('3')).toBeInTheDocument()
    const add = screen.getByRole('checkbox', { name: 'Add Eggs' })

    if (person.canEdit) {
      expect(remove).toBeEnabled()
      expect(add).toBeEnabled()
      expect(
        screen.getByRole('button', { name: 'Increase quantity of Milk' }),
      ).toBeEnabled()
      expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /cancel/i }),
      ).toBeInTheDocument()
      expect(screen.queryByText(VIEW_ONLY_NOTE)).toBeNull()
      expect(remove).not.toHaveAttribute('aria-describedby')
    } else {
      // Shown, not changeable
      expect(remove).toBeDisabled()
      expect(add).toBeDisabled()
      expect(
        screen.getByRole('button', { name: 'Increase quantity of Milk' }),
      ).toBeDisabled()
      expect(
        screen.getByRole('button', { name: 'Decrease quantity of Milk' }),
      ).toBeDisabled()
      // No checkout and no abandon
      expect(screen.queryByRole('button', { name: /done/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull()
      // And the page says why, and the disabled controls point at it
      expect(screen.getByText(VIEW_ONLY_NOTE)).toBeInTheDocument()
      expect(remove).toHaveAccessibleDescription(VIEW_ONLY_NOTE)
      expect(add).toHaveAccessibleDescription(VIEW_ONLY_NOTE)
      expect(
        screen.getByRole('button', { name: 'Increase quantity of Milk' }),
      ).toHaveAccessibleDescription(VIEW_ONLY_NOTE)
      // A press on the disabled box writes nothing
      await userEvent.setup().click(add)
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(
        (await db.cartItems.toArray()).map((row) => row.itemId),
      ).not.toContain(eggs.id)
    }
  })

  it(`${person.who} ${person.canEdit ? 'sees' : 'does not see'} Create item or Add to location when searching a cart`, async () => {
    const vendor = await createVendor('iHerb')
    await makeItem('Milk', { vendorIds: [vendor.id] })
    // Brie is stocked here and not sold by iHerb, so it is in the tail's
    // upper section for both people (the household manager gets Apply iHerb).
    // It is the present-first anchor: once it shows, the catalog has loaded,
    // so the absence of Bread's Add to location below means something.
    await makeItem('Brie')
    await makeItem('Bread', { vendorIds: [vendor.id] }, 'loc-elsewhere')
    asLocationRole(person.role)
    renderAt(`/shopping/${vendor.id}?q=Br`)

    // Present first: Brie in the tail
    expect(
      await screen.findByRole('button', { name: 'Apply iHerb: Brie' }),
    ).toBeInTheDocument()
    // Bread, stocked only elsewhere, is in the tail only with its Add to
    // location action
    expectFor(
      person.canEdit,
      screen.queryByRole('button', { name: /^Add to .*: Bread$/ }),
    )

    const user = userEvent.setup()
    const input = screen.getByPlaceholderText(/search items/i)
    await user.clear(input)
    await user.type(input, 'Butter')
    expect(
      await screen.findByRole('button', { name: /clear search/i }),
    ).toBeInTheDocument()
    expectFor(
      person.canEdit,
      screen.queryByRole('button', { name: /create item/i }),
    )
  })
})

describe.each(people)('$who on the cooking page', (person) => {
  const can = person.canEdit ? 'can' : 'cannot'

  it(`${person.who} ${can} cook`, async () => {
    const flour = await makeItem('Flour', { packedQuantity: 5 })
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: flour.id, defaultAmount: 2 }],
    })
    asLocationRole(person.role)
    renderAt('/cooking')
    const user = userEvent.setup()

    // Present first: the recipe and its item
    await user.click(
      await screen.findByRole('button', { name: /Expand Pasta/i }),
    )
    const recipe = await screen.findByRole('checkbox', { name: 'Pasta' })
    const item = await screen.findByRole('checkbox', { name: 'Add Flour' })

    if (person.canEdit) {
      expect(recipe).toBeEnabled()
      expect(item).toBeEnabled()
      expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
      expect(screen.queryByText(VIEW_ONLY_NOTE)).toBeNull()
      expect(recipe).not.toHaveAccessibleDescription(
        expect.stringContaining(VIEW_ONLY_NOTE),
      )
    } else {
      expect(recipe).toBeDisabled()
      expect(item).toBeDisabled()
      // The cook button is hidden (H5 decision O10)
      expect(screen.queryByRole('button', { name: /done/i })).toBeNull()
      expect(screen.getByText(VIEW_ONLY_NOTE)).toBeInTheDocument()
      // The disabled checkboxes say why. The recipe's description keeps its
      // stock status too
      expect(recipe).toHaveAccessibleDescription(
        expect.stringContaining(VIEW_ONLY_NOTE),
      )
      expect(item).toHaveAccessibleDescription(VIEW_ONLY_NOTE)
    }
  })
})

describe('household role and location role are two checks', () => {
  it('household manager who is only a viewer of the active location still gets the catalog action in the search tail', async () => {
    // Review Focus 4: Apply vendor is a catalog write, so the viewer (a
    // manager) keeps it, while Add to location (a stock write) is hidden
    const vendor = await createVendor('iHerb')
    await makeItem('Milk', { vendorIds: [vendor.id] })
    await makeItem('Bread')
    asLocationRole('viewer', 'manager')
    renderAt(`/shopping/${vendor.id}?q=Bread`)

    expect(await screen.findByText('Bread')).toBeInTheDocument()
    const main = screen.getByRole('main')
    expect(
      within(main).getByRole('button', { name: 'Apply iHerb: Bread' }),
    ).toBeInTheDocument()
  })

  it('household member who is only a viewer of the active location gets neither', async () => {
    const vendor = await createVendor('iHerb')
    await makeItem('Milk', { vendorIds: [vendor.id] })
    await makeItem('Bread')
    await makeItem('Butter', {}, 'loc-elsewhere')
    asLocationRole('viewer', 'member')
    renderAt(`/shopping/${vendor.id}?q=B`)

    // Present first: Bread (stocked here) shows, with the member note in
    // place of Apply iHerb
    expect(await screen.findByText('Bread')).toBeInTheDocument()
    expect(
      screen.getByText('Only an owner or manager can add it here.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Apply iHerb: Bread' }),
    ).toBeNull()
    // And Butter, stocked only elsewhere, gets no Add to location
    expect(
      screen.queryByRole('button', { name: /^Add to .*: Butter$/ }),
    ).toBeNull()
  })
})
