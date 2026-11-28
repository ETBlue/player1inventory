import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { createItem, createVendor } from '@/db/operations'
import * as hooksModule from '@/hooks'
import * as vendorsHooksModule from '@/hooks/useVendors'
import { routeTree } from '@/routeTree.gen'
import { watchUnhandledRejections } from '@/test/unhandledRejections'

// The item Vendors tab, in local mode. Since the item relations Save
// (design `docs/features/items/2026-11-27-item-relations-save-design.md`) a
// badge press changes only the screen, and the top bar Save writes the list.
// A vendor made with "New Vendor" is created at once and shown as selected,
// but only Save gives it to the item (owner answer 1A). The cloud tests are
// in `createAssign.cloud.test.tsx`, `relationSave.cloud.test.tsx` and
// `saveFailed.cloud.test.tsx`.
//
// `useUpdateItem` returns a UNION of its two data-mode branches: local mode's
// TanStack `UseMutationResult`, and the cloud branch's hand-built
// `{ mutate, mutateAsync, isPending }` (src/hooks/useItems.ts). The stub
// below builds the cloud member, which is the smaller of the two, with a
// Save that is still running.
const pendingCloudUpdateItem = (): ReturnType<
  typeof hooksModule.useUpdateItem
> => ({
  mutate: () => Promise.resolve(),
  mutateAsync: () => Promise.resolve(undefined),
  isPending: true,
})

const toastError = vi.fn()
// The route tree renders sonner's `Toaster`, so the module stays real and
// only `toast.error` is replaced.
vi.mock('sonner', async (importOriginal) => {
  const original = await importOriginal<typeof import('sonner')>()
  return {
    ...original,
    toast: Object.assign(
      (...a: Parameters<typeof original.toast>) => original.toast(...a),
      original.toast,
      {
        error: (...args: unknown[]) => toastError(...args),
      },
    ),
  }
})

describe('Vendors Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.vendors.clear()
    await db.inventoryLogs.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderVendorsTab = (itemId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}/vendors`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  const saveButton = () => screen.getByRole('button', { name: /^save$/i })
  const makeTestItem = (vendorIds?: string[]) =>
    createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      ...(vendorIds && { vendorIds }),
    })

  it('user can see all vendors on the vendors tab', async () => {
    // Given an item and two vendors
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    await createVendor('Costco')
    await createVendor("Trader Joe's")

    renderVendorsTab(item.id)

    // Then both vendor names appear as badges
    await waitFor(() => {
      expect(screen.getByText('Costco')).toBeInTheDocument()
      expect(screen.getByText("Trader Joe's")).toBeInTheDocument()
    })
  })

  it('user can see new vendor button when no vendors exist', async () => {
    // Given an item and no vendors
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderVendorsTab(item.id)

    // Then the new vendor button is shown
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /new vendor/i }),
      ).toBeInTheDocument()
    })
  })

  it('user can see assigned vendors highlighted', async () => {
    // Given a vendor assigned to an item
    const vendor = await createVendor('Costco')
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [vendor.id],
    })

    renderVendorsTab(item.id)

    // Then the assigned vendor badge shows an X icon (aria-label or role)
    await waitFor(() => {
      expect(screen.getByText('Costco')).toBeInTheDocument()
    })
    // Assigned badge contains an X icon (lucide X renders as svg)
    const badge = screen
      .getByText('Costco')
      .closest('[class*="badge"], span, div')
    expect(badge).toBeInTheDocument()
  })

  it('user can assign a vendor to an item with a press and Save', async () => {
    // Given an item with no vendors and one available vendor
    const vendor = await createVendor('Costco')
    const item = await makeTestItem()
    renderVendorsTab(item.id)
    const user = userEvent.setup()

    // When user presses the vendor badge
    await user.click(await screen.findByRole('button', { name: 'Costco' }))

    // Then the badge is pressed and Save is on, but nothing is written yet
    expect(
      screen.getByRole('button', { name: 'Costco', pressed: true }),
    ).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect((await db.items.get(item.id))?.vendorIds ?? []).toEqual([])

    // When user presses Save
    await user.click(saveButton())

    // Then the item has the vendor, the page says so, and Save is off again
    await waitFor(async () =>
      expect((await db.items.get(item.id))?.vendorIds).toEqual([vendor.id]),
    )
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await waitFor(() => expect(saveButton()).toBeDisabled())
  })

  it('user can create a new vendor, see it selected, and give it to the item with Save', async () => {
    // Given an item and no vendors
    const item = await makeTestItem()
    renderVendorsTab(item.id)
    const user = userEvent.setup()

    // When user adds a vendor named "Costco"
    await user.click(await screen.findByRole('button', { name: /new vendor/i }))
    await user.type(await screen.findByLabelText(/name/i), 'Costco')
    await user.click(screen.getByRole('button', { name: /add vendor/i }))

    // Then the vendor is created at once and its badge shows as selected
    expect(
      await screen.findByRole('button', { name: 'Costco', pressed: true }),
    ).toBeInTheDocument()
    const newVendor = (await db.vendors.toArray()).find(
      (v) => v.name === 'Costco',
    )
    expect(newVendor).toBeDefined()
    // But the item does not have it yet, and Save is on
    expect((await db.items.get(item.id))?.vendorIds ?? []).toEqual([])
    expect(saveButton()).toBeEnabled()

    // When user presses Save
    await user.click(saveButton())

    // Then the item has the new vendor
    await waitFor(async () =>
      expect((await db.items.get(item.id))?.vendorIds).toEqual([newVendor?.id]),
    )
  })

  it('vendor badge has aria-pressed reflecting assigned state', async () => {
    // Given a vendor not assigned to the item
    await createVendor('Costco')
    const item = await makeTestItem()
    renderVendorsTab(item.id)
    const user = userEvent.setup()

    // Then the unassigned badge has aria-pressed="false"
    const badge = await screen.findByRole('button', {
      name: 'Costco',
      pressed: false,
    })

    // When user presses it
    await user.click(badge)

    // Then the badge has aria-pressed="true"
    expect(badge).toHaveAttribute('aria-pressed', 'true')
  })

  it('user can unassign a vendor from an item with a press and Save', async () => {
    // Given an item with a vendor already assigned
    const vendor = await createVendor('Costco')
    const item = await makeTestItem([vendor.id])
    renderVendorsTab(item.id)
    const user = userEvent.setup()

    // When user presses the assigned vendor badge
    await user.click(
      await screen.findByRole('button', { name: 'Costco', pressed: true }),
    )

    // Then it shows as not assigned, with the "No vendors assigned" hint
    expect(
      screen.getByRole('button', { name: 'Costco', pressed: false }),
    ).toBeInTheDocument()
    expect(screen.getByText('No vendors assigned')).toBeInTheDocument()

    // When user presses Save
    await user.click(saveButton())

    // Then the vendor is removed from the item's vendorIds
    await waitFor(async () =>
      expect((await db.items.get(item.id))?.vendorIds ?? []).toEqual([]),
    )
  })

  it('user who presses a vendor badge twice sees Save off again', async () => {
    // Given a vendor not assigned to the item
    await createVendor('Costco')
    const item = await makeTestItem()
    renderVendorsTab(item.id)
    const user = userEvent.setup()
    const badge = await screen.findByRole('button', { name: 'Costco' })

    // When the user presses the badge, then presses it again
    await user.click(badge)
    expect(saveButton()).toBeEnabled()
    await user.click(badge)

    // Then the badge is back to not pressed, and there is nothing to save
    expect(badge).toHaveAttribute('aria-pressed', 'false')
    expect(saveButton()).toBeDisabled()
  })

  it('user can press a vendor badge with Enter and with Space', async () => {
    // Given two vendors not assigned to the item
    await createVendor('Costco')
    await createVendor('Aldi')
    const item = await makeTestItem()
    renderVendorsTab(item.id)
    const user = userEvent.setup()
    const costco = await screen.findByRole('button', { name: 'Costco' })
    const aldi = screen.getByRole('button', { name: 'Aldi' })

    // Then both can be reached with Tab
    expect(costco).toHaveAttribute('tabindex', '0')
    expect(aldi).toHaveAttribute('tabindex', '0')

    // When the user focuses one and presses Enter, then the other and Space
    costco.focus()
    await user.keyboard('{Enter}')
    aldi.focus()
    await user.keyboard(' ')

    // Then both are pressed, and Save is on
    expect(costco).toHaveAttribute('aria-pressed', 'true')
    expect(aldi).toHaveAttribute('aria-pressed', 'true')
    expect(saveButton()).toBeEnabled()
  })

  describe('loading state', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('user sees the Save loading and cannot press a badge while a Save runs', async () => {
      // Given: useUpdateItem is mocked to stay pending indefinitely
      vi.spyOn(hooksModule, 'useUpdateItem').mockReturnValue(
        pendingCloudUpdateItem(),
      )
      await createVendor('Costco')
      const item = await makeTestItem()
      renderVendorsTab(item.id)
      const user = userEvent.setup()

      // Then the Save shows a spinner and is off, and the badge is disabled
      const badge = await screen.findByRole('button', { name: 'Costco' })
      expect(saveButton()).toBeDisabled()
      expect(saveButton().querySelector('.animate-spin')).not.toBeNull()
      expect(badge).toHaveAttribute('aria-disabled', 'true')

      // When the user presses the badge
      await user.click(badge)

      // Then nothing changes: the list sent is the list that was on screen
      expect(badge).toHaveAttribute('aria-pressed', 'false')
      // And the badge has no spinner of its own any more
      expect(badge.querySelector('.animate-spin')).toBeNull()
    })
  })
  describe('when creating a vendor fails', () => {
    afterEach(() => {
      vi.restoreAllMocks()
      toastError.mockReset()
    })

    it('user sees an error message when a new vendor cannot be created', async () => {
      // Given the create is refused (a household manager who is only a
      // viewer of the active location got FORBIDDEN here before H5's fix)
      vi.spyOn(vendorsHooksModule, 'useCreateVendor').mockReturnValue({
        mutate: () => Promise.resolve(),
        mutateAsync: () => Promise.reject(new Error('refused')),
        isPending: false,
      } as unknown as ReturnType<typeof vendorsHooksModule.useCreateVendor>)
      const item = await createItem({
        name: 'Test Item',
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        tagIds: [],
      })
      renderVendorsTab(item.id)
      const user = userEvent.setup()

      // When the user adds a vendor named Lidl
      await user.click(
        await screen.findByRole('button', { name: /new vendor/i }),
      )
      await user.type(await screen.findByLabelText(/name/i), 'Lidl')
      await user.click(screen.getByRole('button', { name: /add vendor/i }))

      // Then a toast says it failed, and the dialog stays open
      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(
          'Could not add Lidl. Please try again.',
        ),
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  // A failed save (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
  // Before that fix a failed write showed nothing. Since the item relations
  // Save the write is the Save, and the presses stay on screen after it fails.
  // (The old "assigning a newly created vendor fails" test is gone: a create
  // no longer sends a second write.)
  it('user sees a message when the Save fails, and the press is kept', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given an item, a vendor, and a database that refuses the write
      const item = await makeTestItem()
      await createVendor('Costco')
      vi.spyOn(db.items, 'update').mockRejectedValueOnce(new Error('disk full'))
      toastError.mockClear()
      const router = renderVendorsTab(item.id)
      const user = userEvent.setup()

      // When the user presses the vendor badge and Save
      await user.click(await screen.findByRole('button', { name: /costco/i }))
      await user.click(saveButton())

      // Then a message says the change was not saved
      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(
          'Could not save the change. Please try again.',
        ),
      )
      // And the page stays, the badge is still pressed, and Save is on again
      expect(router.state.location.pathname).toBe(`/items/${item.id}/vendors`)
      expect(
        screen.getByRole('button', { name: /costco/i, pressed: true }),
      ).toBeInTheDocument()
      await waitFor(() => expect(saveButton()).toBeEnabled())
      expect((await db.items.get(item.id))?.vendorIds ?? []).toEqual([])
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
      vi.restoreAllMocks()
    }
  })
})
