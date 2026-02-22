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
import { createItem, createTag, createTagType } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { TagColor } from '@/types'

describe('Tag Detail - Info Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.tags.clear()
    await db.tagTypes.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    // Clear sessionStorage (used by useAppNavigation)
    sessionStorage.clear()
  })

  const renderInfoTab = (tagId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/tags/${tagId}`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can see the tag name in the heading', async () => {
    // Given a tag type and tag exist
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })

    renderInfoTab(tag.id)

    // Then the tag name is shown as the page heading
    await waitFor(() => {
      expect(screen.getByText('Dairy')).toBeInTheDocument()
    })
  })

  it('user can edit the tag name and save', async () => {
    // Given a tag exists
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })

    renderInfoTab(tag.id)
    const user = userEvent.setup()

    // When user clears the name field and types a new name
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
    })
    const nameInput = screen.getByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Milk Products')

    // When user clicks Save
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the tag name is updated in the database
    await waitFor(async () => {
      const updated = await db.tags.get(tag.id)
      expect(updated?.name).toBe('Milk Products')
    })
  })

  it('save button is disabled when name has not changed', async () => {
    // Given a tag exists
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })

    renderInfoTab(tag.id)

    // Then the Save button is disabled when form is clean
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })
  })

  it('user can navigate back with back button when navigation history exists', async () => {
    const user = userEvent.setup()

    // Given a tag
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Test Tag', typeId: tagType.id })

    // And navigation history exists (user came from tags list page)
    // Note: Include only the previous page, the current page will be added by useAppNavigation
    sessionStorage.setItem(
      'app-navigation-history',
      JSON.stringify(['/settings/tags']),
    )

    renderInfoTab(tag.id)

    await waitFor(() => {
      expect(screen.getByText('Test Tag')).toBeInTheDocument()
    })

    // When user clicks back button (now a button, not a link)
    const backButton = screen.getByRole('button', { name: /back/i })
    await user.click(backButton)

    // Then navigates back to previous page (tags list)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /tags/i })).toBeInTheDocument()
    })
  })

  it('user can navigate back after saving tag name', async () => {
    const user = userEvent.setup()

    // Given a tag
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Test Tag', typeId: tagType.id })

    // And navigation history exists (user came from tags list page)
    // Note: Include only the previous page, the current page will be added by useAppNavigation
    sessionStorage.setItem(
      'app-navigation-history',
      JSON.stringify(['/settings/tags']),
    )

    renderInfoTab(tag.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    })

    // When user changes tag name
    const nameInput = screen.getByLabelText(/name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Updated Tag')

    // And saves the form
    const saveButton = screen.getByRole('button', { name: /save/i })
    await user.click(saveButton)

    // Then navigates back to previous page (tags list)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /tags/i })).toBeInTheDocument()
    })
  })

  it('user sees discard dialog when navigating to Items tab with unsaved changes', async () => {
    const user = userEvent.setup()

    // Given a tag
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Test Tag', typeId: tagType.id })

    renderInfoTab(tag.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    })

    // When user changes tag name without saving
    const nameInput = screen.getByLabelText(/name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Changed Name')

    // And clicks the Items tab
    const itemsTab = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('href')?.includes('/items'))
    if (!itemsTab) throw new Error('Items tab not found')
    await user.click(itemsTab)

    // Then discard dialog appears
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /unsaved changes/i }),
      ).toBeInTheDocument()
      expect(screen.getByText(/discard changes/i)).toBeInTheDocument()
    })
  })

  it('user can cancel discard and keep changes', async () => {
    const user = userEvent.setup()

    // Given a tag with unsaved changes
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Test Tag', typeId: tagType.id })

    renderInfoTab(tag.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    })

    const nameInput = screen.getByLabelText(/name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Changed Name')

    // When user tries to navigate to Items tab
    const itemsTab = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('href')?.includes('/items'))
    if (!itemsTab) throw new Error('Items tab not found')
    await user.click(itemsTab)

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /unsaved changes/i }),
      ).toBeInTheDocument()
    })

    // And clicks Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Then dialog closes and changes are preserved
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /unsaved changes/i }),
      ).not.toBeInTheDocument()
    })
    expect(nameInput).toHaveValue('Changed Name')
  })

  it('user can confirm discard and lose changes', async () => {
    const user = userEvent.setup()

    // Given a tag with unsaved changes
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Test Tag', typeId: tagType.id })

    renderInfoTab(tag.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    })

    const nameInput = screen.getByLabelText(/name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Changed Name')

    // When user tries to navigate to Items tab
    const itemsTab = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('href')?.includes('/items'))
    if (!itemsTab) throw new Error('Items tab not found')
    await user.click(itemsTab)

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /unsaved changes/i }),
      ).toBeInTheDocument()
    })

    // And clicks Discard
    await user.click(screen.getByRole('button', { name: /discard/i }))

    // Then navigates to Items tab
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /unsaved changes/i }),
      ).not.toBeInTheDocument()
      // Should show Items tab content (search input)
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // And changes were not saved
    const dbTag = await db.tags.get(tag.id)
    expect(dbTag?.name).toBe('Test Tag')
  })

  it('user sees discard dialog when clicking back button with unsaved changes', async () => {
    const user = userEvent.setup()

    // Given a tag with unsaved changes
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Test Tag', typeId: tagType.id })

    renderInfoTab(tag.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    })

    const nameInput = screen.getByLabelText(/name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Changed Name')

    // When user clicks back button
    const backButton = screen.getByRole('button', { name: /back/i })
    await user.click(backButton)

    // Then discard dialog appears
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /unsaved changes/i }),
      ).toBeInTheDocument()
      expect(screen.getByText(/discard changes/i)).toBeInTheDocument()
    })
  })

  it('shows Tag not found when tag does not exist', async () => {
    // Given a non-existent tag ID
    renderInfoTab('non-existent-id')

    // Then shows not found message
    await waitFor(() => {
      expect(screen.getByText(/tag not found/i)).toBeInTheDocument()
    })
  })
})

describe('Tag Detail - Items Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemsTab = (tagId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/tags/${tagId}/items`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  const makeItem = (name: string, tagIds: string[] = []) =>
    createItem({
      name,
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds,
      vendorIds: [],
    })

  it('user can see all items in the checklist', async () => {
    // Given a tag type, tag, and two items
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(tag.id)

    // Then both items appear in the list
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeInTheDocument()
      expect(screen.getByLabelText('Eggs')).toBeInTheDocument()
    })
  })

  it('user can see already-assigned items as checked', async () => {
    // Given a tag and an item already assigned to it
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    await makeItem('Milk', [tag.id])
    await makeItem('Eggs')

    renderItemsTab(tag.id)

    // Then Milk's checkbox is checked and Eggs' is not
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeChecked()
      expect(screen.getByLabelText('Eggs')).not.toBeChecked()
    })
  })

  it('user can filter items by name', async () => {
    // Given a tag and two items
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(tag.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When user types "mil"
    await user.type(screen.getByPlaceholderText(/search items/i), 'mil')

    // Then only Milk is visible
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeInTheDocument()
      expect(screen.queryByLabelText('Eggs')).not.toBeInTheDocument()
    })
  })

  it('user can assign this tag to an item by clicking the checkbox', async () => {
    // Given a tag and an unassigned item
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    const item = await makeItem('Milk')

    renderItemsTab(tag.id)
    const user = userEvent.setup()

    // When user clicks the checkbox
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Milk'))

    // Then the item now has this tag assigned in the DB
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.tagIds).toContain(tag.id)
    })
  })

  it('user can remove this tag from an item by clicking the checkbox', async () => {
    // Given a tag already assigned to an item
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    const item = await makeItem('Milk', [tag.id])

    renderItemsTab(tag.id)
    const user = userEvent.setup()

    // When user unchecks the item
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeChecked()
    })
    await user.click(screen.getByLabelText('Milk'))

    // Then the tag is removed from the item in the DB
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.tagIds ?? []).not.toContain(tag.id)
    })
  })

  it('user can see other tags as badges on items', async () => {
    // Given a tag and an item with other tags
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })

    const otherTagType = await createTagType({
      name: 'Location',
      color: TagColor.green,
    })
    const otherTag = await createTag({
      name: 'Fridge',
      typeId: otherTagType.id,
    })

    await makeItem('Milk', [otherTag.id])

    renderItemsTab(tag.id)

    // Then the other tag appears as a badge
    await waitFor(() => {
      expect(screen.getByText('Fridge')).toBeInTheDocument()
    })
  })

  it('user can see a New button', async () => {
    // Given a tag
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)

    // Then a New button is visible
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
    })
  })

  it('user can open the inline input by clicking New', async () => {
    // Given a tag
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
    })

    // When user clicks New
    await user.click(screen.getByRole('button', { name: /new/i }))

    // Then an inline input appears
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/item name/i)).toBeInTheDocument()
    })
  })

  it('user can create an item by typing a name and pressing Enter', async () => {
    // Given a tag
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
    })

    // When user opens inline input, types a name, and presses Enter
    await user.click(screen.getByRole('button', { name: /new/i }))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/item name/i)).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText(/item name/i), 'Butter')
    await user.keyboard('{Enter}')

    // Then the new item appears in the list checked (assigned to tag)
    await waitFor(() => {
      expect(screen.getByLabelText('Butter')).toBeChecked()
    })

    const items = await db.items.toArray()
    const butter = items.find((i) => i.name === 'Butter')
    expect(butter?.tagIds).toContain(tag.id)
  })

  it('user can cancel inline creation by pressing Escape', async () => {
    // Given a tag with the inline input open
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /new/i }))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/item name/i)).toBeInTheDocument()
    })

    // When user presses Escape
    await user.keyboard('{Escape}')

    // Then the inline input closes and no item was created
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText(/item name/i),
      ).not.toBeInTheDocument()
    })
    const items = await db.items.toArray()
    expect(items).toHaveLength(0)
  })

  it('user cannot submit inline creation when the item name is empty', async () => {
    // Given a tag
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
    })

    // When user opens the inline input without typing
    await user.click(screen.getByRole('button', { name: /new/i }))

    // Then the Add item button is disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add item/i })).toBeDisabled()
    })
  })

  it('shows No items yet when there are no items', async () => {
    // Given a tag with no items
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)

    // Then shows empty state message
    await waitFor(() => {
      expect(screen.getByText(/no items yet/i)).toBeInTheDocument()
    })
  })

  it('shows no results message when search has no matches', async () => {
    // Given a tag with items
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(tag.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When user searches for non-existent item
    await user.type(screen.getByPlaceholderText(/search items/i), 'xyz')

    // Then shows no results message
    await waitFor(() => {
      expect(screen.getByText(/no items found/i)).toBeInTheDocument()
    })
  })
})

describe('Tag Detail - Tab Navigation', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.items.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderTagDetail = (_tagId: string, route: string) => {
    const history = createMemoryHistory({
      initialEntries: [route],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can navigate between Info and Items tabs', async () => {
    const user = userEvent.setup()

    // Given a tag
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })

    renderTagDetail(tag.id, `/settings/tags/${tag.id}`)

    // When on Info tab
    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    })

    // When user clicks Items tab
    const itemsTab = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('href')?.includes('/items'))
    if (!itemsTab) throw new Error('Items tab not found')
    await user.click(itemsTab)

    // Then shows Items tab content
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When user clicks Info tab
    const infoTab = screen.getAllByRole('link').find((link) => {
      const href = link.getAttribute('href')
      return href?.endsWith(tag.id) && !href?.includes('/items')
    })
    if (!infoTab) throw new Error('Info tab not found')
    await user.click(infoTab)

    // Then shows Info tab content
    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    })
  })
})
