// src/routes/items/$id.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Item detail page - manual quantity input', () => {
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

  const renderItemDetailPage = (itemId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}`],
    })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can manually set packed quantity', async () => {
    const user = userEvent.setup()

    // Given an item with initial quantities
    const item = await createItem({
      name: 'Test Item',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    // When user opens item detail page
    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toBeInTheDocument()
    })

    // Initial value should be 2
    const packedInput = screen.getByLabelText(/^packed/i) as HTMLInputElement
    expect(packedInput.value).toBe('2')

    // When user changes packed quantity to 5
    await user.clear(packedInput)
    await user.type(packedInput, '5')

    // And saves the form
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then item is updated in database
    await waitFor(async () => {
      const updatedItem = await db.items.get(item.id)
      expect(updatedItem?.packedQuantity).toBe(5)
    })

    // And no inventory log is created
    const logs = await db.inventoryLogs
      .where('itemId')
      .equals(item.id)
      .toArray()
    expect(logs).toHaveLength(0)
  })

  it('user can manually set unpacked quantity for dual-unit items', async () => {
    const user = userEvent.setup()

    // Given a dual-unit item
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 5,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 0.25,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/^unpacked/i)).toBeInTheDocument()
    })

    // When user sets unpacked quantity to 0.5
    const unpackedInput = screen.getByLabelText(/^unpacked/i)
    await user.clear(unpackedInput)
    await user.type(unpackedInput, '0.5')

    // And saves the form
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then item is updated in database
    await waitFor(async () => {
      const updatedItem = await db.items.get(item.id)
      expect(updatedItem?.unpackedQuantity).toBe(0.5)
    })
  })

  it('unpacked quantity field is always enabled', async () => {
    // Given a dual-unit item
    const dualUnitItem = await createItem({
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 0.25,
      tagIds: [],
    })

    renderItemDetailPage(dualUnitItem.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toBeInTheDocument()
    })

    // Unpacked field should be visible and enabled for dual-unit items
    const unpackedInputDual = screen.getByLabelText(
      /^unpacked/i,
    ) as HTMLInputElement
    expect(unpackedInputDual).toBeInTheDocument()
    expect(unpackedInputDual).not.toBeDisabled()
  })

  it('unpacked quantity field is enabled even for single-unit items', async () => {
    // Given a single-unit item
    const singleUnitItem = await createItem({
      name: 'Eggs',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(singleUnitItem.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toBeInTheDocument()
    })

    // Unpacked field should now be visible AND enabled (behavior changed)
    const unpackedInputSingle = screen.getByLabelText(
      /^unpacked/i,
    ) as HTMLInputElement
    expect(unpackedInputSingle).toBeInTheDocument()
    expect(unpackedInputSingle).not.toBeDisabled()
  })

  it('measurement fields are disabled when track in measurement is off', async () => {
    const _user = userEvent.setup()

    // Given an item with measurement tracking OFF
    const item = await createItem({
      name: 'Sugar',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/measurement unit/i)).toBeInTheDocument()
    })

    // Measurement fields should be disabled
    const measurementUnitInput = screen.getByLabelText(
      /measurement unit/i,
    ) as HTMLInputElement
    const amountPerPackageInput = screen.getByLabelText(
      /amount per package/i,
    ) as HTMLInputElement

    expect(measurementUnitInput).toBeDisabled()
    expect(amountPerPackageInput).toBeDisabled()
  })

  it('measurement fields are enabled when track in measurement is on', async () => {
    // Given an item with measurement tracking ON
    const item = await createItem({
      name: 'Flour',
      packageUnit: 'pack',
      measurementUnit: 'g',
      amountPerPackage: 500,
      targetUnit: 'measurement',
      targetQuantity: 2000,
      refillThreshold: 500,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 100,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/measurement unit/i)).toBeInTheDocument()
    })

    // Measurement fields should be enabled
    const measurementUnitInput = screen.getByLabelText(
      /measurement unit/i,
    ) as HTMLInputElement
    const amountPerPackageInput = screen.getByLabelText(
      /amount per package/i,
    ) as HTMLInputElement

    expect(measurementUnitInput).not.toBeDisabled()
    expect(amountPerPackageInput).not.toBeDisabled()
  })

  it('unpacked quantity converts when toggling track in measurement', async () => {
    const user = userEvent.setup()

    // Given an item with measurement tracking ON and unpacked quantity of 250g
    const item = await createItem({
      name: 'Flour',
      packageUnit: 'pack',
      measurementUnit: 'g',
      amountPerPackage: 500,
      targetUnit: 'measurement',
      targetQuantity: 2000,
      refillThreshold: 500,
      packedQuantity: 2,
      unpackedQuantity: 250,
      consumeAmount: 100,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/^unpacked/i)).toBeInTheDocument()
    })

    // Initial unpacked quantity should be 250 (in grams)
    const unpackedInput = screen.getByLabelText(
      /^unpacked/i,
    ) as HTMLInputElement
    expect(unpackedInput.value).toBe('250')

    // When user toggles track in measurement OFF
    const trackSwitch = screen.getByRole('switch', {
      name: /track in measurement/i,
    })
    await user.click(trackSwitch)

    // Then unpacked quantity should convert to 0.5 (250g / 500g per pack)
    await waitFor(() => {
      expect(unpackedInput.value).toBe('0.5')
    })

    // When user toggles track in measurement back ON
    await user.click(trackSwitch)

    // Then unpacked quantity should convert back to 250 (0.5 * 500)
    await waitFor(() => {
      expect(unpackedInput.value).toBe('250')
    })
  })

  it('save button disabled when measurement tracking on but fields empty', async () => {
    const user = userEvent.setup()

    // Given an item with package tracking
    const item = await createItem({
      name: 'Sugar',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/measurement unit/i)).toBeInTheDocument()
    })

    const saveButton = screen.getByRole('button', { name: /save/i })

    // Save button should be disabled (no changes)
    expect(saveButton).toBeDisabled()

    // When user toggles track in measurement ON without filling fields
    const trackSwitch = screen.getByRole('switch', {
      name: /track in measurement/i,
    })
    await user.click(trackSwitch)

    // Save button should remain disabled (validation fails)
    await waitFor(() => {
      expect(saveButton).toBeDisabled()
    })

    // When user fills in measurement unit
    const measurementUnitInput = screen.getByLabelText(/measurement unit/i)
    await user.type(measurementUnitInput, 'g')

    // Save button should still be disabled (amount per package missing)
    expect(saveButton).toBeDisabled()

    // When user fills in amount per package
    const amountPerPackageInput = screen.getByLabelText(/amount per package/i)
    await user.type(amountPerPackageInput, '500')

    // Save button should now be enabled
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled()
    })
  })

  it('validation message shows when fields required but missing', async () => {
    const user = userEvent.setup()

    // Given an item with package tracking
    const item = await createItem({
      name: 'Sugar',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/measurement unit/i)).toBeInTheDocument()
    })

    // When user toggles track in measurement ON without filling fields
    const trackSwitch = screen.getByRole('switch', {
      name: /track in measurement/i,
    })
    await user.click(trackSwitch)

    // Then validation message shows both fields required
    await waitFor(() => {
      expect(
        screen.getByText(
          /measurement unit and amount per package are required/i,
        ),
      ).toBeInTheDocument()
    })

    // When user fills in measurement unit
    const measurementUnitInput = screen.getByLabelText(/measurement unit/i)
    await user.type(measurementUnitInput, 'g')

    // Then validation message shows only amount per package required
    await waitFor(() => {
      expect(
        screen.getByText(/amount per package is required/i),
      ).toBeInTheDocument()
    })

    // When user fills in amount per package
    const amountPerPackageInput = screen.getByLabelText(/amount per package/i)
    await user.type(amountPerPackageInput, '500')

    // Then validation message disappears
    await waitFor(() => {
      expect(screen.queryByText(/required/i)).not.toBeInTheDocument()
    })
  })

  it('save button becomes disabled after successful save', async () => {
    const user = userEvent.setup()

    // Given an item
    const item = await createItem({
      name: 'Test Item',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toBeInTheDocument()
    })

    const saveButton = screen.getByRole('button', { name: /save/i })

    // Initially disabled (no changes)
    expect(saveButton).toBeDisabled()

    // When user changes packed quantity
    const packedInput = screen.getByLabelText(/^packed/i)
    await user.clear(packedInput)
    await user.type(packedInput, '5')

    // Save button becomes enabled
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled()
    })

    // When user saves the form
    await user.click(saveButton)

    // Then save button becomes disabled again (form is clean)
    await waitFor(async () => {
      const updatedItem = await db.items.get(item.id)
      expect(updatedItem?.packedQuantity).toBe(5)
      expect(saveButton).toBeDisabled()
    })
  })

  it('shows pack unpacked button always', async () => {
    // Given an item with some unpacked quantity
    const item = await createItem({
      name: 'Test Item',
      packageUnit: 'bottle',
      targetUnit: 'package',
      targetQuantity: 10,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0.5,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    // When page loads
    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toBeInTheDocument()
    })

    // Then pack unpacked button is visible
    expect(
      screen.getByRole('button', { name: /pack unpacked/i }),
    ).toBeInTheDocument()
  })

  it('disables pack button when tracking measurement without amountPerPackage', async () => {
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'measurement',
      measurementUnit: 'g',
      amountPerPackage: undefined,
      targetQuantity: 1000,
      refillThreshold: 200,
      packedQuantity: 0,
      unpackedQuantity: 150,
      consumeAmount: 50,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /pack unpacked/i })
      expect(button).toBeDisabled()
    })
  })

  it('enables pack button when package mode and unpacked >= 1', async () => {
    const item = await createItem({
      name: 'Test Item',
      packageUnit: 'bottle',
      targetUnit: 'package',
      targetQuantity: 10,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 1.5,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /pack unpacked/i })
      expect(button).toBeEnabled()
    })
  })

  it('enables pack button when measurement mode and unpacked >= amountPerPackage', async () => {
    const item = await createItem({
      name: 'Test Item',
      packageUnit: 'pack',
      targetUnit: 'measurement',
      measurementUnit: 'g',
      amountPerPackage: 1000,
      targetQuantity: 3000,
      refillThreshold: 500,
      packedQuantity: 1,
      unpackedQuantity: 1500,
      consumeAmount: 100,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /pack unpacked/i })
      expect(button).toBeEnabled()
    })
  })

  it('packs unpacked quantity when pack button clicked', async () => {
    const item = await createItem({
      name: 'Olive Oil',
      packedQuantity: 1,
      unpackedQuantity: 2500,
      targetUnit: 'measurement',
      measurementUnit: 'g',
      amountPerPackage: 1000,
      packageUnit: 'bottle',
      targetQuantity: 5000,
      refillThreshold: 1000,
      consumeAmount: 100,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByDisplayValue('1')).toBeInTheDocument() // packedQuantity
      expect(screen.getByDisplayValue('2500')).toBeInTheDocument() // unpackedQuantity
    })

    const button = screen.getByRole('button', { name: /pack unpacked/i })
    fireEvent.click(button)

    // Should pack 2 bottles (2000g) and leave 500g unpacked
    await waitFor(() => {
      expect(screen.getByDisplayValue('3')).toBeInTheDocument() // packedQuantity: 1 + 2 = 3
      expect(screen.getByDisplayValue('500')).toBeInTheDocument() // unpackedQuantity: 2500 - 2000 = 500
    })

    // Button should still be disabled (500 < 1000)
    expect(button).toBeDisabled()
  })

  it('user can pack unpacked then save without quantities reverting', async () => {
    const user = userEvent.setup()

    // Given an item with 1 packed and 2500g unpacked
    const item = await createItem({
      name: 'Olive Oil',
      packedQuantity: 1,
      unpackedQuantity: 2500,
      targetUnit: 'measurement',
      measurementUnit: 'g',
      amountPerPackage: 1000,
      packageUnit: 'bottle',
      targetQuantity: 5000,
      refillThreshold: 1000,
      consumeAmount: 100,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByDisplayValue('1')).toBeInTheDocument() // packedQuantity
      expect(screen.getByDisplayValue('2500')).toBeInTheDocument() // unpackedQuantity
    })

    // When user clicks "Pack unpacked"
    const packButton = screen.getByRole('button', { name: /pack unpacked/i })
    fireEvent.click(packButton)

    // Form updates: 1+2=3 packed, 2500-2000=500 unpacked
    await waitFor(() => {
      expect(screen.getByDisplayValue('3')).toBeInTheDocument()
      expect(screen.getByDisplayValue('500')).toBeInTheDocument()
    })

    // When user clicks "Save"
    const saveButton = screen.getByRole('button', { name: /save/i })
    await user.click(saveButton)

    // Then quantities should NOT revert to old values after save
    await waitFor(() => {
      expect(screen.getByDisplayValue('3')).toBeInTheDocument()
      expect(screen.getByDisplayValue('500')).toBeInTheDocument()
    })

    // And the database should have the correct packed values
    const savedItem = await db.items.get(item.id)
    expect(savedItem?.packedQuantity).toBe(3)
    expect(savedItem?.unpackedQuantity).toBe(500)
  })

  it('user can see updated quantities after pantry +/- when reopening detail page', async () => {
    // Given an item already cached in TanStack Query (previous visit to detail page)
    // consumeAmount: 2 avoids ambiguity with unpackedQuantity: 1 in assertions
    const item = await createItem({
      name: 'Milk',
      packedQuantity: 5,
      unpackedQuantity: 0,
      targetUnit: 'package',
      packageUnit: 'bottle',
      targetQuantity: 10,
      refillThreshold: 2,
      consumeAmount: 2,
      tagIds: [],
    })

    // First render: populate the cache with initial data
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider
          router={createRouter({
            routeTree,
            history: createMemoryHistory({
              initialEntries: [`/items/${item.id}`],
            }),
          })}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('5')).toBeInTheDocument() // packedQuantity
    })

    unmount()

    // Simulate pantry +/- updating the DB (packedQuantity goes from 5 to 4)
    await db.items.update(item.id, {
      packedQuantity: 4,
      unpackedQuantity: 1,
      updatedAt: new Date(),
    })

    // Re-render (simulates navigating back to detail page with stale cache)
    // Cache has old data (packedQuantity: 5), DB has new data (packedQuantity: 4)
    queryClient.invalidateQueries({ queryKey: ['items', item.id] })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider
          router={createRouter({
            routeTree,
            history: createMemoryHistory({
              initialEntries: [`/items/${item.id}`],
            }),
          })}
        />
      </QueryClientProvider>,
    )

    // Should show updated quantities from the refetch (not stale cached values)
    await waitFor(() => {
      expect(screen.getByDisplayValue('4')).toBeInTheDocument() // packedQuantity: updated
      expect(screen.getByDisplayValue('1')).toBeInTheDocument() // unpackedQuantity: updated
    })
  })
})
