import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createShelf } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

describe('Shelf Settings - Info Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.shelves.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    sessionStorage.clear()
  })

  const renderInfoTab = (shelfId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/shelves/${shelfId}`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <ApolloProvider client={noopApolloClient}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ApolloProvider>,
    )
  }

  it('save button is disabled when form is not dirty', async () => {
    // Given a shelf exists
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'filter',
      order: 0,
      filterConfig: { sortBy: 'name', sortDir: 'asc' },
    })

    renderInfoTab(shelf.id)

    // Then the Save button is disabled when form is clean (no changes made)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })
  })

  it('save button is disabled when name is empty', async () => {
    // Given a shelf exists
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'filter',
      order: 0,
      filterConfig: { sortBy: 'name', sortDir: 'asc' },
    })

    renderInfoTab(shelf.id)
    const user = userEvent.setup()

    // Wait until the form has loaded the shelf name into the input
    await waitFor(() => {
      expect(screen.getByLabelText('Shelf name')).toHaveValue('Fridge')
    })
    const nameInput = screen.getByLabelText('Shelf name')

    // When user clears the name field entirely (form becomes dirty but name is invalid)
    await user.clear(nameInput)
    expect(nameInput).toHaveValue('')

    // Then the Save button is disabled because name is invalid (empty)
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('shows required error when name is cleared', async () => {
    // Given a shelf exists
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'filter',
      order: 0,
      filterConfig: { sortBy: 'name', sortDir: 'asc' },
    })

    renderInfoTab(shelf.id)
    const user = userEvent.setup()

    // Wait until the form has loaded the shelf name into the input
    await waitFor(() => {
      expect(screen.getByLabelText('Shelf name')).toHaveValue('Fridge')
    })

    // When user clears the name field
    await user.clear(screen.getByLabelText('Shelf name'))
    expect(screen.getByLabelText('Shelf name')).toHaveValue('')

    // Then an inline required-field error is shown
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })

  it('save button is enabled when name is non-empty and form is dirty', async () => {
    // Given a shelf exists
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'filter',
      order: 0,
      filterConfig: { sortBy: 'name', sortDir: 'asc' },
    })

    renderInfoTab(shelf.id)
    const user = userEvent.setup()

    // When user changes the name to a non-empty value
    await waitFor(() => {
      expect(screen.getByLabelText('Shelf name')).toBeInTheDocument()
    })
    const nameInput = screen.getByLabelText('Shelf name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Freezer')

    // Then the Save button is enabled
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled()
  })

  it('user can save shelf with trimmed name', async () => {
    // Given a shelf exists
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'selection',
      order: 0,
      itemIds: [],
    })

    renderInfoTab(shelf.id)
    const user = userEvent.setup()

    // When user types a name with surrounding whitespace
    await waitFor(() => {
      expect(screen.getByLabelText('Shelf name')).toBeInTheDocument()
    })
    const nameInput = screen.getByLabelText('Shelf name')
    await user.clear(nameInput)
    await user.type(nameInput, '  Pantry  ')

    // And clicks Save
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the shelf is saved with the trimmed name
    await waitFor(async () => {
      const updated = await db.shelves.get(shelf.id)
      expect(updated?.name).toBe('Pantry')
    })
  })
})
