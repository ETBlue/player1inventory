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
import { createItem, createTag, createTagType } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { watchUnhandledRejections } from '@/test/unhandledRejections'
import { TagColor } from '@/types'

// The item Tags tab, in local mode. Since the item relations Save (design
// `docs/features/items/2026-11-27-item-relations-save-design.md`) a badge
// press changes only the screen, and the top bar Save writes the list. A tag
// made with "New Tag" is created at once and shown as selected, but only Save
// gives it to the item (owner answer 1A). The cloud tests are in
// `createAssign.cloud.test.tsx`, `relationSave.cloud.test.tsx` and
// `saveFailed.cloud.test.tsx`.

const SAVE_FAILED = 'Could not save the change. Please try again.'

function renderTagsTab(itemId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const history = createMemoryHistory({
    initialEntries: [`/items/${itemId}/tags`],
  })
  const router = createRouter({ routeTree, history })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function saveButton() {
  return screen.getByRole('button', { name: /^save$/i })
}

async function makeTestItem(tagIds: string[] = []) {
  return createItem({
    name: 'Test Item',
    tagIds,
    targetQuantity: 2,
    refillThreshold: 1,
  })
}

describe('Tags Tab', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
  })

  it('user can create a new tag, see it selected, and give it to the item with Save', async () => {
    const user = userEvent.setup()
    // Given an item and a tag type with no tags
    const tagType = await createTagType({
      name: 'categories',
      color: TagColor.blue,
    })
    const item = await makeTestItem()
    renderTagsTab(item.id)

    // When the user adds a tag named "dairy"
    expect(await screen.findByText(/categories/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /new tag/i }))
    await user.type(screen.getByLabelText(/name/i), 'dairy')
    await user.click(screen.getByRole('button', { name: /^add tag$/i }))

    // Then the tag is created at once, and its badge shows as selected
    const badge = await screen.findByRole('button', {
      name: 'dairy',
      pressed: true,
    })
    const newTag = (await db.tags.toArray()).find(
      (t) => t.name === 'dairy' && t.typeId === tagType.id,
    )
    expect(newTag).toBeDefined()
    // But the item does not have it yet, and Save is on
    expect((await db.items.get(item.id))?.tagIds).toEqual([])
    expect(saveButton()).toBeEnabled()

    // When the user presses Save
    await user.click(saveButton())

    // Then the item has the new tag, the page says so, and Save is off again
    await waitFor(async () =>
      expect((await db.items.get(item.id))?.tagIds).toEqual([newTag?.id]),
    )
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(badge).toHaveAttribute('aria-pressed', 'true')
  })

  it('user can add a new tag from item tags page', async () => {
    const user = userEvent.setup()
    // Given an item and a tag type with no tags
    await createTagType({ name: 'categories', color: TagColor.blue })
    const item = await makeTestItem()
    renderTagsTab(item.id)

    // When user adds a tag named "dairy"
    expect(await screen.findByText(/categories/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /new tag/i }))
    await user.type(screen.getByLabelText(/name/i), 'dairy')
    await user.click(screen.getByRole('button', { name: /^add tag$/i }))

    // Then the new tag appears in the list
    expect(await screen.findByText('dairy')).toBeInTheDocument()

    // And dialog is closed
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument()
  })

  it('user can create a new tag type from the empty tags tab', async () => {
    const user = userEvent.setup()
    // Given an item with no tag types in the database
    const item = await makeTestItem()
    renderTagsTab(item.id)

    // When user sees the empty state and clicks "New Tag Type"
    await user.click(
      await screen.findByRole('button', { name: /new tag type/i }),
    )

    // And enters a tag type name in the dialog and clicks Add
    await user.type(screen.getByLabelText(/name/i), 'Season')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    // Then the new tag type is created in the database
    await waitFor(async () => {
      const tagTypes = await db.tagTypes.toArray()
      expect(tagTypes.some((tt) => tt.name === 'Season')).toBe(true)
    })

    // And the tags tab now shows the new tag type
    expect(await screen.findByText(/season/i)).toBeInTheDocument()
  })

  it('user can press a tag badge and nothing is written until Save', async () => {
    const user = userEvent.setup()
    // Given a tag type with a tag not yet assigned to the item
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const dairy = await createTag({ name: 'dairy', typeId: tagType.id })
    const item = await makeTestItem()
    renderTagsTab(item.id)

    // Then the badge is not pressed and Save is off
    const badge = await screen.findByRole('button', {
      name: 'dairy',
      pressed: false,
    })
    expect(saveButton()).toBeDisabled()

    // When user presses the badge
    await user.click(badge)

    // Then the badge is pressed and Save is on, but nothing is written yet
    expect(
      screen.getByRole('button', { name: 'dairy', pressed: true }),
    ).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect((await db.items.get(item.id))?.tagIds).toEqual([])

    // When user presses Save
    await user.click(saveButton())

    // Then the tag is on the item
    await waitFor(async () =>
      expect((await db.items.get(item.id))?.tagIds).toEqual([dairy.id]),
    )
  })

  it('user can remove a tag with a press and Save', async () => {
    const user = userEvent.setup()
    // Given a tag type with a tag assigned to the item
    const tagType = await createTagType({ name: 'Label', color: TagColor.teal })
    const tag = await createTag({ name: 'frozen', typeId: tagType.id })
    const item = await makeTestItem([tag.id])
    renderTagsTab(item.id)

    // When user presses the assigned badge
    await user.click(
      await screen.findByRole('button', { name: /frozen/i, pressed: true }),
    )

    // Then it shows as not assigned, and the "No tags assigned" hint shows
    expect(
      screen.getByRole('button', { name: /frozen/i, pressed: false }),
    ).toBeInTheDocument()
    expect(screen.getByText('No tags assigned')).toBeInTheDocument()

    // When user presses Save
    await user.click(saveButton())

    // Then the tag is removed from the item
    await waitFor(async () =>
      expect((await db.items.get(item.id))?.tagIds).toEqual([]),
    )
  })

  it('user who presses a badge twice sees Save off again', async () => {
    const user = userEvent.setup()
    // Given a tag not assigned to the item
    const tagType = await createTagType({ name: 'Label', color: TagColor.teal })
    await createTag({ name: 'frozen', typeId: tagType.id })
    const item = await makeTestItem()
    renderTagsTab(item.id)
    const badge = await screen.findByRole('button', { name: /frozen/i })

    // When the user presses the badge, then presses it again
    await user.click(badge)
    expect(saveButton()).toBeEnabled()
    await user.click(badge)

    // Then the badge is back to not pressed, and there is nothing to save
    expect(badge).toHaveAttribute('aria-pressed', 'false')
    expect(saveButton()).toBeDisabled()
  })

  it('user can press a tag badge with Enter and with Space', async () => {
    const user = userEvent.setup()
    // Given two tags not assigned to the item
    const tagType = await createTagType({ name: 'Label', color: TagColor.teal })
    await createTag({ name: 'frozen', typeId: tagType.id })
    await createTag({ name: 'fresh', typeId: tagType.id })
    const item = await makeTestItem()
    renderTagsTab(item.id)
    const frozen = await screen.findByRole('button', { name: /frozen/i })
    const fresh = screen.getByRole('button', { name: /fresh/i })

    // Then both can be reached with Tab
    expect(frozen).toHaveAttribute('tabindex', '0')
    expect(fresh).toHaveAttribute('tabindex', '0')

    // When the user focuses one and presses Enter, then the other and Space
    frozen.focus()
    await user.keyboard('{Enter}')
    fresh.focus()
    await user.keyboard(' ')

    // Then both are pressed, and Save is on
    expect(frozen).toHaveAttribute('aria-pressed', 'true')
    expect(fresh).toHaveAttribute('aria-pressed', 'true')
    expect(saveButton()).toBeEnabled()
  })

  // A failed save (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
  // Before that fix a failed write showed nothing. Since the item relations
  // Save the write is the Save, and the presses stay on screen after it fails.
  it('user sees a message when the Save fails, and the press is kept', async () => {
    const rejections = watchUnhandledRejections()
    try {
      const user = userEvent.setup()
      // Given an item, a tag, and a database that refuses the write
      const tagType = await createTagType({
        name: 'Label',
        color: TagColor.teal,
      })
      await createTag({ name: 'frozen', typeId: tagType.id })
      const item = await makeTestItem()
      vi.spyOn(db.items, 'update').mockRejectedValueOnce(new Error('disk full'))
      const router = renderTagsTab(item.id)

      // When the user presses the tag badge and Save
      await user.click(await screen.findByRole('button', { name: /frozen/i }))
      await user.click(saveButton())

      // Then a message says the change was not saved
      expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
      // And the page stays, the badge is still pressed, and Save is on again
      expect(router.state.location.pathname).toBe(`/items/${item.id}/tags`)
      expect(
        screen.getByRole('button', { name: /frozen/i, pressed: true }),
      ).toBeInTheDocument()
      await waitFor(() => expect(saveButton()).toBeEnabled())
      expect((await db.items.get(item.id))?.tagIds).toEqual([])
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })

  // A failed create in the New Tag and New Tag Type dialogs
  // (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md). Before the
  // fix each write had no catch: an unhandled rejection, and nothing on screen.
  it('user sees a message when creating a new tag fails', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given an item, a tag type, and a database that refuses the new tag
      await createTagType({ name: 'categories', color: TagColor.blue })
      const item = await makeTestItem()
      renderTagsTab(item.id)
      vi.spyOn(db.tags, 'add').mockRejectedValueOnce(new Error('disk full'))
      const user = userEvent.setup()

      // When the user adds a tag named "dairy"
      expect(await screen.findByText(/categories/i)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /new tag/i }))
      await user.type(screen.getByLabelText(/name/i), 'dairy')
      await user.click(screen.getByRole('button', { name: /^add tag$/i }))

      // Then a message says the change was not saved
      expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
      // And the dialog stays open with the name, and Add can be pressed again
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText(/name/i)).toHaveValue('dairy')
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /^add tag$/i }),
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

  it('user sees a message when creating a new tag type fails', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given an item with no tag types, and a database that refuses the write
      const item = await makeTestItem()
      renderTagsTab(item.id)
      vi.spyOn(db.tagTypes, 'add').mockRejectedValueOnce(new Error('disk full'))
      const user = userEvent.setup()

      // When the user adds a tag type named "Season"
      await user.click(
        await screen.findByRole('button', { name: /new tag type/i }),
      )
      await user.type(screen.getByLabelText(/name/i), 'Season')
      await user.click(screen.getByRole('button', { name: /^add$/i }))

      // Then a message says the change was not saved
      expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
      // And the dialog stays open with the name
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText(/name/i)).toHaveValue('Season')
      expect(await db.tagTypes.count()).toBe(0)
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })
})
