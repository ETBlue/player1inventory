// The Info tab's Save waits for the two reads that decide whether the
// converted amounts dialog opens: the recipes and every location's stock row.
// Bug 2026-11-26, `docs/features/items/2026-11-26-bug-save-before-recipes-load.md`.
//
// Local mode, real Dexie. Two Dexie reads are made to never answer, one per
// test, so the screen can be checked while that read is still loading:
//
// | Read held | Hook | Why the save went wrong without the fix |
// |---|---|---|
// | `getRecipes` | `useRecipes` | 0 recipes counted: no recipe warning, no recipe amount converted on a unit switch |
// | `getItemStocks` | `useItemStocks` | 0 locations converted on a unit switch |
//
// `useItem` reads `getItem`, not `getItemStocks`, so the form is still on
// screen while the stock rows load. (In cloud it is not: see
// `index.cloud.test.tsx`.)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { createItem, createRecipe, getItem } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { DEFAULT_LOCATION_ID } from '@/types'

const held = vi.hoisted(() => ({ recipes: false, stocks: false }))

vi.mock('@/db/operations', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/db/operations')>()
  const never = () => new Promise<never>(() => {})
  return {
    ...original,
    getRecipes: (...args: Parameters<typeof original.getRecipes>) =>
      held.recipes ? never() : original.getRecipes(...args),
    getItemStocks: (...args: Parameters<typeof original.getItemStocks>) =>
      held.stocks ? never() : original.getItemStocks(...args),
  }
})

describe('Item info tab Save waits for recipes and stock — local mode', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    held.recipes = false
    held.stocks = false
    await db.items.clear()
    await db.itemStocks.clear()
    await db.recipes.clear()
    await db.locations.where('id').notEqual(DEFAULT_LOCATION_ID).delete()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  afterEach(() => {
    held.recipes = false
    held.stocks = false
  })

  // Flour tracked in grams, with opened stock, in a recipe. Every one of
  // the three outputs of `handleSubmit` would have something to say.
  const seed = async () => {
    const item = await createItem({
      name: 'Flour',
      tagIds: [],
      packageUnit: 'pack',
      measurementUnit: 'g',
      amountPerPackage: 500,
      targetUnit: 'measurement',
      consumeAmount: 100,
      targetQuantity: 1000,
      refillThreshold: 200,
      packedQuantity: 2,
      unpackedQuantity: 250,
    })
    await createRecipe({
      name: 'Bread',
      items: [{ itemId: item.id, defaultAmount: 200 }],
    })
    return item
  }

  const renderInfoTab = (itemId: string) => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [`/items/${itemId}`] }),
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user cannot save the Info tab while the recipes are still loading', async () => {
    const user = userEvent.setup()

    // Given the recipes read never answers
    const item = await seed()
    held.recipes = true
    renderInfoTab(item.id)
    await screen.findByDisplayValue('Flour')

    // When the user turns Consumable off (the form is now dirty)
    await user.click(screen.getByRole('switch', { name: /^consumable$/i }))

    // Then Save stays off, and a press opens no dialog and writes nothing
    const save = screen.getByRole('button', { name: /save/i })
    expect(save).toBeDisabled()
    await user.click(save)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect((await getItem(item.id))?.consumable).not.toBe(false)
    // And no error text shows while the read is only loading
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument()
  })

  it('user cannot save the Info tab while the stock rows are still loading', async () => {
    const user = userEvent.setup()

    // Given the per-location stock read never answers
    const item = await seed()
    held.stocks = true
    renderInfoTab(item.id)
    await screen.findByDisplayValue('Flour')

    // When the user switches tracking to packages (a unit switch)
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )

    // Then Save stays off, so no location is left in the old unit
    const save = screen.getByRole('button', { name: /save/i })
    expect(save).toBeDisabled()
    await user.click(save)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect((await getItem(item.id))?.targetUnit).toBe('measurement')
  })

  it('user cannot save a unit switch while the recipes are still loading', async () => {
    const user = userEvent.setup()

    // Given the recipes read never answers
    const item = await seed()
    held.recipes = true
    renderInfoTab(item.id)
    await screen.findByDisplayValue('Flour')

    // When the user switches tracking to packages (a unit switch)
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )

    // Then Save stays off, and a press opens no dialog and writes nothing,
    // so the recipe amount is not left in the old unit
    const save = screen.getByRole('button', { name: /save/i })
    expect(save).toBeDisabled()
    await user.click(save)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect((await getItem(item.id))?.targetUnit).toBe('measurement')
    // `getRecipes` is held, so read the row from Dexie directly
    const [recipe] = await db.recipes.toArray()
    expect(recipe?.items).toEqual([{ itemId: item.id, defaultAmount: 200 }])
  })

  it('user sees Save off in the unsaved-changes dialog while the recipes are still loading', async () => {
    const user = userEvent.setup()

    // Given the recipes read never answers, and an edit on the Info tab
    const item = await seed()
    held.recipes = true
    renderInfoTab(item.id)
    await screen.findByDisplayValue('Flour')
    await user.click(screen.getByRole('switch', { name: /^consumable$/i }))

    // When the user opens the Stock tab
    await user.click(screen.getByRole('link', { name: /^stock$/i }))
    const dialog = await screen.findByRole('alertdialog', {
      name: /unsaved changes/i,
    })

    // Then the dialog's Save is off too, and pressing it writes nothing
    const save = within(dialog).getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await user.click(save)
    expect((await getItem(item.id))?.consumable).not.toBe(false)
  })

  it('user can save once both reads have answered (control)', async () => {
    const user = userEvent.setup()

    // Given nothing is held
    const item = await seed()
    renderInfoTab(item.id)
    await screen.findByDisplayValue('Flour')

    // When the user turns Consumable off and saves
    await user.click(screen.getByRole('switch', { name: /^consumable$/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save/i })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the dialog opens with the recipe warning
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/1 recipe/i)
  })
})
