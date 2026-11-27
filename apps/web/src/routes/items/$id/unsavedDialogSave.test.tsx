// Save in the item page's unsaved-changes dialog (local mode).
// Design: docs/global/ui-polish/2026-11-25-unsaved-dialog-save-design.md.
//
// The dialog has Cancel · Discard · Save. Save runs the same save as the top
// bar Save and then goes where the user pressed. On the Info tab a save that
// needs the converted amounts dialog opens it ON TOP of the unsaved-changes
// dialog. The cloud tests (a held write, a failed write) are in
// `unsavedDialogSave.cloud.test.tsx`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
  addItemToLocation,
  createItem,
  createLocation,
  createRecipe,
  createTagType,
  getItem,
  getItemStock,
  getRecipes,
  upsertItemStock,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { DEFAULT_LOCATION_ID } from '@/types'

const UNSAVED = 'Unsaved changes'

describe(
  'Item page - Save in the unsaved-changes dialog (local)',
  { timeout: 15_000 },
  () => {
    let queryClient: QueryClient

    beforeEach(async () => {
      await db.items.clear()
      await db.itemStocks.clear()
      await db.recipes.clear()
      await db.tags.clear()
      await db.tagTypes.clear()
      await db.inventoryLogs.clear()
      await db.vendors.clear()
      await db.locations.where('id').notEqual(DEFAULT_LOCATION_ID).delete()
      queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      // The person came from the pantry, so Back goes to `/`
      sessionStorage.setItem('app-navigation-history', JSON.stringify(['/']))
    })

    function renderPage(path: string) {
      const router = createRouter({
        routeTree,
        history: createMemoryHistory({ initialEntries: ['/', path] }),
      })
      render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      )
      return router
    }

    const milk = () =>
      createItem({
        name: 'Milk',
        packageUnit: 'bottle',
        targetUnit: 'package',
        consumeAmount: 1,
        tagIds: [],
      })

    async function renameTo(
      user: ReturnType<typeof userEvent.setup>,
      name: string,
    ) {
      const nameInput = await screen.findByRole('textbox', { name: /^name/i })
      await user.clear(nameInput)
      if (name) await user.type(nameInput, name)
    }

    it('user can save from the dialog when leaving the Info tab by a tab', async () => {
      const user = userEvent.setup()
      // Given an item renamed on the Info tab, not saved
      const item = await milk()
      const router = renderPage(`/items/${item.id}`)
      await renameTo(user, 'Oat milk')

      // When the user opens the Stock tab and presses Save in the dialog
      await user.click(screen.getByRole('link', { name: /^stock$/i }))
      const dialog = await screen.findByRole('alertdialog', { name: UNSAVED })
      await user.click(within(dialog).getByRole('button', { name: 'Save' }))

      // Then the name is saved, the "Saved" message shows, and the page goes
      // to the Stock tab
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(`/items/${item.id}/stock`),
      )
      expect((await getItem(item.id))?.name).toBe('Oat milk')
      expect(await screen.findByText('Saved')).toBeInTheDocument()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('user can save from the dialog when pressing Back', async () => {
      const user = userEvent.setup()
      const item = await milk()
      const router = renderPage(`/items/${item.id}`)
      await renameTo(user, 'Oat milk')

      // When the user presses Back and Save in the dialog
      await user.click(screen.getByRole('button', { name: /go back/i }))
      const dialog = await screen.findByRole('alertdialog', { name: UNSAVED })
      await user.click(within(dialog).getByRole('button', { name: 'Save' }))

      // Then the name is saved and the page goes back to the pantry
      await waitFor(() => expect(router.state.location.pathname).toBe('/'))
      expect((await getItem(item.id))?.name).toBe('Oat milk')
    })

    it('user sees Save off in the dialog while a field has an error', async () => {
      const user = userEvent.setup()
      // Given an empty name: a field error
      const item = await milk()
      const router = renderPage(`/items/${item.id}`)
      await renameTo(user, '')

      // When the user opens the Stock tab
      await user.click(screen.getByRole('link', { name: /^stock$/i }))
      const dialog = await screen.findByRole('alertdialog', { name: UNSAVED })

      // Then Save is off and pressing it does nothing
      const save = within(dialog).getByRole('button', { name: 'Save' })
      expect(save).toBeDisabled()
      await user.click(save)
      expect(router.state.location.pathname).toBe(`/items/${item.id}`)
      expect((await getItem(item.id))?.name).toBe('Milk')
    })

    it('user can still cancel or discard, and Discard has the destructive look', async () => {
      const user = userEvent.setup()
      const item = await milk()
      const router = renderPage(`/items/${item.id}`)
      await renameTo(user, 'Oat milk')

      // Cancel: the dialog closes, the page and the typed name stay
      await user.click(screen.getByRole('link', { name: /^stock$/i }))
      let dialog = await screen.findByRole('alertdialog', { name: UNSAVED })
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() =>
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
      )
      expect(router.state.location.pathname).toBe(`/items/${item.id}`)
      expect(screen.getByRole('textbox', { name: /^name/i })).toHaveValue(
        'Oat milk',
      )

      // Discard: shown as destructive-outline, the page moves, nothing saved
      await user.click(screen.getByRole('link', { name: /^stock$/i }))
      dialog = await screen.findByRole('alertdialog', { name: UNSAVED })
      const discard = within(dialog).getByRole('button', { name: 'Discard' })
      expect(discard).toHaveClass('border-importance-destructive-background')
      expect(discard).toHaveClass('text-importance-destructive-foreground')
      await user.click(discard)
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(`/items/${item.id}/stock`),
      )
      expect((await getItem(item.id))?.name).toBe('Milk')
    })

    describe('the converted amounts dialog opens on top', () => {
      // An item used by a recipe at 1. Changing the amount per consume to 2
      // moves the recipe's amount to 2, so the save asks first.
      async function setUp(user: ReturnType<typeof userEvent.setup>) {
        const item = await milk()
        const recipe = await createRecipe({
          name: 'Pancakes',
          items: [{ itemId: item.id, defaultAmount: 1 }],
        })
        const router = renderPage(`/items/${item.id}`)
        const consumeInput = await screen.findByLabelText(/amount per consume/i)
        await waitFor(() => expect(consumeInput).toHaveValue(1))
        await user.clear(consumeInput)
        await user.type(consumeInput, '2')
        await user.click(screen.getByRole('link', { name: /^stock$/i }))
        const dialog = await screen.findByRole('alertdialog', {
          name: UNSAVED,
        })
        await user.click(within(dialog).getByRole('button', { name: 'Save' }))
        return { item, recipe, router }
      }

      it('user can confirm the converted amounts and then leave', async () => {
        const user = userEvent.setup()
        const { item, recipe, router } = await setUp(user)

        // Then the converted amounts dialog shows, and nothing moved yet
        const confirm = await screen.findByRole('alertdialog', {
          name: 'Update recipe amounts?',
        })
        expect(router.state.location.pathname).toBe(`/items/${item.id}`)

        // When the user confirms
        await user.click(
          within(confirm).getByRole('button', { name: /update & save/i }),
        )

        // Then the item and the recipe are saved, both dialogs close, and
        // the page goes to the Stock tab
        await waitFor(() =>
          expect(router.state.location.pathname).toBe(
            `/items/${item.id}/stock`,
          ),
        )
        expect((await getItem(item.id))?.consumeAmount).toBe(2)
        const saved = (await getRecipes()).find((r) => r.id === recipe.id)
        expect(saved?.items[0]?.defaultAmount).toBe(2)
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      })

      it('user who cancels the converted amounts is back in the unsaved-changes dialog', async () => {
        const user = userEvent.setup()
        const { item, router } = await setUp(user)
        const confirm = await screen.findByRole('alertdialog', {
          name: 'Update recipe amounts?',
        })

        // When the user cancels the converted amounts
        await user.click(
          within(confirm).getByRole('button', { name: 'Cancel' }),
        )

        // Then only that dialog closes: the unsaved-changes dialog shows
        // again with Save ready, nothing is saved, and the page stays
        const dialog = await screen.findByRole('alertdialog', {
          name: UNSAVED,
        })
        await waitFor(() =>
          expect(
            within(dialog).getByRole('button', { name: 'Save' }),
          ).toBeEnabled(),
        )
        expect(
          screen.queryByRole('alertdialog', { name: 'Update recipe amounts?' }),
        ).not.toBeInTheDocument()
        expect(router.state.location.pathname).toBe(`/items/${item.id}`)
        expect((await getItem(item.id))?.consumeAmount).toBe(1)
      })
    })

    it('user can save from the dialog when leaving the Stock tab by a tab', async () => {
      const user = userEvent.setup()
      // Given an item stocked here, with the packed amount changed
      const item = await milk()
      const router = renderPage(`/items/${item.id}/stock`)
      const packed = await screen.findByLabelText(/^packed/i)
      await user.clear(packed)
      await user.type(packed, '5')

      // When the user opens the Info tab and presses Save in the dialog
      await user.click(screen.getByRole('link', { name: /^info$/i }))
      const dialog = await screen.findByRole('alertdialog', { name: UNSAVED })
      await user.click(within(dialog).getByRole('button', { name: 'Save' }))

      // Then the stock is saved and the page goes to Info
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(`/items/${item.id}`),
      )
      expect(
        (await getItemStock(item.id, DEFAULT_LOCATION_ID))?.packedQuantity,
      ).toBe(5)
    })

    it('user can save from the dialog when paging to another location', async () => {
      const user = userEvent.setup()
      // Given an item stocked here and in a cabin
      const cabin = await createLocation('Cabin')
      const item = await milk()
      await addItemToLocation(item.id, cabin.id)
      await upsertItemStock(item.id, cabin.id, { packedQuantity: 7 })
      renderPage(`/items/${item.id}/stock`)

      // When the user changes this location's packed amount
      const packed = await screen.findByLabelText(/^packed/i)
      await user.clear(packed)
      await user.type(packed, '4')

      // And pages to the cabin and presses Save in the dialog
      await user.click(screen.getByRole('tab', { name: 'Cabin' }))
      const dialog = await screen.findByRole('alertdialog', { name: UNSAVED })
      await user.click(within(dialog).getByRole('button', { name: 'Save' }))

      // Then this location's stock is saved, and the page shows the cabin
      await waitFor(() =>
        expect(screen.getByRole('tab', { name: 'Cabin' })).toHaveAttribute(
          'aria-selected',
          'true',
        ),
      )
      expect(screen.getByLabelText(/^packed/i)).toHaveValue(7)
      expect(
        (await getItemStock(item.id, DEFAULT_LOCATION_ID))?.packedQuantity,
      ).toBe(4)
      expect((await getItemStock(item.id, cabin.id))?.packedQuantity).toBe(7)
    })

    // The Tags, Vendors and Recipes tabs (item relations Save, design
    // docs/features/items/2026-11-27-item-relations-save-design.md): a press
    // is unsaved until Save, and the dialog's Save is the tab's own Save.
    describe('the relation tabs', () => {
      it('user can save a recipe press from the dialog, and then the page moves', async () => {
        const user = userEvent.setup()
        // Given an item and a recipe without it
        const item = await milk()
        const pancakes = await createRecipe({ name: 'Pancakes' })
        const router = renderPage(`/items/${item.id}/recipes`)

        // When the user presses the recipe, opens the Log tab and presses
        // Save in the dialog
        await user.click(
          await screen.findByRole('button', { name: 'Pancakes' }),
        )
        await user.click(screen.getByRole('link', { name: /^log$/i }))
        const dialog = await screen.findByRole('alertdialog', { name: UNSAVED })
        await user.click(within(dialog).getByRole('button', { name: 'Save' }))

        // Then the recipe holds the item, and the page goes to the Log tab
        await waitFor(() =>
          expect(router.state.location.pathname).toBe(`/items/${item.id}/log`),
        )
        const saved = (await getRecipes()).find((r) => r.id === pancakes.id)
        expect(saved?.items.map((ri) => ri.itemId)).toEqual([item.id])
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      })

      it('user who discards keeps a tag created on the tab, not given to the item', async () => {
        const user = userEvent.setup()
        // Given an item and a tag type
        const item = await milk()
        await createTagType({ name: 'Category' })
        const router = renderPage(`/items/${item.id}/tags`)

        // When the user creates the tag "dairy" (shown as selected)
        await user.click(
          await screen.findByRole('button', { name: /new tag$/i }),
        )
        await user.type(screen.getByLabelText(/name/i), 'dairy')
        await user.click(screen.getByRole('button', { name: /^add tag$/i }))
        await screen.findByRole('button', { name: 'dairy', pressed: true })

        // And opens the Log tab and presses Discard in the dialog
        await user.click(screen.getByRole('link', { name: /^log$/i }))
        const dialog = await screen.findByRole('alertdialog', { name: UNSAVED })
        await user.click(
          within(dialog).getByRole('button', { name: 'Discard' }),
        )

        // Then the page moves, the tag exists (owner answer 1A), and the item
        // does not have it
        await waitFor(() =>
          expect(router.state.location.pathname).toBe(`/items/${item.id}/log`),
        )
        const tags = await db.tags.toArray()
        expect(tags.map((tag) => tag.name)).toEqual(['dairy'])
        expect((await getItem(item.id))?.tagIds).toEqual([])
      })
    })
  },
)
