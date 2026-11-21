import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { createLocation } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { watchUnhandledRejections } from '@/test/unhandledRejections'
import { DEFAULT_LOCATION_ID } from '@/types'

describe('Settings locations page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.locations.clear()
    // Seed the default location (normally done by the populate hook on fresh DBs).
    const now = new Date()
    await db.locations.put({
      id: DEFAULT_LOCATION_ID,
      name: 'My Home',
      order: 0,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    })
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    sessionStorage.clear()
  })

  const renderPage = () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/settings/household/locations'],
      }),
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

  // /settings/household/locations is not a fullscreen page, so the desktop Sidebar mounts
  // its full-variant LocationSwitcher — which also renders the active location's
  // name. Scope name lookups to <main> so they hit the list, not the sidebar.
  const inMain = () => within(screen.getByRole('main'))

  it('user can create a location', async () => {
    // Given the locations page is open
    renderPage()
    const user = userEvent.setup()
    await waitFor(() =>
      expect(inMain().getByText('My Home')).toBeInTheDocument(),
    )

    // When the user opens the add dialog, types a name, and submits
    await user.click(screen.getByRole('button', { name: /add location/i }))
    const input = await screen.findByLabelText('Name')
    await user.type(input, 'Office')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    // Then the new location appears in the list
    expect(await screen.findByText('Office')).toBeInTheDocument()
    await waitFor(async () => {
      const all = await db.locations.toArray()
      expect(all.some((l) => l.name === 'Office')).toBe(true)
    })
  })

  it('user can rename a location', async () => {
    // Given a non-default location exists
    await createLocation('Office')
    renderPage()
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByText('Office')).toBeInTheDocument())

    // When the user clicks rename, changes the name, and saves
    await user.click(screen.getByRole('button', { name: /rename office/i }))
    const input = await screen.findByLabelText('Name')
    await user.clear(input)
    await user.type(input, 'Studio')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the renamed location is shown
    expect(await screen.findByText('Studio')).toBeInTheDocument()
  })

  it('user can delete a non-default location', async () => {
    // Given a non-default location exists
    await createLocation('Office')
    renderPage()
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByText('Office')).toBeInTheDocument())

    // When the user clicks delete and confirms
    await user.click(screen.getByRole('button', { name: /delete office/i }))
    const dialog = await screen.findByRole('alertdialog')
    // Confirm: AlertDialogAction renders common.delete = "Delete"
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }))

    // Then the location is removed
    await waitFor(() => {
      expect(screen.queryByText('Office')).not.toBeInTheDocument()
    })
  })

  it('user cannot delete or drag the default location in local mode', async () => {
    // Given the default location ("My Home", `isDefault: true`) and one other
    await createLocation('Office')
    renderPage()

    // Then the default location is shown but has no delete button and no
    // drag handle (a lock icon stands in its place), while the other location
    // has both. Local mode keeps its default location (households task 3.12
    // changes cloud only).
    await waitFor(() =>
      expect(inMain().getByText('My Home')).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('button', { name: /delete my home/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /drag to reorder my home/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /delete office/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /drag to reorder office/i }),
    ).toBeInTheDocument()
  })

  it('user sees no role text on the locations list in local mode', async () => {
    // Given the default location and one other. Local mode has one person
    // and no roles; `useHouseholdLocations()` still gives every local row
    // `myRole: 'organizer'`, so only the page's `showRoles` keeps the text
    // off the screen.
    await createLocation('Office')
    renderPage()
    await waitFor(() =>
      expect(inMain().getByText('Office')).toBeInTheDocument(),
    )

    // Then no row names a role, a missing role or a missing organizer
    for (const text of [
      'Organizer',
      'Participant',
      'Viewer',
      'No access',
      'No organizer',
    ]) {
      expect(inMain().queryByText(text)).not.toBeInTheDocument()
    }
  })

  it('user sees no link to a people page in local mode', async () => {
    // Given the default location and one other. Local mode has one person
    // and no people page (households H5c decision T41), so a name must not
    // link to `/settings/household/locations/$id`, which only redirects back.
    await createLocation('Office')
    renderPage()
    await waitFor(() =>
      expect(inMain().getByText('Office')).toBeInTheDocument(),
    )

    // Then no name in the list is a link
    expect(inMain().getByRole('list')).toBeInTheDocument()
    expect(within(inMain().getByRole('list')).queryAllByRole('link')).toEqual(
      [],
    )
  })

  // A failed save (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
  // Before the fix Add and Rename used `mutate` with no `onError`: the dialog
  // stayed open and nothing on screen said the save failed.
  it('user sees a message when creating a location fails', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given the locations page, and a database that refuses the new location
      renderPage()
      const user = userEvent.setup()
      await waitFor(() =>
        expect(inMain().getByText('My Home')).toBeInTheDocument(),
      )
      vi.spyOn(db.locations, 'add').mockRejectedValueOnce(
        new Error('disk full'),
      )

      // When the user adds a location named "Office"
      await user.click(screen.getByRole('button', { name: /add location/i }))
      await user.type(await screen.findByLabelText('Name'), 'Office')
      await user.click(screen.getByRole('button', { name: /^add$/i }))

      // Then a message says so, and the dialog keeps the name
      expect(
        await screen.findByText('Could not save the change. Please try again.'),
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Name')).toHaveValue('Office')
      expect(await db.locations.count()).toBe(1)
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })

  it('user sees a message when renaming a location fails', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given a location, and a database that refuses the write
      const office = await createLocation('Office')
      renderPage()
      const user = userEvent.setup()
      await waitFor(() =>
        expect(screen.getByText('Office')).toBeInTheDocument(),
      )
      vi.spyOn(db.locations, 'update').mockRejectedValueOnce(
        new Error('disk full'),
      )

      // When the user renames it to "Studio"
      await user.click(screen.getByRole('button', { name: /rename office/i }))
      const input = await screen.findByLabelText('Name')
      await user.clear(input)
      await user.type(input, 'Studio')
      await user.click(screen.getByRole('button', { name: /save/i }))

      // Then a message says so, and the dialog keeps the name
      expect(
        await screen.findByText('Could not save the change. Please try again.'),
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Name')).toHaveValue('Studio')
      expect((await db.locations.get(office.id))?.name).toBe('Office')
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })
})

// ── Households H7b task M.4: Sort by in local mode (owner decision O54-B) ──
//
// Local mode offers Name and Custom only, saved on the device in
// `localStorage['location-sort']`, with no Dexie change. The order is My
// Home, Cellar, Attic. By name it is Attic, Cellar, My Home.
describe('Settings locations page — Sort by in local mode', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    localStorage.removeItem('location-sort')
    await db.locations.clear()
    const now = new Date()
    await db.locations.bulkPut([
      {
        id: DEFAULT_LOCATION_ID,
        name: 'My Home',
        order: 0,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'loc-cellar',
        name: 'Cellar',
        order: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'loc-attic',
        name: 'Attic',
        order: 2,
        createdAt: now,
        updatedAt: now,
      },
    ])
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    sessionStorage.clear()
  })

  const renderPage = () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/settings/household/locations'],
      }),
      context: { queryClient },
    })
    return render(
      <ApolloProvider client={noopApolloClient}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ApolloProvider>,
    )
  }

  /** The names of the list in <main>, top to bottom. */
  async function listedNames() {
    const main = await screen.findByRole('main')
    const list = await within(main).findByRole('list')
    return within(list)
      .getAllByRole('listitem')
      .map(
        (r) =>
          ['My Home', 'Cellar', 'Attic'].find(
            (n) => within(r).queryByText(n) !== null,
          ) ?? '?',
      )
  }

  it('user sees Sort by with two choices only, on Custom, with drag handles', async () => {
    renderPage()
    const user = userEvent.setup()

    // Then the list is in the custom order, and can be dragged
    await waitFor(async () =>
      expect(await listedNames()).toEqual(['My Home', 'Cellar', 'Attic']),
    )
    expect(
      screen.getByRole('button', { name: 'Drag to reorder Cellar' }),
    ).toBeInTheDocument()

    // And the control offers Custom and Name only
    const control = screen.getByRole('combobox', { name: 'Sort by' })
    expect(control).toHaveTextContent('Custom')
    await user.click(control)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Custom',
      'Name',
    ])
  })

  it('user can sort locations by name, and it survives a reload', async () => {
    // Given the page in the custom order
    const first = renderPage()
    const user = userEvent.setup()
    await waitFor(async () =>
      expect(await listedNames()).toEqual(['My Home', 'Cellar', 'Attic']),
    )

    // When the user picks Name
    await user.click(screen.getByRole('combobox', { name: 'Sort by' }))
    await user.click(screen.getByRole('option', { name: 'Name' }))

    // Then the list is by name at once, with no drag handles
    await waitFor(async () =>
      expect(await listedNames()).toEqual(['Attic', 'Cellar', 'My Home']),
    )
    expect(
      screen.queryByRole('button', { name: /^Drag to reorder/ }),
    ).not.toBeInTheDocument()
    // And the choice is saved on the device, not in Dexie
    expect(localStorage.getItem('location-sort')).toBe('name')

    // When the page is opened again
    first.unmount()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    renderPage()

    // Then it is still by name
    await waitFor(async () =>
      expect(await listedNames()).toEqual(['Attic', 'Cellar', 'My Home']),
    )
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveTextContent(
      'Name',
    )
  })
})
