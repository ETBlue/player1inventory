import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  createItem,
  createRecipe,
  createShelf,
  createTag,
  createTagType,
  createVendor,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import {
  asHouseholdManager,
  asHouseholdMember,
  resetRole,
} from '@/test/rolePermissions'

// Households H5 task F.5: a household `member` sees the four catalog
// "Items" tabs and the shelf "Filters" tab read only. The item checkboxes
// and the filter badges still SHOW what is assigned, so they are disabled,
// not hidden. There is no "Create item" from search.
//
// Every test runs twice, once per person, and the two people differ ONLY in
// the household role (`test/rolePermissions.ts`): both are a viewer of one
// location, a participant of another, and have no role on a third. So a page
// that hid the controls by a LOCATION role, or for everybody, fails one of
// the two runs. The manager run is the control that lets the member run fail.
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
    db.tags.clear(),
    db.tagTypes.clear(),
    db.vendors.clear(),
    db.recipes.clear(),
    db.shelves.clear(),
  ])
  sessionStorage.clear()
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
})

afterEach(() => {
  resetRole()
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

const people = [
  { who: 'household member', as: asHouseholdMember, canEdit: false },
  { who: 'household manager', as: asHouseholdManager, canEdit: true },
] as const

function makeItem(name: string, extra: Record<string, unknown> = {}) {
  return createItem({
    name,
    targetUnit: 'package',
    targetQuantity: 2,
    refillThreshold: 1,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    tagIds: [],
    vendorIds: [],
    ...extra,
  })
}

/** Open the toolbar search and type a name no item has. */
async function searchForNewName(name: string) {
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: /toggle search/i }),
  )
  const input = await screen.findByPlaceholderText(/search items/i)
  await user.type(input, name)
  return user
}

type Tab = {
  tab: string
  /** Seeds the entity with Milk assigned and returns the tab's path. */
  seed: () => Promise<string>
}

const tabs: Tab[] = [
  {
    tab: 'a vendor',
    seed: async () => {
      const vendor = await createVendor('iHerb')
      await makeItem('Milk', { vendorIds: [vendor.id] })
      return `/settings/household/vendors/${vendor.id}/items`
    },
  },
  {
    tab: 'a tag',
    seed: async () => {
      const type = await createTagType({ name: 'Storage' })
      const tag = await createTag({ name: 'Dairy', typeId: type.id })
      await makeItem('Milk', { tagIds: [tag.id] })
      return `/settings/household/tags/${tag.id}/items`
    },
  },
  {
    tab: 'a recipe',
    seed: async () => {
      const milk = await makeItem('Milk')
      const recipe = await createRecipe({
        name: 'Pancakes',
        items: [{ itemId: milk.id, defaultAmount: 1 }],
      })
      return `/settings/household/recipes/${recipe.id}/items`
    },
  },
  {
    tab: 'a shelf',
    seed: async () => {
      const milk = await makeItem('Milk')
      const shelf = await createShelf({
        name: 'Fridge',
        type: 'selection',
        order: 0,
        itemIds: [milk.id],
      })
      return `/settings/household/shelves/${shelf.id}/items`
    },
  },
]

describe.each(people)('$who on the catalog Items tabs', (person) => {
  it.each(tabs)(`${person.who} on the Items tab of $tab`, async ({ seed }) => {
    // Given Milk is assigned, and Butter does not exist
    const path = await seed()
    person.as()
    renderAt(path)

    // Then the assigned row shows as checked, and only a manager can change it
    const box = await screen.findByRole('checkbox', { name: 'Remove Milk' })
    expect(box).toBeChecked()
    if (person.canEdit) expect(box).not.toBeDisabled()
    else expect(box).toBeDisabled()

    // And "Create item" from search follows the household role
    const user = await searchForNewName('Butter')
    const create = screen.queryByRole('button', { name: /create item/i })
    if (person.canEdit) {
      expect(create).toBeInTheDocument()
    } else {
      expect(create).toBeNull()
      // And Enter does not create it either
      await user.keyboard('{Enter}')
      await new Promise((resolve) => setTimeout(resolve, 50))
      const names = (await db.items.toArray()).map((i) => i.name)
      expect(names).not.toContain('Butter')
    }
  })

  it(`${person.who} on a recipe's Items tab ${person.canEdit ? 'can' : 'cannot'} change an amount`, async () => {
    const milk = await makeItem('Milk')
    const recipe = await createRecipe({
      name: 'Pancakes',
      items: [{ itemId: milk.id, defaultAmount: 1 }],
    })
    person.as()
    renderAt(`/settings/household/recipes/${recipe.id}/items`)

    const more = await screen.findByRole('button', {
      name: 'Increase quantity of Milk',
    })
    if (person.canEdit) expect(more).not.toBeDisabled()
    else expect(more).toBeDisabled()
  })

  it(`${person.who} on a filter shelf's Filters tab ${person.canEdit ? 'can' : 'cannot'} toggle a filter`, async () => {
    // Given a filter shelf that selects Pancakes, and a vendor it does not
    const recipe = await createRecipe({ name: 'Pancakes' })
    await createVendor('iHerb')
    const shelf = await createShelf({
      name: 'Breakfast',
      type: 'filter',
      order: 0,
      filterConfig: { recipeIds: [recipe.id] },
    })
    person.as()
    renderAt(`/settings/household/shelves/${shelf.id}/filters`)

    // The selected filter still shows as selected
    const pancakes = await screen.findByRole('button', { name: /Pancakes/ })
    expect(pancakes).toHaveAttribute('aria-pressed', 'true')

    // When the person presses the vendor filter
    const iherb = screen.getByRole('button', { name: /iHerb/ })
    await userEvent.setup().click(iherb)

    // Then only a manager's press changes the shelf
    if (person.canEdit) {
      await waitFor(async () =>
        expect(
          (await db.shelves.get(shelf.id))?.filterConfig?.vendorIds,
        ).toHaveLength(1),
      )
    } else {
      expect(iherb).toHaveAttribute('aria-disabled', 'true')
      await new Promise((resolve) => setTimeout(resolve, 50))
      const stored = await db.shelves.get(shelf.id)
      expect(stored?.filterConfig?.vendorIds ?? []).toHaveLength(0)
    }
  })
})
