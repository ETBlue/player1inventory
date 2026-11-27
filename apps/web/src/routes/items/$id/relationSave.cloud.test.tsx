import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import {
  CLOUD_LOCATIONS,
  cloudItem,
  cloudRecipe,
  cloudStock,
  cloudTag,
  cloudTagType,
  cloudVendor,
  LOC_A,
} from '@/test/cloudFixtures'
import {
  cloudServer,
  holdMutation,
  resetCloudServer,
  seedCloudHousehold,
} from '@/test/cloudServerStub'
import { watchUnhandledRejections } from '@/test/unhandledRejections'

// The top bar Save of the item Tags, Vendors and Recipes tabs, in CLOUD mode
// (item relations Save, design
// `docs/features/items/2026-11-27-item-relations-save-design.md`). A press
// changes only the screen; Save sends ONE write with the whole list on
// screen: `updateItem` on Tags and Vendors, `setItemRecipes` on Recipes. The
// local tests are in `tags.test.tsx`, `vendors.test.tsx` and
// `recipes.test.tsx`.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const { stubGeneratedHooks } = await import('@/test/cloudServerStub')
  return stubGeneratedHooks(await importOriginal())
})

const FROZEN = cloudTag('tag-frozen', 'frozen', 'type-label')
const FRESH = cloudTag('tag-fresh', 'fresh', 'type-label')
const DRY = cloudTag('tag-dry', 'dry', 'type-label')
const DAIRY = cloudTag('tag-dairy', 'dairy', 'type-label')

// The item has one tag, so a Save that sends only the saved list, or only
// the presses, gives a different answer from one that sends the list on
// screen
const FLOUR = cloudItem('item-flour', 'Flour', { tagIds: ['tag-frozen'] })
const FLOUR_A = cloudStock('stock-flour-a', 'item-flour', LOC_A, {
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 0,
})

/** The server writes the list, and the item reads it back (Apollo's cache). */
function serverSavesTags() {
  cloudServer.results.useUpdateItemMutation = (vars) => {
    const input = vars.input as { tagIds: string[] }
    const item = { ...FLOUR, tagIds: input.tagIds }
    cloudServer.queries.useGetItemQuery = { item }
    return { updateItem: item }
  }
}

describe('Item Tags tab - the Save (cloud)', () => {
  let rejections: ReturnType<typeof watchUnhandledRejections>

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    resetCloudServer()
    seedCloudHousehold(CLOUD_LOCATIONS)
    cloudServer.queries.useGetItemQuery = { item: FLOUR }
    cloudServer.queries.useGetItemsQuery = { items: [FLOUR] }
    cloudServer.queries.usePantryDataQuery = {
      items: [FLOUR],
      itemStocks: [FLOUR_A],
    }
    cloudServer.queries.useItemStocksForItemQuery = {
      itemStocksForItem: [FLOUR_A],
    }
    cloudServer.queries.useGetRecipesQuery = { recipes: [] }
    cloudServer.queries.useGetVendorsQuery = { vendors: [] }
    cloudServer.queries.useGetTagTypesQuery = {
      tagTypes: [cloudTagType('type-label', 'Label')],
    }
    cloudServer.queries.useGetTagsQuery = { tags: [FROZEN, FRESH, DRY] }
    serverSavesTags()
    rejections = watchUnhandledRejections()
  })

  afterEach(() => {
    rejections.stop()
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
  })

  function renderPage() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/items/item-flour/tags'],
      }),
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  const saveButton = () => screen.getByRole('button', { name: /^save$/i })

  it('user can press two tags and save both with one Save', async () => {
    const user = userEvent.setup()
    // Given the item with the tag "frozen"
    renderPage()

    // When the user presses "fresh" and "dry"
    await user.click(await screen.findByRole('button', { name: 'fresh' }))
    await user.click(screen.getByRole('button', { name: 'dry' }))

    // Then nothing is sent yet
    expect(cloudServer.calls.useUpdateItemMutation).toBeUndefined()

    // When the user presses Save
    await user.click(saveButton())

    // Then ONE write is sent, with the old tag kept and both new ones
    await waitFor(() =>
      expect(cloudServer.calls.useUpdateItemMutation).toEqual([
        {
          id: 'item-flour',
          input: { tagIds: ['tag-frozen', 'tag-fresh', 'tag-dry'] },
        },
      ]),
    )
    // And the page says so, and Save is off again with the badges pressed
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(screen.getByRole('button', { name: 'fresh' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees Save loading and cannot press a badge while the tags save', async () => {
    const user = userEvent.setup()
    // Given a server that holds the write
    const write = holdMutation('useUpdateItemMutation')
    renderPage()

    // When the user presses "fresh" and Save
    await user.click(await screen.findByRole('button', { name: 'fresh' }))
    await user.click(saveButton())
    await waitFor(() =>
      expect(cloudServer.calls.useUpdateItemMutation).toHaveLength(1),
    )

    // Then Save shows a spinner and is off, and every badge is disabled
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(saveButton().querySelector('.animate-spin')).not.toBeNull()
    const dry = screen.getByRole('button', { name: 'dry' })
    expect(dry).toHaveAttribute('aria-disabled', 'true')

    // When the user presses "dry" before the write is answered
    await user.click(dry)

    // Then it stays as it was: the list sent is the list that was on screen
    expect(dry).toHaveAttribute('aria-pressed', 'false')

    // When the server answers
    write.release()

    // Then Save is off (nothing left to save) and "dry" was never sent
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'dry' })).not.toHaveAttribute(
        'aria-disabled',
      ),
    )
    expect(saveButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'dry' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(cloudServer.calls.useUpdateItemMutation).toEqual([
      { id: 'item-flour', input: { tagIds: ['tag-frozen', 'tag-fresh'] } },
    ])
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  // The trap of the design (*The draft*): a new tag is in the draft BEFORE
  // the tag list has it. A clean-up that drops every draft id missing from
  // the list would drop it, and the badge would arrive not selected (issue
  // #402 again). Only an id that WAS in the list and is gone now may leave.
  it('user sees a new tag stay selected when the tag list arrives late', async () => {
    const user = userEvent.setup()
    // Given a server that creates "dairy", while the tag list is read again
    // only later (the list below does not have it yet)
    cloudServer.results.useCreateTagMutation = () => ({ createTag: DAIRY })
    renderPage()

    // When the user adds a tag named "dairy"
    await user.click(await screen.findByRole('button', { name: /new tag$/i }))
    await user.type(screen.getByLabelText(/name/i), 'dairy')
    await user.click(screen.getByRole('button', { name: /^add tag$/i }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    // Then there is something to save, before the badge is even there
    expect(screen.queryByRole('button', { name: 'dairy' })).toBeNull()
    expect(saveButton()).toBeEnabled()

    // When another tab takes "frozen" off the item meanwhile, so the draft
    // is cleaned up while the list still has no "dairy" (opening and closing
    // the dialog renders the tab again)
    cloudServer.queries.useGetItemQuery = { item: { ...FLOUR, tagIds: [] } }
    await user.click(screen.getByRole('button', { name: /new tag$/i }))
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'frozen', pressed: false }),
      ).toBeInTheDocument(),
    )

    // And the tag list arrives with "dairy"
    cloudServer.queries.useGetTagsQuery = { tags: [FROZEN, FRESH, DRY, DAIRY] }
    await user.click(screen.getByRole('button', { name: /new tag$/i }))
    await user.keyboard('{Escape}')

    // Then the new badge shows as selected, and Save gives it to the item
    expect(
      await screen.findByRole('button', { name: 'dairy', pressed: true }),
    ).toBeInTheDocument()
    await user.click(saveButton())
    await waitFor(() =>
      expect(cloudServer.calls.useUpdateItemMutation).toEqual([
        { id: 'item-flour', input: { tagIds: ['tag-dairy'] } },
      ]),
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })
})

const COSTCO = cloudVendor('vendor-costco', 'Costco')
const LIDL = cloudVendor('vendor-lidl', 'Lidl')
const IHERB = cloudVendor('vendor-iherb', 'iHerb')
const ALDI = cloudVendor('vendor-aldi', 'Aldi')
const RICE = cloudItem('item-rice', 'Rice', { vendorIds: ['vendor-costco'] })
const RICE_A = cloudStock('stock-rice-a', 'item-rice', LOC_A, {
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 0,
})

describe('Item Vendors tab - the Save (cloud)', () => {
  let rejections: ReturnType<typeof watchUnhandledRejections>

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    resetCloudServer()
    seedCloudHousehold(CLOUD_LOCATIONS)
    cloudServer.queries.useGetItemQuery = { item: RICE }
    cloudServer.queries.useGetItemsQuery = { items: [RICE] }
    cloudServer.queries.usePantryDataQuery = {
      items: [RICE],
      itemStocks: [RICE_A],
    }
    cloudServer.queries.useItemStocksForItemQuery = {
      itemStocksForItem: [RICE_A],
    }
    cloudServer.queries.useGetRecipesQuery = { recipes: [] }
    cloudServer.queries.useGetTagTypesQuery = { tagTypes: [] }
    cloudServer.queries.useGetTagsQuery = { tags: [] }
    cloudServer.queries.useGetVendorsQuery = { vendors: [COSTCO, LIDL, IHERB] }
    // The server writes the list, and the item reads it back
    cloudServer.results.useUpdateItemMutation = (vars) => {
      const input = vars.input as { vendorIds: string[] }
      const item = { ...RICE, vendorIds: input.vendorIds }
      cloudServer.queries.useGetItemQuery = { item }
      return { updateItem: item }
    }
    rejections = watchUnhandledRejections()
  })

  afterEach(() => {
    rejections.stop()
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
  })

  function renderPage() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/items/item-rice/vendors'],
      }),
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  const saveButton = () => screen.getByRole('button', { name: /^save$/i })

  it('user can press two vendors and save both with one Save', async () => {
    const user = userEvent.setup()
    // Given the item with the vendor "Costco"
    renderPage()

    // When the user presses "Lidl" and "iHerb"
    await user.click(await screen.findByRole('button', { name: 'Lidl' }))
    await user.click(screen.getByRole('button', { name: 'iHerb' }))

    // Then nothing is sent yet
    expect(cloudServer.calls.useUpdateItemMutation).toBeUndefined()

    // When the user presses Save
    await user.click(saveButton())

    // Then ONE write is sent, with the old vendor kept and both new ones
    await waitFor(() =>
      expect(cloudServer.calls.useUpdateItemMutation).toEqual([
        {
          id: 'item-rice',
          input: {
            vendorIds: ['vendor-costco', 'vendor-lidl', 'vendor-iherb'],
          },
        },
      ]),
    )
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await waitFor(() => expect(saveButton()).toBeDisabled())
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees Save loading and cannot press a badge while the vendors save', async () => {
    const user = userEvent.setup()
    // Given a server that holds the write
    const write = holdMutation('useUpdateItemMutation')
    renderPage()

    // When the user presses "Lidl" and Save
    await user.click(await screen.findByRole('button', { name: 'Lidl' }))
    await user.click(saveButton())
    await waitFor(() =>
      expect(cloudServer.calls.useUpdateItemMutation).toHaveLength(1),
    )

    // Then Save shows a spinner and is off, and every badge is disabled
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(saveButton().querySelector('.animate-spin')).not.toBeNull()
    const iherb = screen.getByRole('button', { name: 'iHerb' })
    expect(iherb).toHaveAttribute('aria-disabled', 'true')

    // When the user presses "iHerb" before the write is answered
    await user.click(iherb)
    expect(iherb).toHaveAttribute('aria-pressed', 'false')

    // When the server answers
    write.release()

    // Then "iHerb" was never sent, and there is nothing left to save
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'iHerb' })).not.toHaveAttribute(
        'aria-disabled',
      ),
    )
    expect(saveButton()).toBeDisabled()
    expect(cloudServer.calls.useUpdateItemMutation).toEqual([
      {
        id: 'item-rice',
        input: { vendorIds: ['vendor-costco', 'vendor-lidl'] },
      },
    ])
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees a new vendor stay selected when the vendor list arrives late', async () => {
    const user = userEvent.setup()
    // Given a server that creates "Aldi", while the vendor list is read
    // again only later
    cloudServer.results.useCreateVendorMutation = () => ({ createVendor: ALDI })
    renderPage()

    // When the user adds a vendor named "Aldi"
    await user.click(await screen.findByRole('button', { name: /new vendor/i }))
    await user.type(screen.getByLabelText(/name/i), 'Aldi')
    await user.click(screen.getByRole('button', { name: /add vendor/i }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: 'Aldi' })).toBeNull()
    expect(saveButton()).toBeEnabled()

    // When another tab takes "Costco" off the item meanwhile, so the draft
    // is cleaned up while the list still has no "Aldi"
    cloudServer.queries.useGetItemQuery = { item: { ...RICE, vendorIds: [] } }
    await user.click(screen.getByRole('button', { name: /new vendor/i }))
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Costco', pressed: false }),
      ).toBeInTheDocument(),
    )

    // And the vendor list arrives with "Aldi"
    cloudServer.queries.useGetVendorsQuery = {
      vendors: [COSTCO, LIDL, IHERB, ALDI],
    }
    await user.click(screen.getByRole('button', { name: /new vendor/i }))
    await user.keyboard('{Escape}')

    // Then the new badge shows as selected, and Save gives it to the item
    expect(
      await screen.findByRole('button', { name: 'Aldi', pressed: true }),
    ).toBeInTheDocument()
    await user.click(saveButton())
    await waitFor(() =>
      expect(cloudServer.calls.useUpdateItemMutation).toEqual([
        { id: 'item-rice', input: { vendorIds: ['vendor-aldi'] } },
      ]),
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })
})

// The item is in "Bread" and "Cake", not in "Soup". So a Save that sends only
// the changed recipes, or only the saved list, gives a different answer from
// one that sends the list on screen.
const EGGS = cloudItem('item-eggs', 'Eggs')
const EGGS_A = cloudStock('stock-eggs-a', 'item-eggs', LOC_A, {
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 0,
})
const BREAD = cloudRecipe('recipe-bread', 'Bread', [
  { itemId: 'item-eggs', defaultAmount: 2 },
])
const CAKE = cloudRecipe('recipe-cake', 'Cake', [
  { itemId: 'item-eggs', defaultAmount: 3 },
])
const SOUP = cloudRecipe('recipe-soup', 'Soup')
const OMELETTE = cloudRecipe('recipe-omelette', 'Omelette')

/** The error the server gives when the item is not consumable any more. */
function notConsumableError() {
  return new CombinedGraphQLErrors({
    errors: [
      {
        message: 'Only consumable items can be in a recipe.',
        extensions: { code: 'BAD_USER_INPUT', reason: 'NOT_CONSUMABLE' },
      },
    ],
  })
}

describe('Item Recipes tab - the Save (cloud)', () => {
  let rejections: ReturnType<typeof watchUnhandledRejections>

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    resetCloudServer()
    seedCloudHousehold(CLOUD_LOCATIONS)
    cloudServer.queries.useGetItemQuery = { item: EGGS }
    cloudServer.queries.useGetItemsQuery = { items: [EGGS] }
    cloudServer.queries.usePantryDataQuery = {
      items: [EGGS],
      itemStocks: [EGGS_A],
    }
    cloudServer.queries.useItemStocksForItemQuery = {
      itemStocksForItem: [EGGS_A],
    }
    cloudServer.queries.useGetTagTypesQuery = { tagTypes: [] }
    cloudServer.queries.useGetTagsQuery = { tags: [] }
    cloudServer.queries.useGetVendorsQuery = { vendors: [] }
    cloudServer.queries.useGetRecipesQuery = { recipes: [BREAD, CAKE, SOUP] }
    // The server writes the list, and the recipes are read back
    cloudServer.results.useSetItemRecipesMutation = (vars) => {
      const recipeIds = vars.recipeIds as string[]
      const recipes = [BREAD, CAKE, SOUP].map((recipe) => {
        const others = recipe.items.filter((ri) => ri.itemId !== 'item-eggs')
        const own = recipe.items.find((ri) => ri.itemId === 'item-eggs')
        if (!recipeIds.includes(recipe.id)) return { ...recipe, items: others }
        return {
          ...recipe,
          items: own
            ? recipe.items
            : [
                ...others,
                {
                  __typename: 'RecipeItem' as const,
                  itemId: 'item-eggs',
                  defaultAmount: 1,
                },
              ],
        }
      })
      cloudServer.queries.useGetRecipesQuery = { recipes }
      return { setItemRecipes: recipes }
    }
    rejections = watchUnhandledRejections()
  })

  afterEach(() => {
    rejections.stop()
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
  })

  function renderPage() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/items/item-eggs/recipes'],
      }),
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  const saveButton = () => screen.getByRole('button', { name: /^save$/i })

  it('user can add one recipe and remove another with one Save, and the full list is sent', async () => {
    const user = userEvent.setup()
    // Given the item in "Bread" and "Cake"
    renderPage()

    // When the user presses "Soup" on and "Cake" off
    await user.click(await screen.findByRole('button', { name: 'Soup' }))
    await user.click(screen.getByRole('button', { name: 'Cake' }))

    // Then nothing is sent yet
    expect(cloudServer.calls.useSetItemRecipesMutation).toBeUndefined()

    // When the user presses Save
    await user.click(saveButton())

    // Then ONE write is sent, with the FULL list: "Bread" kept, "Soup"
    // added, "Cake" left out. No recipe is written one by one.
    await waitFor(() =>
      expect(cloudServer.calls.useSetItemRecipesMutation).toEqual([
        { itemId: 'item-eggs', recipeIds: ['recipe-bread', 'recipe-soup'] },
      ]),
    )
    expect(cloudServer.calls.useUpdateRecipeMutation).toBeUndefined()
    // And the page says so, and Save is off again with the badges as saved
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Soup' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Cake' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees Save loading and cannot press a badge while the recipes save', async () => {
    const user = userEvent.setup()
    // Given a server that holds the write
    const write = holdMutation('useSetItemRecipesMutation')
    renderPage()

    // When the user presses "Soup" and Save
    await user.click(await screen.findByRole('button', { name: 'Soup' }))
    await user.click(saveButton())
    await waitFor(() =>
      expect(cloudServer.calls.useSetItemRecipesMutation).toHaveLength(1),
    )

    // Then Save shows a spinner and is off, and every badge is disabled
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(saveButton().querySelector('.animate-spin')).not.toBeNull()
    const cake = screen.getByRole('button', { name: 'Cake' })
    expect(cake).toHaveAttribute('aria-disabled', 'true')

    // When the user presses "Cake" before the write is answered
    await user.click(cake)
    expect(cake).toHaveAttribute('aria-pressed', 'true')

    // When the server answers
    write.release()

    // Then "Cake" stays, and there is nothing left to save
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Cake' })).not.toHaveAttribute(
        'aria-disabled',
      ),
    )
    expect(saveButton()).toBeDisabled()
    expect(cloudServer.calls.useSetItemRecipesMutation).toEqual([
      {
        itemId: 'item-eggs',
        recipeIds: ['recipe-bread', 'recipe-cake', 'recipe-soup'],
      },
    ])
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  // The trap of the design (*The draft*): a new recipe is in the draft BEFORE
  // the recipe list has it. A clean-up that drops every draft id missing from
  // the list would drop it. On this tab the saved list and the recipe list
  // are ONE query, so a live change of the saved list is what makes the
  // clean-up run while the new recipe is still missing.
  it('user sees a new recipe created with no items and kept selected when the recipe list arrives late', async () => {
    const user = userEvent.setup()
    // Given a server that creates "Omelette", while the recipe list is read
    // again only later
    cloudServer.results.useCreateRecipeMutation = () => ({
      createRecipe: OMELETTE,
    })
    renderPage()

    // When the user adds a recipe named "Omelette"
    await user.click(await screen.findByRole('button', { name: /new recipe/i }))
    await user.type(screen.getByLabelText(/name/i), 'Omelette')
    await user.click(screen.getByRole('button', { name: /add recipe/i }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    // Then the recipe was created with NO items (owner answer 1A), and there
    // is something to save before the badge is even there
    expect(cloudServer.calls.useCreateRecipeMutation).toEqual([
      { name: 'Omelette', items: [] },
    ])
    expect(screen.queryByRole('button', { name: 'Omelette' })).toBeNull()
    expect(saveButton()).toBeEnabled()

    // When another tab takes the item out of "Bread" meanwhile, so the draft
    // is cleaned up while the list still has no "Omelette" (opening and
    // closing the dialog renders the tab again)
    cloudServer.queries.useGetRecipesQuery = {
      recipes: [{ ...BREAD, items: [] }, CAKE, SOUP],
    }
    await user.click(screen.getByRole('button', { name: /new recipe/i }))
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Bread', pressed: false }),
      ).toBeInTheDocument(),
    )

    // And the recipe list arrives with "Omelette"
    cloudServer.queries.useGetRecipesQuery = {
      recipes: [{ ...BREAD, items: [] }, CAKE, SOUP, OMELETTE],
    }
    await user.click(screen.getByRole('button', { name: /new recipe/i }))
    await user.keyboard('{Escape}')

    // Then the new badge shows as selected, and Save gives it the item
    expect(
      await screen.findByRole('button', { name: 'Omelette', pressed: true }),
    ).toBeInTheDocument()
    await user.click(saveButton())
    await waitFor(() =>
      expect(cloudServer.calls.useSetItemRecipesMutation).toEqual([
        {
          itemId: 'item-eggs',
          recipeIds: ['recipe-cake', 'recipe-omelette'],
        },
      ]),
    )
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees why the Save was refused when the item is not consumable any more, and the press is kept', async () => {
    const user = userEvent.setup()
    // Given a server that refuses the add: the item was turned off meanwhile
    cloudServer.results.useSetItemRecipesMutation = () => {
      throw notConsumableError()
    }
    renderPage()

    // When the user presses "Soup" and Save
    await user.click(await screen.findByRole('button', { name: 'Soup' }))
    await user.click(saveButton())

    // Then the write was sent, and a message says why nothing was saved
    expect(
      await screen.findByText(
        'An item here is no longer consumable, so it cannot be in a recipe or be cooked. Nothing was saved.',
      ),
    ).toBeInTheDocument()
    expect(cloudServer.calls.useSetItemRecipesMutation).toHaveLength(1)
    // And the press is kept, and Save is on again
    expect(
      screen.getByRole('button', { name: 'Soup', pressed: true }),
    ).toBeInTheDocument()
    await waitFor(() => expect(saveButton()).toBeEnabled())
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })
})
