import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createLocation } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
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
      history: createMemoryHistory({ initialEntries: ['/settings/locations'] }),
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

  it('user can create a location', async () => {
    // Given the locations page is open
    renderPage()
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByText('My Home')).toBeInTheDocument())

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

  it('default location renders with no delete control', async () => {
    // Given only the default location exists
    renderPage()

    // Then the default location is shown but has no delete button
    await waitFor(() => expect(screen.getByText('My Home')).toBeInTheDocument())
    expect(
      screen.queryByRole('button', { name: /delete my home/i }),
    ).not.toBeInTheDocument()
  })
})
