import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { createItem, createShelf } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { watchUnhandledRejections } from '@/test/unhandledRejections'

describe('Shelf Detail - Items Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.shelves.clear()
    await db.inventoryLogs.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemsTab = (shelfId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/household/shelves/${shelfId}/items`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  const makeShelf = (name = 'Test Shelf') =>
    createShelf({
      name,
      type: 'selection',
      order: 0,
      itemIds: [],
    })

  const makeItem = (name: string) =>
    createItem({
      name,
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [],
    })

  it('user can create an item by typing a name and pressing Enter', async () => {
    // Given: a selection shelf with no items
    const shelf = await makeShelf()
    renderItemsTab(shelf.id)
    const user = userEvent.setup()

    // When: user opens the search panel
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When: user types a new item name and presses Enter
    await user.type(screen.getByPlaceholderText(/search items/i), 'Butter')
    await user.keyboard('{Enter}')

    // Then: new item exists in DB
    await waitFor(async () => {
      const items = await db.items.toArray()
      const butter = items.find((i) => i.name === 'Butter')
      expect(butter).toBeDefined()
      // And it is created valid: consumeAmount 1, the single default
      // shared by every interactive create path (local and cloud).
      expect(butter?.consumeAmount).toBe(1)

      // And shelf.itemIds includes the new item's id
      const updatedShelf = await db.shelves.get(shelf.id)
      expect(updatedShelf?.itemIds).toContain(butter?.id)
    })

    // And item appears checked in list
    await waitFor(() => {
      expect(screen.getByLabelText('Remove Butter')).toBeChecked()
    })
  })

  it('user can create an item globally without stocking it in any location', async () => {
    // Given: a selection shelf with no items. This tab edits a global
    // item↔shelf relation, so creating from search must not touch
    // location-scoped stock (D3).
    const shelf = await makeShelf()
    renderItemsTab(shelf.id)
    const user = userEvent.setup()

    // When: user creates "Butter" from the search box
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText(/search items/i), 'Butter')
    await user.keyboard('{Enter}')

    // Then: the global Item exists and is attached to the shelf
    let butterId: string | undefined
    await waitFor(async () => {
      const items = await db.items.toArray()
      butterId = items.find((i) => i.name === 'Butter')?.id
      expect(butterId).toBeDefined()
      const updatedShelf = await db.shelves.get(shelf.id)
      expect(updatedShelf?.itemIds).toContain(butterId)
    })

    // And: no ItemStock row was written, in the active location or any other
    expect(await db.itemStocks.count()).toBe(0)
  })

  it('user sees create button when search has text and no exact item match', async () => {
    // Given: a selection shelf with one item named "Milk"
    const shelf = await makeShelf()
    const milk = await makeItem('Milk')
    await db.shelves.update(shelf.id, { itemIds: [milk.id] })

    renderItemsTab(shelf.id)
    const user = userEvent.setup()

    // When: user opens the search panel
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When: user types a partial match ("mil" matches "Milk" but is not an exact match)
    await user.type(screen.getByPlaceholderText(/search items/i), 'mil')

    // Then: the create button is visible (no exact match)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /create item/i }),
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Remove Milk')).toBeInTheDocument()
    })

    // When: user clears the input and types an exact match ("Milk")
    await user.clear(screen.getByPlaceholderText(/search items/i))
    await user.type(screen.getByPlaceholderText(/search items/i), 'Milk')

    // Then: the create button is NOT visible (exact match exists)
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /create item/i }),
      ).not.toBeInTheDocument()
      expect(screen.getByLabelText('Remove Milk')).toBeInTheDocument()
    })
  })

  it('user can create an item by clicking the create button in the search input', async () => {
    // Given: a selection shelf with no items
    const shelf = await makeShelf()
    renderItemsTab(shelf.id)
    const user = userEvent.setup()

    // When: user opens the search panel
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When: user types "Butter" and clicks the + create button inside the search input
    await user.type(screen.getByPlaceholderText(/search items/i), 'Butter')
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /create item/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /create item/i }))

    // Then: Butter appears in the list checked (assigned to shelf)
    await waitFor(() => {
      expect(screen.getByLabelText('Remove Butter')).toBeChecked()
    })
  })

  it('user sees the new item in the list after creating from search (search not cleared)', async () => {
    // Given: a selection shelf with no items
    const shelf = await makeShelf()
    renderItemsTab(shelf.id)
    const user = userEvent.setup()

    // When: user opens the search panel
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When: user types a name that has zero matches
    await user.type(
      screen.getByPlaceholderText(/search items/i),
      'brand new item',
    )
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /create item/i }),
      ).toBeInTheDocument()
    })

    // When: user clicks the create button
    await user.click(screen.getByRole('button', { name: /create item/i }))

    // Then: search input still contains the query (search is not cleared)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toHaveValue(
        'brand new item',
      )
    })

    // And: the new item appears in the list assigned to the shelf
    await waitFor(() => {
      expect(screen.getByLabelText('Remove brand new item')).toBeInTheDocument()
    })
  })

  it('user sees assigned items name-sorted regardless of the active location stock', async () => {
    // Given a selection shelf with two assigned items — Zucchini stocked here,
    // and Apple stocked ONLY at another location. useItems() joins the active
    // location, so Apple arrives as ZERO_STOCK with no stockId: the documented
    // stockId trap (lib/quantityUtils.ts). Under the old four-bucket sort a
    // bare isInactive() therefore sank Apple below Zucchini.
    const stockedHere = await makeItem('Zucchini')
    const stockedElsewhere = await createItem(
      {
        name: 'Apple',
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        tagIds: [],
        vendorIds: [],
      },
      'loc-other',
    )
    // And an unassigned item that sorts first alphabetically
    await makeItem('Almond')
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'selection',
      order: 0,
      itemIds: [stockedHere.id, stockedElsewhere.id],
    })

    // When: user views the items tab (default sort: name asc)
    renderItemsTab(shelf.id)

    // Then both assigned items come first, name-sorted — Apple is a normal
    // row despite not being stocked here — and the unassigned item follows
    await waitFor(() => {
      expect(screen.getByLabelText('Remove Apple')).toBeInTheDocument()
    })
    const links = screen.getAllByRole('link', {
      name: /zucchini|apple|almond/i,
    })
    const names = links.map((el) => el.textContent?.trim() ?? '')
    expect(names[0]).toMatch(/apple/i)
    expect(names[1]).toMatch(/zucchini/i)
    expect(names[2]).toMatch(/almond/i)
  })

  // A failed create from search
  // (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md). Before
  // the fix the catch kept the typed name but showed nothing.
  it('user sees a message when creating an item from search fails', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given a selection shelf, and a database that refuses the new item
      const shelf = await makeShelf()
      renderItemsTab(shelf.id)
      vi.spyOn(db.items, 'add').mockRejectedValueOnce(new Error('disk full'))
      const user = userEvent.setup()

      // When the user types a new name and presses Enter
      await user.click(
        await screen.findByRole('button', { name: /toggle search/i }),
      )
      await user.type(
        await screen.findByPlaceholderText(/search items/i),
        'Butter',
      )
      await user.keyboard('{Enter}')

      // Then a message says the change was not saved
      expect(
        await screen.findByText('Could not save the change. Please try again.'),
      ).toBeInTheDocument()
      // And the typed name is kept, so the user can try again
      expect(screen.getByPlaceholderText(/search items/i)).toHaveValue('Butter')
      expect(await db.items.count()).toBe(0)
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })

  // A failed save (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
  // Before the fix the write had a try/finally with no catch: an unhandled
  // rejection, and nothing on screen said the change was not saved.
  it('user sees a message when adding an item to the shelf fails', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given a selection shelf and an item, and a database that refuses the write
      const shelf = await makeShelf()
      await makeItem('Milk')
      renderItemsTab(shelf.id)
      vi.spyOn(db.shelves, 'update').mockRejectedValueOnce(
        new Error('disk full'),
      )
      const user = userEvent.setup()

      // When the user checks the item
      await user.click(await screen.findByLabelText('Add Milk'))

      // Then a message says the change was not saved
      expect(
        await screen.findByText('Could not save the change. Please try again.'),
      ).toBeInTheDocument()
      // And the row is unchanged and can be pressed again
      await waitFor(() =>
        expect(screen.getByLabelText('Add Milk')).toBeEnabled(),
      )
      expect(screen.getByLabelText('Add Milk')).not.toBeChecked()
      expect((await db.shelves.get(shelf.id))?.itemIds).toEqual([])
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })
})
