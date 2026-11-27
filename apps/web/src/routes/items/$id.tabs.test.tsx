// The item page's flat tab row (design 2026-11-24, part B):
// Info · Stock · Tags · Vendors · Recipes · Log, one level, and the old
// `/items/$id/relation/…` addresses redirecting to the new ones.
// Design: docs/features/items/2026-11-24-item-tabs-flat-design.md.
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
import { createItem } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

const TABS = [
  { name: 'Info', path: '' },
  { name: 'Stock', path: '/stock' },
  { name: 'Tags', path: '/tags' },
  { name: 'Vendors', path: '/vendors' },
  { name: 'Recipes', path: '/recipes' },
  { name: 'Log', path: '/log' },
] as const

describe('Item page - one flat tab row', { timeout: 15_000 }, () => {
  let queryClient: QueryClient
  let itemId: string

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const item = await createItem({
      name: 'Milk',
      targetUnit: 'package',
      consumeAmount: 1,
      tagIds: [],
    })
    itemId = item.id
  })

  function renderAt(...entries: string[]) {
    const history = createMemoryHistory({ initialEntries: entries })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  async function tabRow() {
    return within(
      await screen.findByRole('navigation', { name: 'Item sections' }),
    )
  }

  it('user sees the six tabs in one row, in order, each named', async () => {
    renderAt(`/items/${itemId}`)

    // Then the tab row lists the six tabs by name, in this order. The names
    // are what a screen reader says at every width: below `sm` the text is
    // visually hidden, not removed.
    const row = await tabRow()
    const links = row.getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(TABS.map((t) => t.name))
    expect(links.map((l) => l.getAttribute('href'))).toEqual(
      TABS.map((t) => `/items/${itemId}${t.path}`),
    )
    for (const tab of TABS) {
      expect(row.getByRole('link', { name: tab.name })).toBeInTheDocument()
    }
    // And no Relation level is left
    expect(
      screen
        .getAllByRole('link')
        .some((l) => l.getAttribute('href')?.includes('/relation')),
    ).toBe(false)
  })

  it('user sees the tab names hidden only on a phone width', async () => {
    renderAt(`/items/${itemId}`)

    // The label span is `sr-only` (phone) and `sm:not-sr-only` (wider), so a
    // phone shows the icon alone and keeps the accessible name.
    const row = await tabRow()
    for (const tab of TABS) {
      const label = row.getByText(tab.name)
      expect(label).toHaveClass('sr-only', 'sm:not-sr-only')
      expect(row.getByRole('link', { name: tab.name })).toContainElement(label)
    }
  })

  it('user can open each tab from the row, and the open tab is marked', async () => {
    const user = userEvent.setup()
    const router = renderAt(`/items/${itemId}`)
    const row = await tabRow()

    for (const tab of TABS) {
      // When the user clicks the tab
      await user.click(row.getByRole('link', { name: tab.name }))

      // Then its page opens and only that tab is marked as the current page
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(
          `/items/${itemId}${tab.path}`,
        ),
      )
      await waitFor(() =>
        expect(row.getByRole('link', { name: tab.name })).toHaveAttribute(
          'aria-current',
          'page',
        ),
      )
      const marked = row
        .getAllByRole('link')
        .filter((l) => l.getAttribute('aria-current') === 'page')
      expect(marked.map((l) => l.textContent)).toEqual([tab.name])
    }
  })

  it.each([
    ['/relation', '/tags'],
    ['/relation/tags', '/tags'],
    ['/relation/vendors', '/vendors'],
    ['/relation/recipes', '/recipes'],
  ])('user with an old link %s lands on %s, and Back skips the old address', async (oldPath, newPath) => {
    // Given the person came from the pantry and opens a saved old link
    const router = renderAt('/', `/items/${itemId}${oldPath}`)

    // Then the page is the new tab, with that tab marked
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/items/${itemId}${newPath}`),
    )
    const row = await tabRow()
    const tabName = TABS.find((t) => t.path === newPath)?.name ?? ''
    await waitFor(() =>
      expect(row.getByRole('link', { name: tabName })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    )

    // And Back goes to the page before, not to the old address (the redirect
    // replaced it in the history)
    router.history.back()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  // The Tags, Vendors and Recipes tabs are guarded too since the item
  // relations Save (design 2026-11-27). The dirty state of a tab that is gone
  // must not follow the person to the next tab.
  // These two tests pass WITHOUT the layout's reset effect in `$id.tsx`
  // (measured 2026-11-28): `ItemForm` mounts once more under the new path and
  // reports `false` first. The test that fails without the effect is in
  // `$id.dirtyReset.test.tsx`, with a tab that never reports `false`.
  it('user who discards an Info edit can leave the next tab with no dialog', async () => {
    const user = userEvent.setup()
    const router = renderAt(`/items/${itemId}`)
    const row = await tabRow()

    // Given an unsaved rename on the Info tab, discarded on the way to Tags
    const nameInput = await screen.findByRole('textbox', { name: /^name/i })
    await user.clear(nameInput)
    await user.type(nameInput, 'Oat milk')
    await user.click(row.getByRole('link', { name: 'Tags' }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Unsaved changes',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/items/${itemId}/tags`),
    )

    // When the user opens the Log tab
    await user.click(row.getByRole('link', { name: 'Log' }))

    // Then the page moves with no dialog: nothing on Tags is unsaved
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/items/${itemId}/log`),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('user who discards an Info edit can press Back on the next tab with no dialog', async () => {
    const user = userEvent.setup()
    const router = renderAt('/', `/items/${itemId}`)
    sessionStorage.setItem('app-navigation-history', JSON.stringify(['/']))
    const row = await tabRow()

    const nameInput = await screen.findByRole('textbox', { name: /^name/i })
    await user.clear(nameInput)
    await user.type(nameInput, 'Oat milk')
    await user.click(row.getByRole('link', { name: 'Recipes' }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Unsaved changes',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/items/${itemId}/recipes`),
    )

    // When the user presses Back
    await user.click(screen.getByRole('button', { name: /go back/i }))

    // Then the page goes back with no dialog
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
