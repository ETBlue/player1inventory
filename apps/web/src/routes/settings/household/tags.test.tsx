import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { createTag, createTagType } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { elementAt } from '@/test/narrow'
import { watchUnhandledRejections } from '@/test/unhandledRejections'
import { TagColor } from '@/types/index'

describe('Tag settings page - context-aware back navigation', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    sessionStorage.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderTagSettingsPage = (initialPath = '/settings/household/tags') => {
    const history = createMemoryHistory({ initialEntries: [initialPath] })
    const router = createRouter({ routeTree, history })

    render(
      <ApolloProvider client={noopApolloClient}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ApolloProvider>,
    )

    return router
  }

  it('user can navigate back to /settings when no navigation history exists', async () => {
    // Given tag settings page with no navigation history
    const router = renderTagSettingsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })

    // When user clicks back button (ArrowLeft icon button)
    const allButtons = screen.getAllByRole('button')
    // First button is the back button
    const backButton = elementAt(allButtons, 0)
    await user.click(backButton)

    // Then navigates to settings page
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/settings')
    })
  })

  it('user can navigate back to /shopping when coming from shopping page', async () => {
    // Given navigation history: shopping -> tags
    sessionStorage.setItem(
      'app-navigation-history',
      JSON.stringify(['/shopping', '/settings/household/tags']),
    )

    const router = renderTagSettingsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })

    // When user clicks back button
    const allButtons = screen.getAllByRole('button')
    // First button is the back button
    const backButton = elementAt(allButtons, 0)
    await user.click(backButton)

    // Then navigates back to shopping page
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/shopping')
    })
  })

  it('user can navigate back to / (pantry) when coming from pantry page', async () => {
    // Given navigation history: pantry -> tags
    sessionStorage.setItem(
      'app-navigation-history',
      JSON.stringify(['/', '/settings/household/tags']),
    )

    const router = renderTagSettingsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })

    // When user clicks back button
    const allButtons = screen.getAllByRole('button')
    // First button is the back button
    const backButton = elementAt(allButtons, 0)
    await user.click(backButton)

    // Then navigates back to pantry page
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
  })
})

describe('Tags List Page - Database Operations', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    sessionStorage.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  it('tag type can be updated in database', async () => {
    // Given two tag types with tags
    const type1 = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const type2 = await createTagType({
      name: 'Location',
      color: TagColor.green,
    })
    const tag = await createTag({ name: 'Organic', typeId: type1.id })

    const history = createMemoryHistory({
      initialEntries: ['/settings/household/tags'],
    })
    const router = createRouter({ routeTree, history })

    render(
      <ApolloProvider client={noopApolloClient}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ApolloProvider>,
    )

    // Wait for page to load
    await waitFor(() => {
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })

    // When tag type is updated in database
    await db.tags.update(tag.id, { typeId: type2.id })

    // Then tag is moved to new type in database
    const updatedTag = await db.tags.get(tag.id)
    expect(updatedTag?.typeId).toBe(type2.id)

    // Note: Testing the full drag-and-drop UI interaction would require
    // @dnd-kit testing utilities or manual event simulation.
    // The drag-and-drop UX will be verified in Task 7 manual testing.
  })
})

// A failed save (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
// Before the fix the three dialogs below used `mutate` with no `onError`, and
// the Add Tag dialog closed before the write ended, so the name was lost.
describe('Tag settings page - a failed save', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderPage = () => {
    const history = createMemoryHistory({
      initialEntries: ['/settings/household/tags'],
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

  it('user sees a message when creating a tag type fails', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given the tags page, and a database that refuses the new tag type
      renderPage()
      vi.spyOn(db.tagTypes, 'add').mockRejectedValueOnce(new Error('disk full'))
      const user = userEvent.setup()

      // When the user creates a tag type named "Storage"
      await user.click(
        await screen.findByRole('button', { name: 'New Tag Type' }),
      )
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText(/name/i), 'Storage')
      await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

      // Then a message says the change was not saved
      expect(
        await screen.findByText('Could not save the change. Please try again.'),
      ).toBeInTheDocument()
      // And the dialog stays open with the name
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(within(dialog).getByLabelText(/name/i)).toHaveValue('Storage')
      expect(await db.tagTypes.count()).toBe(0)
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })

  it('user sees a message when creating a tag fails', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given a tag type, and a database that refuses the new tag
      await createTagType({ name: 'Produce', color: TagColor.green })
      renderPage()
      vi.spyOn(db.tags, 'add').mockRejectedValueOnce(new Error('disk full'))
      const user = userEvent.setup()

      // When the user adds a tag named "Apples"
      await user.click(
        await screen.findByRole('button', { name: /^new tag$/i }),
      )
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText(/name/i), 'Apples')
      await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

      // Then a message says the change was not saved
      expect(
        await screen.findByText('Could not save the change. Please try again.'),
      ).toBeInTheDocument()
      // And the dialog stays open with the name, and Save can be pressed again
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(within(dialog).getByLabelText(/name/i)).toHaveValue('Apples')
      await waitFor(() =>
        expect(
          within(dialog).getByRole('button', { name: /^save$/i }),
        ).toBeEnabled(),
      )
      expect(await db.tags.count()).toBe(0)
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })

  it('user sees a message when renaming a tag type fails', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given a tag type, and a database that refuses the write
      const tagType = await createTagType({
        name: 'Produce',
        color: TagColor.green,
      })
      renderPage()
      vi.spyOn(db.tagTypes, 'update').mockRejectedValueOnce(
        new Error('disk full'),
      )
      const user = userEvent.setup()

      // When the user renames it to "Fruit"
      await user.click(await screen.findByRole('button', { name: /^edit$/i }))
      const dialog = await screen.findByRole('dialog')
      const input = within(dialog).getByLabelText(/name/i)
      await user.clear(input)
      await user.type(input, 'Fruit')
      await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

      // Then a message says the change was not saved
      expect(
        await screen.findByText('Could not save the change. Please try again.'),
      ).toBeInTheDocument()
      // And the dialog stays open with the name
      expect(within(dialog).getByLabelText(/name/i)).toHaveValue('Fruit')
      expect((await db.tagTypes.get(tagType.id))?.name).toBe('Produce')
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })
})
