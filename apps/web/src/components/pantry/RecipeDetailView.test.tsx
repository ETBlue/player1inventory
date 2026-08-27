import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { createItem, createRecipe } from '@/db/operations'
import { ACTIVE_LOCATION_STORAGE_KEY } from '@/hooks/useActiveLocation'
import { renderWithRouter } from '@/test/utils'
import { DEFAULT_LOCATION_ID } from '@/types'
import { RecipeDetailView } from './RecipeDetailView'

// `useUpdateItem` is replaced by a spy so the assertion can read the exact
// `{ id, updates }` payload the view builds — what is under test is the view's
// forwarding of the dialog's `onSubmit` fields, not what Dexie does afterwards.
const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }))

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>()
  return {
    ...actual,
    useUpdateItem: () => ({ mutateAsync, mutate: vi.fn(), isPending: false }),
  }
})

// A gate on `getRecipes` — the query behind `useRecipes()`, which is where the
// view reads `recipe.items` from. Holding a REFETCH open (the gate stays off
// until a test turns it on, so the initial load is untouched) is what makes
// "the invalidation has not landed yet" an observable state rather than a
// millisecond nobody can assert on.
const { recipesGate } = vi.hoisted(() => ({
  recipesGate: {
    hold: false,
    release: null as null | (() => void),
  },
}))

vi.mock('@/db/operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/operations')>()
  return {
    ...actual,
    getRecipes: async () => {
      if (recipesGate.hold) {
        await new Promise<void>((resolve) => {
          recipesGate.release = resolve
        })
      }
      return actual.getRecipes()
    },
  }
})

// The stored values are deliberately different from the submitted ones, and all
// four submitted values differ from each other. A view that forwards the item's
// stored target/refill, drops a field, or swaps the two therefore cannot pass.
const STORED = {
  packedQuantity: 1,
  unpackedQuantity: 0,
  targetQuantity: 6,
  refillThreshold: 2,
}
const SUBMITTED = {
  packedQuantity: 3,
  unpackedQuantity: 1,
  targetQuantity: 7,
  refillThreshold: 4,
}

const stockMilk = () =>
  createItem(
    {
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      packageUnit: 'bottle',
      consumeAmount: 1,
      ...STORED,
    },
    DEFAULT_LOCATION_ID,
  )

// Opens the quick-update dialog on Milk, moves all four fields off their stored
// values via the steppers, then presses Update.
async function quickUpdateMilk(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: 'Update quantity of Milk' }),
  )
  const dialog = await screen.findByRole('dialog')
  const press = async (label: string, times: number) => {
    for (let i = 0; i < times; i++) {
      await user.click(within(dialog).getByRole('button', { name: label }))
    }
  }
  await press('Increase packed', 2) // 1 -> 3
  await press('Increase unpacked', 1) // 0 -> 1
  await press('Increase target quantity', 1) // 6 -> 7
  await press('Increase refill threshold', 2) // 2 -> 4
  await user.click(within(dialog).getByRole('button', { name: 'Update' }))
}

describe('RecipeDetailView quick update', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.shelves.clear()
    await db.recipes.clear()
    await db.vendors.clear()
    await db.locations.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    localStorage.clear()
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
    mutateAsync.mockReset()
    mutateAsync.mockResolvedValue(undefined)
  })

  it('user can edit target and refill from a recipe page and have all four stock fields saved', async () => {
    // Given a recipe using an item with target 6 / refill 2
    const milk = await stockMilk()
    const recipe = await createRecipe({
      name: 'Pancakes',
      items: [{ itemId: milk.id, defaultAmount: 1 }],
    })
    const user = userEvent.setup()
    await renderWithRouter(<RecipeDetailView recipeId={recipe.id} />)

    // When the user raises every field in the quick-update dialog and submits
    await quickUpdateMilk(user)

    // Then all four fields reach the update mutation with the edited values
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync).toHaveBeenCalledWith({
      id: milk.id,
      updates: SUBMITTED,
    })
  })

  it('user can edit the due date from a recipe page when the item is in date mode', async () => {
    // Given a recipe using an item in date mode with a stored due date
    const milk = await createItem(
      {
        name: 'Milk',
        tagIds: [],
        targetUnit: 'package',
        packageUnit: 'bottle',
        consumeAmount: 1,
        expirationMode: 'date',
        dueDate: new Date('2026-09-01'),
        ...STORED,
      },
      DEFAULT_LOCATION_ID,
    )
    const recipe = await createRecipe({
      name: 'Pancakes',
      items: [{ itemId: milk.id, defaultAmount: 1 }],
    })
    const user = userEvent.setup()
    await renderWithRouter(<RecipeDetailView recipeId={recipe.id} />)

    // When the user opens the dialog, edits the due date, and presses Update
    await user.click(
      await screen.findByRole('button', { name: 'Update quantity of Milk' }),
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/expires on/i), {
      target: { value: '2026-10-15' },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Update' }))

    // Then the mutation receives the edited due date alongside the untouched
    // stored quantities — proving the view forwards `dueDate` through rather
    // than dropping it on the way to `updateItem.mutateAsync`.
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync).toHaveBeenCalledWith({
      id: milk.id,
      updates: { ...STORED, dueDate: new Date('2026-10-15') },
    })
  })
})

// Renders the view with a search already in the URL, so the tail is on without
// driving the toolbar's search toggle. `renderWithRouter` is pinned to '/'.
const renderSearching = async (recipeId: string, query: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = () => (
    <QueryClientProvider client={queryClient}>
      <RecipeDetailView recipeId={recipeId} />
    </QueryClientProvider>
  )
  const rootRoute = createRootRoute({ component: Wrapper })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: [`/?q=${encodeURIComponent(query)}`],
    }),
  })
  render(<RouterProvider router={router} />)
  await router.load()
}

describe('RecipeDetailView search tail', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.shelves.clear()
    await db.recipes.clear()
    await db.vendors.clear()
    await db.locations.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    localStorage.clear()
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
    recipesGate.hold = false
    recipesGate.release = null
  })

  it('user cannot press the group action again until its refetch lands', async () => {
    // Given an empty recipe and Milk stocked here — so Milk is a bucket-2 row
    // carrying a live "Add to recipe" button
    const milk = await stockMilk()
    const recipe = await createRecipe({ name: 'Pancakes', items: [] })
    await renderSearching(recipe.id, 'Milk')

    const label = 'Add to recipe: Milk'
    expect(await screen.findByRole('button', { name: label })).toBeEnabled()

    // When the user presses it while the `['recipes']` refetch is held open
    recipesGate.hold = true
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: label }))
    })
    // The write has committed and `onSuccess` has fired — the refetch it kicked
    // off is now sitting on the gate.
    await waitFor(() => expect(recipesGate.release).not.toBeNull())
    // Everything already resolvable resolves. Without the returned
    // invalidation, THIS is where `mutateAsync` settles and the wiring hook's
    // `finally` re-enables the row against a `recipe.items` that still has no
    // Milk in it — which is the regression this test exists to catch.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Then the button is still disabled — the mutation has not resolved,
    // because the list it feeds has not caught up yet
    expect(screen.getByRole('button', { name: label })).toBeDisabled()
    expect((await db.recipes.get(recipe.id))?.items).toHaveLength(1)

    // When the refetch lands
    await act(async () => {
      recipesGate.release?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Then Milk has moved out of the tail and into the recipe's own list
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: label })).toBeNull()
    })
    expect(
      screen.getByRole('button', { name: `Update quantity of ${milk.name}` }),
    ).toBeInTheDocument()
  })
})
