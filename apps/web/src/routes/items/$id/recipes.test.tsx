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
import { createItem, createRecipe } from '@/db/operations'
import * as useRecipesModule from '@/hooks/useRecipes'
import { routeTree } from '@/routeTree.gen'
import { addRecipeWithOldLinks } from '@/test/oldRecipeLinks'
import { watchUnhandledRejections } from '@/test/unhandledRejections'
import type { Recipe, RecipeItem } from '@/types'

// The item Recipes tab, in local mode. Since the item relations Save
// (design `docs/features/items/2026-11-27-item-relations-save-design.md`) a
// badge press changes only the screen, and the top bar Save sends the WHOLE
// list on screen in one `setItemRecipes`. A recipe made with "New Recipe" is
// created at once with NO items and shown as selected, but only Save gives it
// the item (owner answer 1A). The cloud tests are in
// `relationSave.cloud.test.tsx` and `saveFailed.cloud.test.tsx`.
//
// `useCreateRecipe` and `useSetItemRecipes` each return a UNION of their two
// data-mode branches: local mode's TanStack `UseMutationResult`, and the
// cloud branch's hand-built `{ mutate, mutateAsync, isPending }`
// (src/hooks/useRecipes.ts). The stubs below build the cloud member.
type CreateRecipeInput = { name: string; items?: RecipeItem[] }
type MutateOptions = {
  onSuccess?: () => void
  onError?: (err: unknown) => void
}

const cloudCreateRecipe = ({
  mutate = vi.fn((_input: CreateRecipeInput, _options?: MutateOptions) =>
    Promise.resolve(),
  ),
  mutateAsync,
}: {
  mutate?: (input: CreateRecipeInput, options?: MutateOptions) => Promise<void>
  mutateAsync: (input: CreateRecipeInput) => Promise<Recipe | undefined>
}): ReturnType<typeof useRecipesModule.useCreateRecipe> =>
  ({
    mutate,
    mutateAsync,
    isPending: false,
  }) as unknown as ReturnType<typeof useRecipesModule.useCreateRecipe>

const pendingCloudSetItemRecipes = (): ReturnType<
  typeof useRecipesModule.useSetItemRecipes
> => ({
  mutate: () => Promise.resolve(),
  mutateAsync: () => Promise.resolve(undefined),
  isPending: true,
})

const toastError = vi.fn()
// The route tree renders sonner's `Toaster`, so the module stays real and
// only `toast.error` is replaced.
vi.mock('sonner', async (importOriginal) => {
  const original = await importOriginal<typeof import('sonner')>()
  return {
    ...original,
    toast: Object.assign(
      (...a: Parameters<typeof original.toast>) => original.toast(...a),
      original.toast,
      {
        error: (...args: unknown[]) => toastError(...args),
      },
    ),
  }
})

const SAVE_FAILED = 'Could not save the change. Please try again.'
const NOT_CONSUMABLE =
  'An item here is no longer consumable, so it cannot be in a recipe or be cooked. Nothing was saved.'

describe('Recipes Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.recipes.clear()
    toastError.mockReset()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderRecipesTab = (itemId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}/recipes`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  const saveButton = () => screen.getByRole('button', { name: /^save$/i })
  // `consumeAmount: 2`, so a new link's amount (the item's `consumeAmount`)
  // differs from the old tab's `0` and from the fallback `1`
  const makeTestItem = (overrides: { consumable?: boolean } = {}) =>
    createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 2,
      tagIds: [],
      ...overrides,
    })
  const itemIdsOf = async (recipeId: string) =>
    ((await db.recipes.get(recipeId))?.items ?? []).map((ri) => ri.itemId)

  it('user can see all recipes on the recipes tab', async () => {
    // Given an item and two recipes (neither contains the item)
    const item = await makeTestItem()
    await createRecipe({ name: 'Pasta Sauce' })
    await createRecipe({ name: 'Smoothie' })

    renderRecipesTab(item.id)

    // Then both recipe names appear as badges
    await waitFor(() => {
      expect(screen.getByText('Pasta Sauce')).toBeInTheDocument()
      expect(screen.getByText('Smoothie')).toBeInTheDocument()
    })
  })

  it('user can see assigned recipes highlighted', async () => {
    // Given a recipe that already contains the item
    const item = await makeTestItem()
    await createRecipe({
      name: 'Pasta Sauce',
      items: [{ itemId: item.id, defaultAmount: 0 }],
    })

    renderRecipesTab(item.id)

    // Then the recipe badge is pressed
    expect(
      await screen.findByRole('button', { name: 'Pasta Sauce', pressed: true }),
    ).toBeInTheDocument()
  })

  it('recipe badge has aria-pressed reflecting assigned state', async () => {
    // Given a recipe not assigned to the item
    const item = await makeTestItem()
    await createRecipe({ name: 'Pasta Sauce' })
    renderRecipesTab(item.id)
    const user = userEvent.setup()

    // Then the unassigned badge has aria-pressed="false"
    const badge = await screen.findByRole('button', {
      name: 'Pasta Sauce',
      pressed: false,
    })

    // When user presses it
    await user.click(badge)

    // Then the badge has aria-pressed="true"
    expect(badge).toHaveAttribute('aria-pressed', 'true')
  })

  it('user can assign a recipe to an item with a press and Save', async () => {
    // Given an item and a recipe that does not contain the item
    const item = await makeTestItem()
    const recipe = await createRecipe({ name: 'Pasta Sauce' })
    renderRecipesTab(item.id)
    const user = userEvent.setup()

    // When user presses the recipe badge
    await user.click(await screen.findByRole('button', { name: 'Pasta Sauce' }))

    // Then the badge is pressed and Save is on, but nothing is written yet
    expect(
      screen.getByRole('button', { name: 'Pasta Sauce', pressed: true }),
    ).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect((await db.recipes.get(recipe.id))?.items).toEqual([])

    // When user presses Save
    await user.click(saveButton())

    // Then the recipe holds the item with the item's consume amount, the
    // page says so, and Save is off again
    await waitFor(async () =>
      expect((await db.recipes.get(recipe.id))?.items).toEqual([
        { itemId: item.id, defaultAmount: 2 },
      ]),
    )
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await waitFor(() => expect(saveButton()).toBeDisabled())
  })

  it('user can unassign a recipe from an item with a press and Save', async () => {
    // Given a recipe that contains the item
    const item = await makeTestItem()
    const recipe = await createRecipe({
      name: 'Pasta Sauce',
      items: [{ itemId: item.id, defaultAmount: 0 }],
    })
    renderRecipesTab(item.id)
    const user = userEvent.setup()

    // When user presses the assigned recipe badge
    await user.click(
      await screen.findByRole('button', { name: 'Pasta Sauce', pressed: true }),
    )

    // Then it shows as not assigned, with the "No recipes assigned" hint
    expect(
      screen.getByRole('button', { name: 'Pasta Sauce', pressed: false }),
    ).toBeInTheDocument()
    expect(screen.getByText('No recipes assigned')).toBeInTheDocument()

    // When user presses Save
    await user.click(saveButton())

    // Then the item is removed from the recipe's items array
    await waitFor(async () => expect(await itemIdsOf(recipe.id)).toEqual([]))
  })

  it('user can add one recipe and remove another with one Save, and the other recipes keep the item', async () => {
    // Given the item in "Bread" and "Cake", and "Soup" without it. "Bread"
    // is not pressed, so a Save that sends only the changed recipes takes
    // the item out of it.
    const item = await makeTestItem()
    const bread = await createRecipe({
      name: 'Bread',
      items: [{ itemId: item.id, defaultAmount: 5 }],
    })
    const cake = await createRecipe({
      name: 'Cake',
      items: [{ itemId: item.id, defaultAmount: 3 }],
    })
    const soup = await createRecipe({ name: 'Soup' })
    const setSpy = vi.spyOn(useRecipesModule, 'useSetItemRecipes')
    renderRecipesTab(item.id)
    const user = userEvent.setup()

    // When the user presses "Soup" on and "Cake" off, then Save
    await user.click(await screen.findByRole('button', { name: 'Soup' }))
    await user.click(screen.getByRole('button', { name: 'Cake' }))
    await user.click(saveButton())

    // Then "Bread" keeps the item and its amount, "Soup" has it, and "Cake"
    // does not
    await waitFor(async () =>
      expect(await itemIdsOf(soup.id)).toEqual([item.id]),
    )
    expect((await db.recipes.get(bread.id))?.items).toEqual([
      { itemId: item.id, defaultAmount: 5 },
    ])
    expect(await itemIdsOf(cake.id)).toEqual([])
    expect(setSpy).toHaveBeenCalled()
    setSpy.mockRestore()
  })

  it('user who presses a recipe badge twice sees Save off again', async () => {
    // Given a recipe not assigned to the item
    const item = await makeTestItem()
    await createRecipe({ name: 'Pasta Sauce' })
    renderRecipesTab(item.id)
    const user = userEvent.setup()
    const badge = await screen.findByRole('button', { name: 'Pasta Sauce' })

    // When the user presses the badge, then presses it again
    await user.click(badge)
    expect(saveButton()).toBeEnabled()
    await user.click(badge)

    // Then the badge is back to not pressed, and there is nothing to save
    expect(badge).toHaveAttribute('aria-pressed', 'false')
    expect(saveButton()).toBeDisabled()
  })

  it('user can press a recipe badge with Enter and with Space', async () => {
    // Given two recipes not assigned to the item
    const item = await makeTestItem()
    await createRecipe({ name: 'Pasta Sauce' })
    await createRecipe({ name: 'Smoothie' })
    renderRecipesTab(item.id)
    const user = userEvent.setup()
    const sauce = await screen.findByRole('button', { name: 'Pasta Sauce' })
    const smoothie = screen.getByRole('button', { name: 'Smoothie' })

    // Then both can be reached with Tab
    expect(sauce).toHaveAttribute('tabindex', '0')
    expect(smoothie).toHaveAttribute('tabindex', '0')

    // When the user focuses one and presses Enter, then the other and Space
    sauce.focus()
    await user.keyboard('{Enter}')
    smoothie.focus()
    await user.keyboard(' ')

    // Then both are pressed, and Save is on
    expect(sauce).toHaveAttribute('aria-pressed', 'true')
    expect(smoothie).toHaveAttribute('aria-pressed', 'true')
    expect(saveButton()).toBeEnabled()
  })

  it('user can create a new recipe, see it selected, and give it the item with Save', async () => {
    // Given an item and no recipes
    const item = await makeTestItem()
    renderRecipesTab(item.id)
    const user = userEvent.setup()

    // When user adds a recipe named "My New Recipe"
    await user.click(await screen.findByRole('button', { name: /new recipe/i }))
    await user.type(await screen.findByLabelText(/name/i), 'My New Recipe')
    await user.click(screen.getByRole('button', { name: /add recipe/i }))

    // Then the recipe is created at once, and its badge shows as selected
    expect(
      await screen.findByRole('button', {
        name: 'My New Recipe',
        pressed: true,
      }),
    ).toBeInTheDocument()
    const newRecipe = (await db.recipes.toArray()).find(
      (r) => r.name === 'My New Recipe',
    )
    // But it was created with NO items, and Save is on
    expect(newRecipe?.items).toEqual([])
    expect(saveButton()).toBeEnabled()

    // When user presses Save
    await user.click(saveButton())

    // Then the new recipe has the item
    await waitFor(async () =>
      expect(await itemIdsOf(newRecipe?.id ?? '')).toEqual([item.id]),
    )
  })

  // The create uses `mutateAsync`, not `mutate`: the cloud `mutate` calls
  // `onSuccess` with no argument, so the tab could not learn the new id.
  // (These two replaced the pair that guarded the old `mutate` + `onSuccess`
  // path.)
  describe('the create waits for mutateAsync', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('dialog stays open while the create runs, closes when it answers, and the new recipe is in the draft', async () => {
      // Given a create that answers only when the test lets it, and a
      // `mutate` that must not be used
      let answer: (recipe: Recipe) => void = () => {}
      const mutate = vi.fn(
        (_input: CreateRecipeInput, _options?: MutateOptions) =>
          Promise.resolve(),
      )
      const mutateAsync = vi.fn(
        (_input: CreateRecipeInput) =>
          new Promise<Recipe | undefined>((resolve) => {
            answer = resolve
          }),
      )
      vi.spyOn(useRecipesModule, 'useCreateRecipe').mockReturnValue(
        cloudCreateRecipe({ mutate, mutateAsync }),
      )
      const item = await makeTestItem()
      renderRecipesTab(item.id)
      const user = userEvent.setup()

      // When user opens the dialog and adds "Cloud Recipe"
      await user.click(
        await screen.findByRole('button', { name: /new recipe/i }),
      )
      await user.type(await screen.findByLabelText(/name/i), 'Cloud Recipe')
      await user.click(screen.getByRole('button', { name: /add recipe/i }))

      // Then the create was sent with NO items, and the dialog is still open
      expect(mutateAsync).toHaveBeenCalledWith({
        name: 'Cloud Recipe',
        items: [],
      })
      expect(mutate).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // When the create answers with the new recipe
      const now = new Date()
      answer({
        id: 'recipe-new',
        name: 'Cloud Recipe',
        items: [],
        createdAt: now,
        updatedAt: now,
      })

      // Then the dialog closes, and there is something to save
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      )
      expect(saveButton()).toBeEnabled()
    })

    it('dialog stays open with the name when mutateAsync rejects', async () => {
      // Given a create that is refused
      vi.spyOn(useRecipesModule, 'useCreateRecipe').mockReturnValue(
        cloudCreateRecipe({
          mutateAsync: () => Promise.reject(new Error('refused')),
        }),
      )
      const item = await makeTestItem()
      renderRecipesTab(item.id)
      const user = userEvent.setup()

      // When user adds "Cloud Recipe"
      await user.click(
        await screen.findByRole('button', { name: /new recipe/i }),
      )
      await user.type(await screen.findByLabelText(/name/i), 'Cloud Recipe')
      await user.click(screen.getByRole('button', { name: /add recipe/i }))

      // Then a message shows, the dialog stays open with the name, and
      // there is nothing to save (the open dialog hides the page from the
      // accessibility tree, so the Save is found with `hidden`)
      await waitFor(() => expect(toastError).toHaveBeenCalledWith(SAVE_FAILED))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText(/name/i)).toHaveValue('Cloud Recipe')
      expect(
        screen.getByRole('button', { name: /^save$/i, hidden: true }),
      ).toBeDisabled()
    })
  })

  describe('loading state', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('user sees the Save loading and cannot press a badge while a Save runs', async () => {
      // Given: useSetItemRecipes is mocked to stay pending indefinitely
      vi.spyOn(useRecipesModule, 'useSetItemRecipes').mockReturnValue(
        pendingCloudSetItemRecipes(),
      )
      const item = await makeTestItem()
      await createRecipe({ name: 'Pasta Sauce' })
      renderRecipesTab(item.id)
      const user = userEvent.setup()

      // Then the Save shows a spinner and is off, and the badge is disabled
      const badge = await screen.findByRole('button', { name: 'Pasta Sauce' })
      expect(saveButton()).toBeDisabled()
      expect(saveButton().querySelector('.animate-spin')).not.toBeNull()
      expect(badge).toHaveAttribute('aria-disabled', 'true')

      // When the user presses the badge
      await user.click(badge)

      // Then nothing changes, and the badge has no spinner of its own
      expect(badge).toHaveAttribute('aria-pressed', 'false')
      expect(badge.querySelector('.animate-spin')).toBeNull()
    })
  })

  // A failed save (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
  // Before that fix a failed write showed nothing. Since the item relations
  // Save the write is the Save, and the presses stay on screen after it fails.
  it('user sees a message when the Save fails, and the press is kept', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given an item, a recipe, and a database that refuses the write
      const item = await makeTestItem()
      const recipe = await createRecipe({ name: 'Pasta Sauce' })
      vi.spyOn(db.recipes, 'update').mockRejectedValueOnce(
        new Error('disk full'),
      )
      const router = renderRecipesTab(item.id)
      const user = userEvent.setup()

      // When the user presses the recipe badge and Save
      await user.click(
        await screen.findByRole('button', { name: /pasta sauce/i }),
      )
      await user.click(saveButton())

      // Then a message says the change was not saved
      await waitFor(() => expect(toastError).toHaveBeenCalledWith(SAVE_FAILED))
      // And the page stays, the badge is still pressed, and Save is on again
      expect(router.state.location.pathname).toBe(`/items/${item.id}/recipes`)
      expect(
        screen.getByRole('button', { name: /pasta sauce/i, pressed: true }),
      ).toBeInTheDocument()
      await waitFor(() => expect(saveButton()).toBeEnabled())
      expect((await db.recipes.get(recipe.id))?.items).toEqual([])
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })

  // A failed create in the New Recipe dialog
  // (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
  it('user sees a message when creating a new recipe fails', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given an item, and a database that refuses the new recipe
      const item = await makeTestItem()
      vi.spyOn(db.recipes, 'add').mockRejectedValueOnce(new Error('disk full'))
      renderRecipesTab(item.id)
      const user = userEvent.setup()

      // When the user adds a recipe named "Soup"
      await user.click(
        await screen.findByRole('button', { name: /new recipe/i }),
      )
      await user.type(screen.getByLabelText(/name/i), 'Soup')
      await user.click(screen.getByRole('button', { name: /add recipe/i }))

      // Then a message says the change was not saved
      await waitFor(() => expect(toastError).toHaveBeenCalledWith(SAVE_FAILED))
      // And the dialog stays open with the name, and Add can be pressed again
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText(/name/i)).toHaveValue('Soup')
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /add recipe/i }),
        ).toBeEnabled(),
      )
      expect(await db.recipes.count()).toBe(0)
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })

  // Owner decision 2026-11-26: cooking is only for consumable items, so a
  // non-consumable item cannot join a recipe. An old link can be removed.
  describe('non-consumable item', () => {
    it('user cannot add a non-consumable item to a recipe from its recipes tab', async () => {
      // Given a non-consumable item and a recipe without it
      const cup = await makeTestItem({ consumable: false })
      const recipe = await createRecipe({ name: 'Tea' })

      renderRecipesTab(cup.id)
      const user = userEvent.setup()

      // Then the tab says why, the recipe badge is disabled and not in the
      // Tab order, and there is no New Recipe button
      expect(
        await screen.findByText(/not consumable, so it cannot be added/i),
      ).toBeInTheDocument()
      const badge = await screen.findByRole('button', { name: 'Tea' })
      expect(badge).toHaveAttribute('aria-disabled', 'true')
      expect(badge).not.toHaveAttribute('tabindex')
      expect(
        screen.queryByRole('button', { name: /new recipe/i }),
      ).not.toBeInTheDocument()

      // When the user presses the badge anyway
      await user.click(badge)

      // Then nothing changes and there is nothing to save
      expect(badge).toHaveAttribute('aria-pressed', 'false')
      expect(saveButton()).toBeDisabled()
      expect((await db.recipes.get(recipe.id))?.items).toHaveLength(0)
    })

    it('user can remove a non-consumable item from a recipe it is already in', async () => {
      // Given a recipe that already links the non-consumable item (an old
      // link, from before the rule: no write can make one any more)
      const cup = await makeTestItem({ consumable: false })
      const recipe = await addRecipeWithOldLinks({
        name: 'Tea',
        items: [{ itemId: cup.id, defaultAmount: 1 }],
      })

      renderRecipesTab(cup.id)
      const user = userEvent.setup()

      // When the user presses the assigned badge and Save
      const badge = await screen.findByRole('button', { name: 'Tea' })
      expect(badge).not.toHaveAttribute('aria-disabled')
      await user.click(badge)
      await user.click(saveButton())

      // Then the link is gone
      await waitFor(async () =>
        expect((await db.recipes.get(recipe.id))?.items).toHaveLength(0),
      )
    })

    it('user can undo a remove on a non-consumable item with the keyboard', async () => {
      // Given a recipe that already links the non-consumable item
      const cup = await makeTestItem({ consumable: false })
      await addRecipeWithOldLinks({
        name: 'Tea',
        items: [{ itemId: cup.id, defaultAmount: 1 }],
      })
      renderRecipesTab(cup.id)
      const user = userEvent.setup()
      const badge = await screen.findByRole('button', { name: 'Tea' })

      // When the user presses it off
      badge.focus()
      await user.keyboard('{Enter}')
      expect(badge).toHaveAttribute('aria-pressed', 'false')

      // Then the badge can still be pressed: the press would undo the remove
      expect(badge).not.toHaveAttribute('aria-disabled')
      expect(badge).toHaveAttribute('tabindex', '0')

      // When the user presses it back with Enter
      badge.focus()
      await user.keyboard('{Enter}')

      // Then the remove is undone, and there is nothing to save
      expect(badge).toHaveAttribute('aria-pressed', 'true')
      expect(saveButton()).toBeDisabled()
    })

    it('user who pressed a recipe on sees the press dropped when the item turns non-consumable', async () => {
      // Given a consumable item, and the user pressed "Tea" on
      const item = await makeTestItem()
      await createRecipe({ name: 'Tea' })
      renderRecipesTab(item.id)
      const user = userEvent.setup()
      await user.click(await screen.findByRole('button', { name: 'Tea' }))
      expect(saveButton()).toBeEnabled()

      // When the item turns non-consumable (another tab), and the item is
      // read again
      await db.items.update(item.id, { consumable: false })
      await queryClient.invalidateQueries({ queryKey: ['items'] })

      // Then the press is gone (the server would refuse it), and there is
      // nothing to save
      expect(
        await screen.findByText(/not consumable, so it cannot be added/i),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Tea' })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
      expect(saveButton()).toBeDisabled()
    })

    it('user sees why a Save was refused when the item turned non-consumable meanwhile, and the press is kept', async () => {
      const rejections = watchUnhandledRejections()
      try {
        // Given a consumable item, and the user pressed "Tea" on
        const item = await makeTestItem()
        const tea = await createRecipe({ name: 'Tea' })
        renderRecipesTab(item.id)
        const user = userEvent.setup()
        await user.click(await screen.findByRole('button', { name: 'Tea' }))

        // When the item turns non-consumable, but this page has not read it
        // again, and the user presses Save
        await db.items.update(item.id, { consumable: false })
        await user.click(saveButton())

        // Then a message says why nothing was saved
        await waitFor(() =>
          expect(toastError).toHaveBeenCalledWith(NOT_CONSUMABLE),
        )
        // And the press is kept, and the recipe is unchanged
        expect(
          screen.getByRole('button', { name: 'Tea', pressed: true }),
        ).toBeInTheDocument()
        await waitFor(() => expect(saveButton()).toBeEnabled())
        expect((await db.recipes.get(tea.id))?.items).toEqual([])
        await rejections.settle()
        expect(rejections.list).toEqual([])
      } finally {
        rejections.stop()
      }
    })
  })
})
