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
  resetCloudServer,
  seedCloudHousehold,
} from '@/test/cloudServerStub'
import { watchUnhandledRejections } from '@/test/unhandledRejections'

// Issue #402: a tag or vendor made with "New Tag" or "New Vendor" on an item
// page is also given to that item, in CLOUD mode. The local tests are in
// `tags.test.tsx` and `vendors.test.tsx` ("… automatically assigned …",
// "user can create a new vendor from the vendors tab").
//
// Cloud sends two writes: the create, then `updateItem` with the item's tag
// or vendor list plus the new id. `createTag` and `createVendor` take no item,
// so one write would need a server change.
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

  it('user can create a tag on the item page and it is assigned to the item', async () => {
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

    // Then the tag is created, and then given to the item, next to its
    // old tag
    await waitFor(() =>
      expect(cloudServer.calls.useUpdateItemMutation).toEqual([
        {
          id: 'item-flour',
          input: { tagIds: ['tag-frozen', 'tag-dairy'] },
        },
      ]),
    )
    expect(cloudServer.calls.useCreateTagMutation).toEqual([
      { name: 'dairy', typeId: 'type-label' },
    ])
    // And the dialog has closed, with no error
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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
