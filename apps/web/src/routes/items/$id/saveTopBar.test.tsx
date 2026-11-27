// Save is in the item page's top bar (owner decision 2026-11-25).
// Design: docs/features/items/2026-11-24-item-tabs-flat-design.md, part B,
// row 1: back, the item name, and the current tab's Save when it has one.
//
// The Info and Stock tabs render Save into the top bar with a portal
// (`ItemForm`'s `submitSlot`). It is a `<button type="submit" form="…">`
// linked to the form by the HTML `form` attribute, so it is NOT inside the
// form, and the form has no Save of its own any more.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem, getItem, getItemStock } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { DEFAULT_LOCATION_ID } from '@/types'

describe('Item page - Save in the top bar', { timeout: 15_000 }, () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.recipes.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.vendors.clear()
    await db.inventoryLogs.clear()
    await db.locations.where('id').notEqual(DEFAULT_LOCATION_ID).delete()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
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

  function makeMilk() {
    return createItem({
      name: 'Milk',
      packageUnit: 'bottle',
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
  }

  // The top bar is the row that holds the page heading (the item name).
  function expectInTopBar(save: HTMLElement) {
    const heading = screen.getByRole('heading', { level: 1, name: 'Milk' })
    const topBar = heading.parentElement
    expect(topBar).not.toBeNull()
    expect(topBar?.contains(save)).toBe(true)
    // Linked to the form by its `form` attribute, not by being inside it
    expect(save.closest('form')).toBeNull()
    const formId = save.getAttribute('form')
    expect(formId).toBeTruthy()
    expect(document.getElementById(formId ?? '')?.tagName).toBe('FORM')
    // And the form has no Save of its own
    expect(
      document.querySelectorAll('form button[type="submit"]'),
    ).toHaveLength(0)
  }

  it('user sees Save in the top bar of the Info tab, disabled while nothing changed', async () => {
    // Given an item
    const milk = await makeMilk()

    // When the user opens its Info tab
    renderPage(`/items/${milk.id}`)
    await screen.findByRole('textbox', { name: /^name/i })

    // Then Save is in the top bar, and disabled: the form is clean
    const save = screen.getByRole('button', { name: /^save$/i })
    expectInTopBar(save)
    expect(save).toBeDisabled()
  })

  it('user can save the Info tab with Save in the top bar', async () => {
    const user = userEvent.setup()
    // Given an item on its Info tab
    const milk = await makeMilk()
    renderPage(`/items/${milk.id}`)
    const name = await screen.findByRole('textbox', { name: /^name/i })

    // When the user renames it and presses the top bar's Save
    await user.clear(name)
    await user.type(name, 'Oat milk')
    const save = screen.getByRole('button', { name: /^save$/i })
    expect(save).toBeEnabled()
    await user.click(save)

    // Then the new name is saved
    await waitFor(async () => {
      expect((await getItem(milk.id))?.name).toBe('Oat milk')
    })
  })

  // Enter in a field is NOT tested here. user-event finds the button to
  // click with `form.querySelector(...)`, so it only sees a submit button
  // INSIDE the form, while a browser uses the first submit button whose form
  // owner is the form, the `form` attribute included (HTML "default button").
  // So the jsdom test fails against correct code. The E2E test "user can save
  // the Info tab by pressing Enter" in e2e/tests/item-management.spec.ts
  // checks it in a real browser.

  it('user can save the Stock tab with Save in the top bar', async () => {
    const user = userEvent.setup()
    // Given an item on its Stock tab
    const milk = await makeMilk()
    renderPage(`/items/${milk.id}/stock`)
    const packed = await screen.findByLabelText(/^packed/i)
    const save = screen.getByRole('button', { name: /^save$/i })
    expectInTopBar(save)
    expect(save).toBeDisabled()

    // When the user changes the packed quantity and presses Save
    await user.clear(packed)
    await user.type(packed, '5')
    expect(save).toBeEnabled()
    await user.click(save)

    // Then this location's stock is saved
    await waitFor(async () => {
      expect(
        (await getItemStock(milk.id, DEFAULT_LOCATION_ID))?.packedQuantity,
      ).toBe(5)
    })
  })

  // The tabs that are not an `ItemForm` render `TopBarSaveButton` into the
  // same slot (item relations Save, design
  // `docs/features/items/2026-11-27-item-relations-save-design.md`). It is a
  // plain `type="button"`: there is no form.
  it.each([
    ['Tags', 'tags'],
    ['Vendors', 'vendors'],
    ['Recipes', 'recipes'],
  ])('user sees the Save in the top bar on the %s tab, off until a press', async (label, path) => {
    const user = userEvent.setup()
    // Given an item on its Info tab
    const milk = await makeMilk()
    const router = renderPage(`/items/${milk.id}`)
    await screen.findByRole('textbox', { name: /^name/i })

    // When the user opens the tab
    await user.click(
      screen.getByRole('link', { name: new RegExp(`^${label}$`, 'i') }),
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/items/${milk.id}/${path}`),
    )

    // Then the top bar has a Save, off because nothing is pressed, and it
    // submits no form
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: /^name/i })).toBeNull(),
    )
    const save = await screen.findByRole('button', { name: /^save$/i })
    const heading = screen.getByRole('heading', { level: 1, name: 'Milk' })
    expect(heading.parentElement?.contains(save)).toBe(true)
    expect(save).toHaveAttribute('type', 'button')
    expect(save).not.toHaveAttribute('form')
    expect(save).toBeDisabled()
  })

  it.each([
    ['Log', 'log'],
  ])('user sees no Save on the %s tab', async (label, path) => {
    const user = userEvent.setup()
    // Given an item on its Info tab, where Save shows (present first)
    const milk = await makeMilk()
    const router = renderPage(`/items/${milk.id}`)
    await screen.findByRole('textbox', { name: /^name/i })
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()

    // When the user opens the tab
    await user.click(
      screen.getByRole('link', { name: new RegExp(`^${label}$`, 'i') }),
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/items/${milk.id}/${path}`),
    )

    // Then the top bar has no Save
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull(),
    )
  })
})
