import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import {
  CLOUD_LOCATIONS,
  cloudItem,
  cloudStock,
  cloudTag,
  cloudTagType,
  cloudVendor,
  LOC_A,
} from '@/test/cloudFixtures'
import {
  cloudServer,
  holdMutation,
  resetCloudServer,
  seedCloudHousehold,
} from '@/test/cloudServerStub'
import { watchUnhandledRejections } from '@/test/unhandledRejections'

// A tag or vendor made with "New Tag" or "New Vendor" on an item page, in
// CLOUD mode. Since the item relations Save (design
// `docs/features/items/2026-11-27-item-relations-save-design.md`, owner
// answer 1A) the create is sent at once and the new badge shows as selected,
// but only the top bar Save gives it to the item. So the create sends no
// `updateItem`, and Save sends one with the old ids kept and the new one
// added. The local tests are in `tags.test.tsx` and `vendors.test.tsx`.
//
// Issue #402 (a new badge selected at once) needed a second write and its
// own state until the relations Save. With no second write, the second
// `describe` checks only that the new badge is selected at once and Save is
// on. The trap of a tag list that arrives after the create is in
// `relationSave.cloud.test.tsx`.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const { stubGeneratedHooks } = await import('@/test/cloudServerStub')
  return stubGeneratedHooks(await importOriginal())
})

const toastError = vi.fn()
vi.mock('sonner', async (importOriginal) => {
  const original = await importOriginal<typeof import('sonner')>()
  return {
    ...original,
    toast: Object.assign(
      (...a: Parameters<typeof original.toast>) => original.toast(...a),
      original.toast,
      { error: (...args: unknown[]) => toastError(...args) },
    ),
  }
})

// The item already has one tag and one vendor, so the test can see that the
// new one is ADDED to the list, not written over it.
const FLOUR_A = cloudStock('stock-flour-a', 'item-flour', LOC_A, {
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 0,
})
const FLOUR = cloudItem('item-flour', 'Flour', {
  tagIds: ['tag-frozen'],
  vendorIds: ['vendor-costco'],
})

describe('Item page - a tag or vendor created there is assigned (cloud)', () => {
  let rejections: ReturnType<typeof watchUnhandledRejections>

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    resetCloudServer()
    seedCloudHousehold(CLOUD_LOCATIONS)
    cloudServer.queries.useGetItemQuery = { item: FLOUR }
    cloudServer.queries.useGetItemsQuery = { items: [FLOUR] }
    cloudServer.queries.usePantryDataQuery = {
      items: [FLOUR],
      itemStocks: [FLOUR_A],
    }
    cloudServer.queries.useItemStocksForItemQuery = {
      itemStocksForItem: [FLOUR_A],
    }
    cloudServer.queries.useGetRecipesQuery = { recipes: [] }
    cloudServer.queries.useGetTagTypesQuery = {
      tagTypes: [cloudTagType('type-label', 'Label')],
    }
    cloudServer.queries.useGetTagsQuery = {
      tags: [cloudTag('tag-frozen', 'frozen', 'type-label')],
    }
    cloudServer.queries.useGetVendorsQuery = {
      vendors: [cloudVendor('vendor-costco', 'Costco')],
    }
    toastError.mockClear()
    rejections = watchUnhandledRejections()
  })

  afterEach(() => {
    rejections.stop()
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
  })

  function renderPage(path: string) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can create a tag on the item page and give it to the item with Save', async () => {
    const user = userEvent.setup()
    // Given a server that creates the tag "dairy"
    cloudServer.results.useCreateTagMutation = (vars) => ({
      createTag: cloudTag('tag-dairy', String(vars.name), 'type-label'),
    })
    renderPage('/items/item-flour/tags')

    // When the user adds a tag named "dairy"
    await user.click(await screen.findByRole('button', { name: /new tag$/i }))
    await user.type(screen.getByLabelText(/name/i), 'dairy')
    await user.click(screen.getByRole('button', { name: /^add tag$/i }))

    // Then the tag is created, the dialog closes, and no item write is sent
    await waitFor(() =>
      expect(cloudServer.calls.useCreateTagMutation).toEqual([
        { name: 'dairy', typeId: 'type-label' },
      ]),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(cloudServer.calls.useUpdateItemMutation).toBeUndefined()

    // When the user presses Save
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    // Then the tag is given to the item, next to its old tag
    await waitFor(() =>
      expect(cloudServer.calls.useUpdateItemMutation).toEqual([
        {
          id: 'item-flour',
          input: { tagIds: ['tag-frozen', 'tag-dairy'] },
        },
      ]),
    )
    expect(cloudServer.calls.useCreateTagMutation).toHaveLength(1)
    expect(toastError).not.toHaveBeenCalled()
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user can create a vendor on the item page and it is assigned to the item', async () => {
    const user = userEvent.setup()
    // Given a server that creates the vendor "Aldi"
    cloudServer.results.useCreateVendorMutation = (vars) => ({
      createVendor: cloudVendor('vendor-aldi', String(vars.name)),
    })
    renderPage('/items/item-flour/vendors')

    // When the user adds a vendor named "Aldi"
    await user.click(await screen.findByRole('button', { name: /new vendor/i }))
    await user.type(screen.getByLabelText(/name/i), 'Aldi')
    await user.click(screen.getByRole('button', { name: /add vendor/i }))

    // Then the vendor is created, and then given to the item, next to its
    // old vendor
    await waitFor(() =>
      expect(cloudServer.calls.useUpdateItemMutation).toEqual([
        {
          id: 'item-flour',
          input: { vendorIds: ['vendor-costco', 'vendor-aldi'] },
        },
      ]),
    )
    expect(cloudServer.calls.useCreateVendorMutation).toEqual([
      expect.objectContaining({ name: 'Aldi' }),
    ])
    // And the dialog has closed, with no error
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(toastError).not.toHaveBeenCalled()
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })
})

const SAVE_FAILED = 'Could not save the change. Please try again.'

describe('Item page - a new tag or vendor shows as selected at once (cloud)', () => {
  let rejections: ReturnType<typeof watchUnhandledRejections>
  const FROZEN = cloudTag('tag-frozen', 'frozen', 'type-label')
  const DAIRY = cloudTag('tag-dairy', 'dairy', 'type-label')
  const COSTCO = cloudVendor('vendor-costco', 'Costco')
  const ALDI = cloudVendor('vendor-aldi', 'Aldi')

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    resetCloudServer()
    seedCloudHousehold(CLOUD_LOCATIONS)
    cloudServer.queries.useGetItemQuery = { item: FLOUR }
    cloudServer.queries.useGetItemsQuery = { items: [FLOUR] }
    cloudServer.queries.usePantryDataQuery = {
      items: [FLOUR],
      itemStocks: [FLOUR_A],
    }
    cloudServer.queries.useItemStocksForItemQuery = {
      itemStocksForItem: [FLOUR_A],
    }
    cloudServer.queries.useGetRecipesQuery = { recipes: [] }
    cloudServer.queries.useGetTagTypesQuery = {
      tagTypes: [cloudTagType('type-label', 'Label')],
    }
    cloudServer.queries.useGetTagsQuery = { tags: [FROZEN] }
    cloudServer.queries.useGetVendorsQuery = { vendors: [COSTCO] }
    // The create's refetch: once the create has answered, the list shows
    // the new tag or vendor. The item does NOT have it yet.
    cloudServer.results.useCreateTagMutation = () => {
      cloudServer.queries.useGetTagsQuery = { tags: [FROZEN, DAIRY] }
      return { createTag: DAIRY }
    }
    cloudServer.results.useCreateVendorMutation = () => {
      cloudServer.queries.useGetVendorsQuery = { vendors: [COSTCO, ALDI] }
      return { createVendor: ALDI }
    }
    toastError.mockClear()
    rejections = watchUnhandledRejections()
  })

  afterEach(() => {
    rejections.stop()
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
  })

  function renderPage(path: string) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  async function addTag(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /new tag$/i }))
    await user.type(screen.getByLabelText(/name/i), 'dairy')
    await user.click(screen.getByRole('button', { name: /^add tag$/i }))
  }

  async function addVendor(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /new vendor/i }))
    await user.type(screen.getByLabelText(/name/i), 'Aldi')
    await user.click(screen.getByRole('button', { name: /add vendor/i }))
  }

  it('user sees a new tag as selected at once, with Save on', async () => {
    const user = userEvent.setup()
    renderPage('/items/item-flour/tags')

    // When the user adds a tag named "dairy"
    await addTag(user)

    // Then the new badge shows as selected, not busy, and Save is on
    const badge = await screen.findByRole('button', { name: 'dairy' })
    expect(badge).toHaveAttribute('aria-pressed', 'true')
    expect(badge).not.toHaveAttribute('aria-busy')
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled()
    // And nothing but the create was sent
    expect(cloudServer.calls.useUpdateItemMutation).toBeUndefined()
    expect(toastError).not.toHaveBeenCalled()
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees a new vendor as selected while it is still being assigned', async () => {
    const user = userEvent.setup()
    // Given a server that holds the assign
    const assign = holdMutation('useUpdateItemMutation')
    renderPage('/items/item-flour/vendors')

    // When the user adds a vendor named "Aldi"
    await addVendor(user)

    // Then the new badge shows as selected while the assign is in flight
    const badge = await screen.findByRole('button', { name: 'Aldi' })
    await waitFor(() =>
      expect(cloudServer.calls.useUpdateItemMutation).toHaveLength(1),
    )
    expect(badge).toHaveAttribute('aria-pressed', 'true')
    expect(badge).toHaveAttribute('aria-busy', 'true')

    // When the assign is saved (Apollo writes the answer to the item)
    cloudServer.queries.useGetItemQuery = {
      item: { ...FLOUR, vendorIds: ['vendor-costco', 'vendor-aldi'] },
    }
    assign.release()

    // Then the badge stays selected and is no longer busy, with no error
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Aldi' })).not.toHaveAttribute(
        'aria-busy',
      ),
    )
    expect(screen.getByRole('button', { name: 'Aldi' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(toastError).not.toHaveBeenCalled()
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees a new vendor go back to not selected when the assign fails', async () => {
    const user = userEvent.setup()
    // Given a server that holds the assign, then refuses it
    const assign = holdMutation('useUpdateItemMutation')
    renderPage('/items/item-flour/vendors')

    // When the user adds a vendor named "Aldi"
    await addVendor(user)
    const badge = await screen.findByRole('button', { name: 'Aldi' })
    expect(badge).toHaveAttribute('aria-pressed', 'true')

    // And the server refuses the assign
    cloudServer.failing.add('useUpdateItemMutation')
    assign.release()

    // Then the badge goes back to not selected, and a message says so
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Aldi' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    )
    expect(toastError).toHaveBeenCalledWith(SAVE_FAILED)
    expect(cloudServer.calls.useUpdateItemMutation).toHaveLength(1)
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user cannot toggle another vendor while a new vendor is being assigned', async () => {
    const user = userEvent.setup()
    // Given a server that holds the assign of a new vendor "Aldi"
    const assign = holdMutation('useUpdateItemMutation')
    renderPage('/items/item-flour/vendors')
    await addVendor(user)
    await screen.findByRole('button', { name: 'Aldi' })
    await waitFor(() =>
      expect(cloudServer.calls.useUpdateItemMutation).toHaveLength(1),
    )

    // When the user presses the old vendor "Costco" before the assign is saved
    await user.click(screen.getByRole('button', { name: 'Costco' }))

    // Then no second write is sent: it would send the whole list too, and
    // could undo the assign
    expect(cloudServer.calls.useUpdateItemMutation).toHaveLength(1)
    assign.release()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Aldi' })).not.toHaveAttribute(
        'aria-busy',
      ),
    )
    expect(cloudServer.calls.useUpdateItemMutation).toHaveLength(1)
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees the New tag type button loading while the tag type is created', async () => {
    const user = userEvent.setup()
    // Given an item page with no tag types, and a server that holds the
    // create of the tag type
    cloudServer.queries.useGetTagTypesQuery = { tagTypes: [] }
    const create = holdMutation('useCreateTagTypeMutation')
    renderPage('/items/item-flour/tags')

    // When the user adds a tag type named "Season"
    await user.click(
      await screen.findByRole('button', { name: /new tag type/i }),
    )
    await user.type(screen.getByLabelText(/name/i), 'Season')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    // Then, while it is being created, the Add button is disabled and shows
    // a spinner
    await waitFor(() =>
      expect(cloudServer.calls.useCreateTagTypeMutation).toHaveLength(1),
    )
    const add = screen.getByRole('button', { name: /^add$/i })
    await waitFor(() => expect(add).toBeDisabled())
    expect(add.querySelector('.animate-spin')).not.toBeNull()

    // When the server answers, the dialog closes
    create.release()
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(toastError).not.toHaveBeenCalled()
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })
})
