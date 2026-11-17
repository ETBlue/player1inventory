import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  createItem,
  createRecipe,
  createShelf,
  createVendor,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import {
  asHouseholdManager,
  asHouseholdMember,
  resetRole,
} from '@/test/rolePermissions'

// Households H5 task F.5: search on the pantry, the shelf, vendor and
// recipe views, and the cart page. A household `member` gets no "Create
// item" (button or Enter), and the search tail's group action (Apply
// vendor, Add to recipe, Add to shelf) is a catalog write, so a member sees
// a note in its place. The plan listed only "Create item"; the tail actions
// are refused by the server for a member too, so they are hidden as well.
//
// Both people are a participant of the active local location, a viewer of
// another, and have no role on a third (`test/rolePermissions.ts`). They
// differ only in the household role.
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

/** An item stocked at the active local location. */
function makeItem(name: string, extra: Record<string, unknown> = {}) {
  return createItem({
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
  })
}

async function search(query: string) {
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: /toggle search/i }),
  )
  await user.type(await screen.findByPlaceholderText(/search items/i), query)
  return user
}

const TAIL_NOTE = 'Only an owner or manager can add it here.'

const people = [
  { who: 'household member', as: asHouseholdMember, canEdit: false },
  { who: 'household manager', as: asHouseholdManager, canEdit: true },
] as const

describe.each(people)('$who searching the pantry and the cart', (person) => {
  const verb = person.canEdit ? 'sees' : 'does not see'

  it(`${person.who} ${verb} Create item when searching the pantry`, async () => {
    await makeItem('Milk')
    person.as()
    renderAt('/')
    expect(await screen.findByText('Milk')).toBeInTheDocument()

    const user = await search('Butter')
    const create = screen.queryByRole('button', { name: /create item/i })
    if (person.canEdit) {
      expect(create).toBeInTheDocument()
    } else {
      expect(create).toBeNull()
      // And Enter opens no create dialog
      await user.keyboard('{Enter}')
      expect(screen.queryByRole('dialog')).toBeNull()
    }
  })

  it(`${person.who} ${verb} Create item and Apply vendor when searching a cart`, async () => {
    // Given the iHerb cart, and Bread stocked here with no vendor
    const vendor = await createVendor('iHerb')
    await makeItem('Milk', { vendorIds: [vendor.id] })
    await makeItem('Bread')
    person.as()
    renderAt(`/shopping/${vendor.id}?q=Bread`)

    // Present first: Bread is offered in the tail
    expect(await screen.findByText('Bread')).toBeInTheDocument()
    const apply = screen.queryByRole('button', { name: 'Apply iHerb: Bread' })
    const note = screen.queryByText(TAIL_NOTE)
    if (person.canEdit) {
      expect(apply).toBeInTheDocument()
      expect(note).toBeNull()
    } else {
      expect(apply).toBeNull()
      expect(note).toBeInTheDocument()
    }

    // And Create item for a new name
    const user = userEvent.setup()
    const input = screen.getByPlaceholderText(/search items/i)
    await user.clear(input)
    await user.type(input, 'Butter')
    const create = screen.queryByRole('button', { name: /create item/i })
    if (person.canEdit) expect(create).toBeInTheDocument()
    else expect(create).toBeNull()
  })
})

describe.each(people)('$who searching a pantry group', (person) => {
  const verb = person.canEdit ? 'sees' : 'does not see'

  it(`${person.who} ${verb} Apply vendor on the vendor view`, async () => {
    const vendor = await createVendor('iHerb')
    await makeItem('Milk', { vendorIds: [vendor.id] })
    await makeItem('Bread')
    person.as()
    renderAt(`/?groupBy=vendor&id=${vendor.id}`)
    expect(await screen.findByText('Milk')).toBeInTheDocument()

    await search('Bread')
    expect(await screen.findByText('Bread')).toBeInTheDocument()
    const apply = screen.queryByRole('button', { name: 'Apply iHerb: Bread' })
    if (person.canEdit) {
      expect(apply).toBeInTheDocument()
      expect(screen.queryByText(TAIL_NOTE)).toBeNull()
    } else {
      expect(apply).toBeNull()
      expect(screen.getByText(TAIL_NOTE)).toBeInTheDocument()
    }
  })

  it(`${person.who} ${verb} Add to recipe on the recipe view`, async () => {
    const milk = await makeItem('Milk')
    await makeItem('Bread')
    const recipe = await createRecipe({
      name: 'Pancakes',
      items: [{ itemId: milk.id, defaultAmount: 1 }],
    })
    person.as()
    renderAt(`/?groupBy=recipe&id=${recipe.id}`)
    expect(await screen.findByText('Milk')).toBeInTheDocument()

    await search('Bread')
    expect(await screen.findByText('Bread')).toBeInTheDocument()
    const add = screen.queryByRole('button', { name: 'Add to recipe: Bread' })
    if (person.canEdit) {
      expect(add).toBeInTheDocument()
      expect(screen.queryByText(TAIL_NOTE)).toBeNull()
    } else {
      expect(add).toBeNull()
      expect(screen.getByText(TAIL_NOTE)).toBeInTheDocument()
    }
  })

  it(`${person.who} ${verb} Add to shelf or Create item on a shelf view`, async () => {
    const milk = await makeItem('Milk')
    await makeItem('Bread')
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'selection',
      order: 0,
      itemIds: [milk.id],
    })
    person.as()
    renderAt(`/?groupBy=shelf&id=${shelf.id}`)
    expect(await screen.findByText('Milk')).toBeInTheDocument()

    const user = await search('Bread')
    expect(await screen.findByText('Bread')).toBeInTheDocument()
    const add = screen.queryByRole('button', { name: 'Add to shelf: Bread' })
    if (person.canEdit) {
      expect(add).toBeInTheDocument()
      expect(screen.queryByText(TAIL_NOTE)).toBeNull()
    } else {
      expect(add).toBeNull()
      expect(screen.getByText(TAIL_NOTE)).toBeInTheDocument()
    }

    const input = screen.getByPlaceholderText(/search items/i)
    await user.clear(input)
    await user.type(input, 'Butter')
    const create = screen.queryByRole('button', { name: /create item/i })
    if (person.canEdit) expect(create).toBeInTheDocument()
    else expect(create).toBeNull()
  })
})
