// src/routes/items/$id.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  createItem,
  createLocation,
  createRecipe,
  getItem,
  getItemStock,
  getItemStocks,
  getRecipes,
  upsertItemStock,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { elementAt } from '@/test/narrow'
import { watchUnhandledRejections } from '@/test/unhandledRejections'
import { DEFAULT_LOCATION_ID } from '@/types'

describe('Item detail page - manual quantity input', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    // Clear sessionStorage (used by useAppNavigation)
    sessionStorage.clear()
  })

  // Stock fields (packed/unpacked/measurement/expiration/consume) now live on
  // the dedicated Stock tab at `/items/$id/stock`. Default the helper there so
  // the manual-quantity tests exercise the stock form.
  const renderItemDetailPage = (
    itemId: string,
    initialPath = `/items/${itemId}/stock`,
  ) => {
    const history = createMemoryHistory({
      initialEntries: [initialPath],
    })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
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
      const updatedItem = await getItemStock(item.id)
      expect(updatedItem?.packedQuantity).toBe(5)
    })

    // And one stock count log row is written: +3, 5 packs after
    // (design 2026-11-25, inventory log layout; until then a manual save
    // wrote no log)
    await waitFor(async () => {
      const logs = await db.inventoryLogs
        .where('itemId')
        .equals(item.id)
        .toArray()
      expect(logs).toHaveLength(1)
      expect(elementAt(logs, 0)).toMatchObject({
        logKey: 'stockCount',
        delta: 3,
        quantity: 5,
      })
    })
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
      const updatedItem = await getItemStock(item.id)
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

    // The measurement settings are global to the item, so they live on
    // the Info tab, not the per-location Stock tab.
    renderItemDetailPage(item.id, `/items/${item.id}`)

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

    // The measurement settings are global to the item, so they live on
    // the Info tab, not the per-location Stock tab.
    renderItemDetailPage(item.id, `/items/${item.id}`)

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

    // The measurement settings are global to the item, so they live on
    // the Info tab, not the per-location Stock tab.
    renderItemDetailPage(item.id, `/items/${item.id}`)

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

    // The measurement settings are global to the item, so they live on
    // the Info tab, not the per-location Stock tab.
    renderItemDetailPage(item.id, `/items/${item.id}`)

    await waitFor(() => {
      expect(screen.getByLabelText(/measurement unit/i)).toBeInTheDocument()
    })

    // When user toggles track in measurement ON without filling fields
    const trackSwitch = screen.getByRole('switch', {
      name: /track in measurement/i,
    })
    await user.click(trackSwitch)

    // Then field-level errors show both fields required
    await waitFor(() => {
      expect(
        screen.getByText(/measurement unit is required/i),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByText(/amount per package is required/i),
    ).toBeInTheDocument()

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
      const updatedItem = await getItemStock(item.id)
      expect(updatedItem?.packedQuantity).toBe(5)
      expect(saveButton).toBeDisabled()
    })
  })

  it('shows pack and unpack buttons', async () => {
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

    // Then pack and unpack buttons are visible
    expect(screen.getByRole('button', { name: 'Pack' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unpack' })).toBeInTheDocument()
  })

  it('disables pack button when tracking measurement without amountPerPackage', async () => {
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'measurement',
      measurementUnit: 'g',
      // `amountPerPackage` is deliberately ABSENT: the Pack button is
      // disabled because the item has no packing ratio.
      targetQuantity: 1000,
      refillThreshold: 200,
      packedQuantity: 0,
      unpackedQuantity: 150,
      consumeAmount: 50,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Pack' })
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
      const button = screen.getByRole('button', { name: 'Pack' })
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
      const button = screen.getByRole('button', { name: 'Pack' })
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

    const button = screen.getByRole('button', { name: 'Pack' })
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

    // When user clicks "Pack"
    const packButton = screen.getByRole('button', { name: 'Pack' })
    fireEvent.click(packButton)

    // Form updates: 1+2=3 packed, 2500-2000=500 unpacked
    await waitFor(() => {
      expect(screen.getByDisplayValue('3')).toBeInTheDocument()
      expect(screen.getByDisplayValue('500')).toBeInTheDocument()
    })

    // When user clicks "Save"
    const saveButton = screen.getByRole('button', { name: /save/i })
    await user.click(saveButton)

    // Then the database should have the correct packed values (not reverted)
    await waitFor(async () => {
      const savedItem = await getItemStock(item.id)
      expect(savedItem?.packedQuantity).toBe(3)
      expect(savedItem?.unpackedQuantity).toBe(500)
    })
  })

  it('disables unpack button when packedQuantity is 0', async () => {
    // Given an item with 0 packed quantity
    const item = await createItem({
      name: 'Test Item',
      packageUnit: 'bottle',
      targetUnit: 'package',
      targetQuantity: 10,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Unpack' })
      expect(button).toBeDisabled()
    })
  })

  it('enables unpack button when packedQuantity >= 1', async () => {
    // Given an item with 2 packed
    const item = await createItem({
      name: 'Test Item',
      packageUnit: 'bottle',
      targetUnit: 'package',
      targetQuantity: 10,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Unpack' })
      expect(button).toBeEnabled()
    })
  })

  it('unpacks 1 package when unpack button clicked in package mode', async () => {
    // Given an item with 3 packed and 0.5 unpacked
    const item = await createItem({
      name: 'Test Item',
      packageUnit: 'bottle',
      targetUnit: 'package',
      targetQuantity: 10,
      refillThreshold: 5,
      packedQuantity: 3,
      unpackedQuantity: 0.5,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toBeInTheDocument()
    })

    const packedInput = screen.getByLabelText(/^packed/i)
    const unpackedInput = screen.getByLabelText(/^unpacked/i)
    expect(packedInput).toHaveValue(3)
    expect(unpackedInput).toHaveValue(0.5)

    // When user clicks Unpack
    const button = screen.getByRole('button', { name: 'Unpack' })
    fireEvent.click(button)

    // Then 1 package moves from packed to unpacked
    await waitFor(() => {
      expect(packedInput).toHaveValue(2) // packedQuantity: 3 - 1
      expect(unpackedInput).toHaveValue(1.5) // unpackedQuantity: 0.5 + 1
    })
  })

  it('unpacks 1 package using amountPerPackage in measurement mode', async () => {
    // Given an item with 3 packed and 500g unpacked, 1000g per bottle
    const item = await createItem({
      name: 'Olive Oil',
      packageUnit: 'bottle',
      targetUnit: 'measurement',
      measurementUnit: 'g',
      amountPerPackage: 1000,
      targetQuantity: 5000,
      refillThreshold: 2000,
      packedQuantity: 3,
      unpackedQuantity: 500,
      consumeAmount: 100,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toBeInTheDocument()
    })

    const packedInput = screen.getByLabelText(/^packed/i)
    const unpackedInput = screen.getByLabelText(/^unpacked/i)
    expect(packedInput).toHaveValue(3)
    expect(unpackedInput).toHaveValue(500)

    // When user clicks Unpack
    const button = screen.getByRole('button', { name: 'Unpack' })
    fireEvent.click(button)

    // Then 1 bottle is unpacked: 3-1=2 packed, 500+1000=1500 unpacked
    await waitFor(() => {
      expect(packedInput).toHaveValue(2)
      expect(unpackedInput).toHaveValue(1500)
    })
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
              initialEntries: [`/items/${item.id}/stock`],
            }),
          })}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('5')).toBeInTheDocument() // packedQuantity
    })

    unmount()

    // Simulate pantry +/- updating the DB (packedQuantity goes from 5 to 4).
    // Stock now lives on the active-location ItemStock, not the item row.
    await upsertItemStock(item.id, DEFAULT_LOCATION_ID, {
      packedQuantity: 4,
      unpackedQuantity: 1,
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
              initialEntries: [`/items/${item.id}/stock`],
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

  it('user can navigate back with back button when navigation history exists', async () => {
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

    // And navigation history exists (user came from pantry page)
    sessionStorage.setItem(
      'app-navigation-history',
      JSON.stringify(['/', `/items/${item.id}`]),
    )

    const router = renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByText('Test Item')).toBeInTheDocument()
    })

    // When user clicks back button (now a button, not a link)
    const backButton = screen.getByRole('button', { name: /back/i })
    await user.click(backButton)

    // Then navigates back to previous page (pantry). Read the router: jsdom's
    // `window.location` is `/` whatever a memory history does.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
  })

  it('user can navigate back after deleting item', async () => {
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

    // And navigation history exists (user came from pantry page)
    sessionStorage.setItem(
      'app-navigation-history',
      JSON.stringify(['/', `/items/${item.id}`]),
    )

    // Delete lives on the Info tab (index route)
    const router = renderItemDetailPage(item.id, `/items/${item.id}`)

    await waitFor(() => {
      expect(screen.getByText('Test Item')).toBeInTheDocument()
    })

    // When user deletes the item and confirms. (This test used to click the
    // last button and stub `window.confirm`, which the page never calls. It
    // never confirmed, and its `window.location` check passed anyway.)
    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: /^delete$/i,
      }),
    )

    // Then navigates back to previous page (pantry). Read the ROUTER, not
    // `window.location`: the memory history never changes jsdom's URL, which
    // is `/` from the start, so that check passed whatever the page did.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
  })

  // A save no longer leaves the page (design 2026-11-24, part A). The test
  // that said it did is replaced by `$id/saveStays.test.tsx`. It also read
  // `window.location`, which a memory history never changes, so it could not
  // fail.
})

describe('Item detail page - hierarchical navigation', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemDetailPage = (itemId: string, initialPath?: string) => {
    const history = createMemoryHistory({
      initialEntries: [initialPath || `/items/${itemId}`],
    })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    return router
  }

  it('back button skips tab navigation and goes to previous app page', async () => {
    const user = userEvent.setup()

    // Given an item with navigation history: pantry -> item detail -> tags tab
    const item = await createItem({
      name: 'Test Item',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    sessionStorage.setItem(
      'app-navigation-history',
      JSON.stringify(['/', `/items/${item.id}`, `/items/${item.id}/tags`]),
    )

    // When rendering tags tab
    const router = renderItemDetailPage(item.id, `/items/${item.id}/tags`)

    await waitFor(() => {
      expect(screen.getByText('Test Item')).toBeInTheDocument()
    })

    // And user clicks back button
    const backButton = screen.getByRole('button', { name: /back/i })
    await user.click(backButton)

    // Then navigates back to pantry (skips item detail index tab)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
  })

  it('back button falls back to / (pantry) when no valid history exists', async () => {
    const user = userEvent.setup()

    // Given an item with no navigation history
    const item = await createItem({
      name: 'Test Item',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    // When rendering item detail page with no history
    const router = renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByText('Test Item')).toBeInTheDocument()
    })

    // And user clicks back button
    const backButton = screen.getByRole('button', { name: /back/i })
    await user.click(backButton)

    // Then falls back to pantry
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
  })
})

describe('Item detail page - delete dialog', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    await db.shoppingCarts.clear()
    await db.cartItems.clear()
    sessionStorage.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderWithRouter = (initialPath: string) => {
    const history = createMemoryHistory({
      initialEntries: [initialPath],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  it('user can open delete dialog', async () => {
    // Given an item
    const item = await createItem({
      name: 'Milk',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
    })

    // When user navigates to item detail page
    renderWithRouter(`/items/${item.id}`)

    // Then delete button is visible
    const deleteButton = await screen.findByRole('button', {
      name: /^delete$/i,
    })
    expect(deleteButton).toBeInTheDocument()

    // When user clicks delete button
    await userEvent.click(deleteButton)

    // Then delete dialog appears
    expect(screen.getByText('Delete Item?')).toBeInTheDocument()
    expect(
      screen.getByText(
        /This will permanently remove this item and its history/i,
      ),
    ).toBeInTheDocument()
  })

  it('user can see delete confirmation dialog', async () => {
    // Given an item with related data
    const item = await createItem({
      name: 'Milk',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
    })
    await db.inventoryLogs.add({
      id: crypto.randomUUID(),
      itemId: item.id,
      delta: 5,
      quantity: 5,
      occurredAt: new Date(),
      createdAt: new Date(),
    })
    // `ShoppingCart` is `{ id, lastPurchasedAt? }` (packages/types/src/index.ts:149).
    // The cascade finds cart items by `itemId`, so the cart needs its id only.
    const cartId = await db.shoppingCarts.add({ id: crypto.randomUUID() })
    await db.cartItems.add({
      id: crypto.randomUUID(),
      cartId: cartId,
      itemId: item.id,
      quantity: 3,
    })

    // When user opens delete dialog
    renderWithRouter(`/items/${item.id}`)
    const deleteButton = await screen.findByRole('button', {
      name: /^delete$/i,
    })
    await userEvent.click(deleteButton)

    // Then dialog shows warning message (not detailed counts)
    expect(screen.getByText('Delete Item?')).toBeInTheDocument()
    expect(
      screen.getByText(
        /This will permanently remove this item and its history/i,
      ),
    ).toBeInTheDocument()
  })

  it('user can confirm deletion and related data is cascaded', async () => {
    // Given an item with related data
    const item = await createItem({
      name: 'Milk',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
    })
    const logId = crypto.randomUUID()
    await db.inventoryLogs.add({
      id: logId,
      itemId: item.id,
      delta: 5,
      quantity: 5,
      occurredAt: new Date(),
      createdAt: new Date(),
    })
    // `ShoppingCart` is `{ id, lastPurchasedAt? }` (packages/types/src/index.ts:149).
    // The cascade finds cart items by `itemId`, so the cart needs its id only.
    const cartId = await db.shoppingCarts.add({ id: crypto.randomUUID() })
    const cartItemId = crypto.randomUUID()
    await db.cartItems.add({
      id: cartItemId,
      cartId: cartId,
      itemId: item.id,
      quantity: 3,
    })

    // When user confirms deletion
    const router = renderWithRouter(`/items/${item.id}`)
    const deleteButton = await screen.findByRole('button', {
      name: /^delete$/i,
    })
    await userEvent.click(deleteButton)

    const confirmButton = screen.getByRole('button', { name: /^delete$/i })
    await userEvent.click(confirmButton)

    // Then item and related data are deleted
    await waitFor(async () => {
      const deletedItem = await db.items.get(item.id)
      expect(deletedItem).toBeUndefined()

      const deletedLog = await db.inventoryLogs.get(logId)
      expect(deletedLog).toBeUndefined()

      const deletedCartItem = await db.cartItems.get(cartItemId)
      expect(deletedCartItem).toBeUndefined()
    })

    // And user is navigated away from detail page (the router, not jsdom's
    // `window.location`, which a memory history never changes)
    await waitFor(() => {
      expect(router.state.location.pathname).not.toBe(`/items/${item.id}`)
    })
  })

  it('user can cancel item deletion', async () => {
    // Given an item
    const item = await createItem({
      name: 'Milk',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
    })

    // When user opens and cancels delete dialog
    renderWithRouter(`/items/${item.id}`)
    const deleteButton = await screen.findByRole('button', {
      name: /^delete$/i,
    })
    await userEvent.click(deleteButton)

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    await userEvent.click(cancelButton)

    // Then dialog closes
    await waitFor(() => {
      expect(screen.queryByText('Delete item?')).not.toBeInTheDocument()
    })

    // And item is not deleted
    const stillExists = await db.items.get(item.id)
    expect(stillExists).toBeDefined()
    expect(stillExists?.name).toBe('Milk')
  })
})

describe('Item detail page - expiration field split', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
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
    return router
  }

  it('user sees "Expires in" in info section when expiration mode is days-from-purchase', async () => {
    // Given an item with estimatedDueDays set (days mode)
    const item = await createItem({
      name: 'Milk',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      estimatedDueDays: 30,
    })

    renderItemDetailPage(item.id)

    await waitFor(() => screen.getByText('Milk'))
    // The Info tab renders once the item resolves; wait for a field that is
    // part of the global stock settings rather than the item name alone.
    await screen.findByLabelText(/amount per consume/i)

    // Then "Expires in (days)" is visible
    expect(screen.getByLabelText(/expires in/i)).toBeInTheDocument()

    // And "Expires on" date input is NOT visible in stock section
    expect(screen.queryByLabelText(/expires on/i)).not.toBeInTheDocument()
  })

  it('user can change expiration mode from days to date and it persists after reload', async () => {
    const user = userEvent.setup()

    // jsdom polyfills for Radix UI Select
    window.HTMLElement.prototype.hasPointerCapture ??= () => false
    window.HTMLElement.prototype.setPointerCapture ??= () => {}
    window.HTMLElement.prototype.releasePointerCapture ??= () => {}
    window.HTMLElement.prototype.scrollIntoView ??= () => {}

    // Given an item with estimatedDueDays set (days mode)
    const item = await createItem({
      name: 'Cheese',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      estimatedDueDays: 30,
    })

    renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Cheese'))
    // The Info tab renders once the item resolves; wait for a field that is
    // part of the global stock settings rather than the item name alone.
    await screen.findByLabelText(/amount per consume/i)

    // When user changes expiration mode to "Specific Date"
    const modeSelect = screen.getByRole('combobox', {
      name: /calculate expiration/i,
    })
    await user.click(modeSelect)
    const specificDateOption = await screen.findByRole('option', {
      name: /specific date/i,
    })
    await user.click(specificDateOption)

    // And saves
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the saved item has estimatedDueDays cleared so mode resolves to 'date' on reload
    await waitFor(async () => {
      // estimatedDueDays is a GLOBAL Item field since v16.
      const updated = await getItem(item.id)
      // The item should NOT still have estimatedDueDays set
      expect(updated?.estimatedDueDays).toBeFalsy()
    })
  })
})

describe('consumeAmount change — recipe adjustment', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.recipes.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemDetailPage = async (itemId: string) => {
    // Pre-seed the recipes query cache so useRecipes() returns data synchronously on mount,
    // eliminating race conditions between the item loading and the recipe data being available.
    await queryClient.prefetchQuery({
      queryKey: ['recipes'],
      queryFn: getRecipes,
    })

    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  it('user sees confirm dialog when changing consumeAmount affects a recipe', async () => {
    const user = userEvent.setup()

    // Given an item with consumeAmount 2 linked to a recipe with defaultAmount 4
    const item = await createItem({
      name: 'Flour',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 2,
      tagIds: [],
    })
    await createRecipe({
      name: 'Bread',
      items: [{ itemId: item.id, defaultAmount: 4 }],
    })

    await renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Flour'))
    // The Info tab renders once the item resolves; wait for a field that is
    // part of the global stock settings rather than the item name alone.
    await screen.findByLabelText(/amount per consume/i)

    // When user changes consumeAmount from 2 to 3
    const consumeInput = screen.getByLabelText(
      /amount per consume/i,
    ) as HTMLInputElement
    await user.clear(consumeInput)
    await user.type(consumeInput, '3')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then a confirm dialog appears listing the affected recipe
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(screen.getByText(/update recipe amounts/i)).toBeInTheDocument()
      expect(screen.getByText('Bread')).toBeInTheDocument()
    })
  })

  it('user can confirm and recipe defaultAmount is adjusted to nearest multiple', async () => {
    const user = userEvent.setup()

    // Given item with consumeAmount 2, recipe with defaultAmount 4 (2 servings)
    const item = await createItem({
      name: 'Flour',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 2,
      tagIds: [],
    })
    const recipe = await createRecipe({
      name: 'Bread',
      items: [{ itemId: item.id, defaultAmount: 4 }],
    })

    await renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Flour'))
    // The Info tab renders once the item resolves; wait for a field that is
    // part of the global stock settings rather than the item name alone.
    await screen.findByLabelText(/amount per consume/i)

    // When changing consumeAmount to 3 and confirming
    const consumeInput = screen.getByLabelText(
      /amount per consume/i,
    ) as HTMLInputElement
    await user.clear(consumeInput)
    await user.type(consumeInput, '3')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => screen.getByRole('alertdialog'))
    await user.click(screen.getByRole('button', { name: /update & save/i }))

    // Then recipe defaultAmount is adjusted: round(4/3)*3 = 3
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      const ri = updated?.items.find((r) => r.itemId === item.id)
      expect(ri?.defaultAmount).toBe(3)
    })
  })

  it('recipes with defaultAmount 0 are not affected', async () => {
    const user = userEvent.setup()

    // Given item with consumeAmount 2, recipe with defaultAmount 0 (optional ingredient)
    const item = await createItem({
      name: 'Salt',
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 2,
      tagIds: [],
    })
    await createRecipe({
      name: 'Soup',
      items: [{ itemId: item.id, defaultAmount: 0 }],
    })

    await renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Salt'))
    // The Info tab renders once the item resolves; wait for a field that is
    // part of the global stock settings rather than the item name alone.
    await screen.findByLabelText(/amount per consume/i)

    // When changing consumeAmount to 3 and saving
    const consumeInput = screen.getByLabelText(
      /amount per consume/i,
    ) as HTMLInputElement
    await user.clear(consumeInput)
    await user.type(consumeInput, '3')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then NO dialog appears (no affected recipes)
    await waitFor(async () => {
      // consumeAmount is a GLOBAL Item field since v16.
      const updated = await getItem(item.id)
      expect(updated?.consumeAmount).toBe(3)
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('rounds up to new consumeAmount when nearest multiple would be 0', async () => {
    const user = userEvent.setup()

    // Given item with consumeAmount 2, recipe with defaultAmount 1
    // round(1/3)*3 = 0, but we round up to 3 (1× newConsumeAmount)
    const item = await createItem({
      name: 'Oil',
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 2,
      tagIds: [],
    })
    const recipe = await createRecipe({
      name: 'Salad',
      items: [{ itemId: item.id, defaultAmount: 1 }],
    })

    await renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Oil'))
    // The Info tab renders once the item resolves; wait for a field that is
    // part of the global stock settings rather than the item name alone.
    await screen.findByLabelText(/amount per consume/i)

    // When changing consumeAmount to 3 and confirming
    const consumeInput = screen.getByLabelText(
      /amount per consume/i,
    ) as HTMLInputElement
    await user.clear(consumeInput)
    await user.type(consumeInput, '3')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => screen.getByRole('alertdialog'))
    await user.click(screen.getByRole('button', { name: /update & save/i }))

    // Then defaultAmount is rounded up to 3 (not 0)
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      const ri = updated?.items.find((r) => r.itemId === item.id)
      expect(ri?.defaultAmount).toBe(3)
    })
  })
})

describe('targetUnit change — recipe adjustment', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.recipes.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemDetailPage = async (itemId: string) => {
    // Pre-seed the recipes query cache so useRecipes() returns data synchronously on mount,
    // eliminating race conditions between the item loading and the recipe data being available.
    await queryClient.prefetchQuery({
      queryKey: ['recipes'],
      queryFn: getRecipes,
    })

    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  it('user can switch measurement to package and recipe defaultAmount converts via amountPerPackage ratio', async () => {
    const user = userEvent.setup()

    // Given an item tracked in measurement: consumeAmount 100g, amountPerPackage 500
    const item = await createItem({
      name: 'Flour',
      packageUnit: 'pack',
      measurementUnit: 'g',
      amountPerPackage: 500,
      targetUnit: 'measurement',
      targetQuantity: 1000,
      refillThreshold: 200,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 100,
      tagIds: [],
    })
    // And a recipe using 500g (= 1 pack) per serving
    const recipe = await createRecipe({
      name: 'Bread',
      items: [{ itemId: item.id, defaultAmount: 500 }],
    })

    await renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Flour'))
    // The Info tab renders once the item resolves; wait for a field that is
    // part of the global stock settings rather than the item name alone.
    await screen.findByLabelText(/amount per consume/i)

    // When user toggles track in measurement OFF (switching to package mode)
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then a confirm dialog appears listing the affected recipe
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(screen.getByText('Bread')).toBeInTheDocument()
    })

    // When user confirms
    await user.click(screen.getByRole('button', { name: /update & save/i }))

    // Then recipe defaultAmount converts: 500g / 500 = 1 pack, snapped to consumeAmount 0.2
    // calcRecipeDefaultAfterUnitSwitch(500, 500, 'package', 0.2):
    //   ratio = 500/500 = 1; nearest = round(1/0.2)*0.2 = 5*0.2 = 1.0
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      const ri = updated?.items.find((r) => r.itemId === item.id)
      expect(ri?.defaultAmount).toBe(1)
    })
  })

  it('user can switch package to measurement and recipe defaultAmount converts via amountPerPackage ratio', async () => {
    const user = userEvent.setup()

    // Given an item tracked in package: consumeAmount 1 pack, amountPerPackage 500
    // (measurementUnit and amountPerPackage must be pre-filled so form can submit)
    const item = await createItem({
      name: 'Flour',
      packageUnit: 'pack',
      measurementUnit: 'g',
      amountPerPackage: 500,
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    // And a recipe using 2 packs per serving
    const recipe = await createRecipe({
      name: 'Bread',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    await renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Flour'))
    // The Info tab renders once the item resolves; wait for a field that is
    // part of the global stock settings rather than the item name alone.
    await screen.findByLabelText(/amount per consume/i)

    // When user toggles track in measurement ON (switching to measurement mode)
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then a confirm dialog appears
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(screen.getByText('Bread')).toBeInTheDocument()
    })

    // When user confirms
    await user.click(screen.getByRole('button', { name: /update & save/i }))

    // Then recipe defaultAmount converts: 2 packs * 500g = 1000g, snapped to consumeAmount 500
    // calcRecipeDefaultAfterUnitSwitch(2, 500, 'measurement', 500):
    //   ratio = 2*500 = 1000; nearest = round(1000/500)*500 = 2*500 = 1000
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      const ri = updated?.items.find((r) => r.itemId === item.id)
      expect(ri?.defaultAmount).toBe(1000)
    })
  })

  it('user can switch unit mode without affecting a recipe that has defaultAmount 0', async () => {
    const user = userEvent.setup()

    // Given an item in measurement mode and a recipe with defaultAmount 0 (optional ingredient)
    const item = await createItem({
      name: 'Salt',
      packageUnit: 'pack',
      measurementUnit: 'g',
      amountPerPackage: 500,
      targetUnit: 'measurement',
      targetQuantity: 500,
      refillThreshold: 100,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 5,
      tagIds: [],
    })
    await createRecipe({
      name: 'Soup',
      items: [{ itemId: item.id, defaultAmount: 0 }],
    })

    await renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Salt'))
    // The Info tab renders once the item resolves; wait for a field that is
    // part of the global stock settings rather than the item name alone.
    await screen.findByLabelText(/amount per consume/i)

    // When user switches to package mode and saves
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the confirm dialog lists NO recipe — calcRecipeDefaultAfterUnitSwitch(0, …)
    // returns 0 early, so 0 === 0 and Soup is skipped. It still appears,
    // because the switch converts this location's stock quantities.
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).queryByText('Soup')).not.toBeInTheDocument()

    // And confirming saves the unit and leaves the recipe amount at 0
    await user.click(screen.getByRole('button', { name: /update & save/i }))
    await waitFor(async () => {
      // targetUnit is a GLOBAL Item field since v16.
      const updated = await getItem(item.id)
      expect(updated?.targetUnit).toBe('package')
    })
    const recipes = await getRecipes()
    expect(recipes[0]?.items[0]?.defaultAmount).toBe(0)
  })

  it('user can switch unit mode without a dialog when converted defaultAmount is unchanged', async () => {
    const user = userEvent.setup()

    // Given an item with amountPerPackage 1 (1:1 ratio, e.g. 1L per bottle)
    // consumeAmount 0.5L; recipe defaultAmount 2 (= 2L per serving)
    // Switch to package: ratio = 2/1 = 2; nearest = round(2/0.5)*0.5 = 4*0.5 = 2 (unchanged)
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 0.5,
      tagIds: [],
    })
    await createRecipe({
      name: 'Smoothie',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    await renderItemDetailPage(item.id)
    await waitFor(() => screen.getByText('Milk'))
    // The Info tab renders once the item resolves; wait for a field that is
    // part of the global stock settings rather than the item name alone.
    await screen.findByLabelText(/amount per consume/i)

    // When user switches to package mode and saves
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then NO dialog appears (converted value equals old defaultAmount)
    await waitFor(async () => {
      // targetUnit is a GLOBAL Item field since v16.
      const updated = await getItem(item.id)
      expect(updated?.targetUnit).toBe('package')
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

// The designer's ruling (2026-08-22): switching the item's global tracking unit
// must re-express the three per-location quantities that are held in that unit
// — unpacked, target quantity, refill-when-below — in EVERY location. It is
// well defined only because `amountPerPackage` became global in v16, so one
// factor applies everywhere. `packedQuantity` counts sealed packages and is
// never converted.
describe('targetUnit change — per-location stock conversion', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.recipes.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    // Keep the undeletable default location ('My Home'); drop extras.
    await db.locations.where('id').notEqual(DEFAULT_LOCATION_ID).delete()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderInfoTab = async (itemId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  // Three locations with three DIFFERENT sets of numbers: one location cannot
  // tell a real conversion from a no-op, and identical numbers cannot tell
  // "converted each row" from "copied one row over the others".
  const seedThreeLocations = async () => {
    const cabin = await createLocation('Cabin')
    const office = await createLocation('Office')
    const item = await createItem({
      name: 'Flour',
      tagIds: [],
      packageUnit: 'pack',
      measurementUnit: 'g',
      amountPerPackage: 500,
      targetUnit: 'measurement',
      consumeAmount: 100,
      targetQuantity: 1000,
      refillThreshold: 200,
      packedQuantity: 2,
      unpackedQuantity: 250,
    })
    await upsertItemStock(item.id, cabin.id, {
      targetQuantity: 2000,
      refillThreshold: 500,
      packedQuantity: 1,
      unpackedQuantity: 100,
    })
    await upsertItemStock(item.id, office.id, {
      targetQuantity: 500,
      refillThreshold: 250,
      packedQuantity: 3,
      unpackedQuantity: 50,
    })
    return { item, cabin, office }
  }

  const stockByLocation = async (itemId: string) => {
    const rows = await getItemStocks(itemId)
    return new Map(rows.map((r) => [r.locationId, r]))
  }

  it('user switching the tracking unit converts the quantities in every location', async () => {
    const user = userEvent.setup()

    // Given an item tracked in grams (500 g per pack) stocked in three
    // locations, each holding different amounts
    const { item, cabin, office } = await seedThreeLocations()

    await renderInfoTab(item.id)
    await screen.findByLabelText(/amount per consume/i)

    // When the user switches tracking to packages and saves
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then a confirm dialog previews the change for all three locations
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(/update stock numbers/i),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('My Home')).toBeInTheDocument()
    expect(within(dialog).getByText('Cabin')).toBeInTheDocument()
    expect(within(dialog).getByText('Office')).toBeInTheDocument()
    // …each with its OWN before → after numbers, read off its own row
    const rowFor = (name: string) =>
      within(dialog).getByText(name).closest('tr') as HTMLElement
    // My Home: 250 g unpacked → 0.5 packs, 1000 g target → 2 packs
    expect(within(rowFor('My Home')).getByText('250 → 0.5')).toBeInTheDocument()
    expect(within(rowFor('My Home')).getByText('1000 → 2')).toBeInTheDocument()
    expect(within(rowFor('Cabin')).getByText('100 → 0.2')).toBeInTheDocument()
    expect(within(rowFor('Cabin')).getByText('2000 → 4')).toBeInTheDocument()
    expect(within(rowFor('Office')).getByText('50 → 0.1')).toBeInTheDocument()
    expect(within(rowFor('Office')).getByText('500 → 1')).toBeInTheDocument()

    // When the user confirms
    await user.click(screen.getByRole('button', { name: /update & save/i }))

    // Then every location's three tracked quantities are divided by 500 —
    // each from its OWN stored values, not copied from one another
    await waitFor(async () => {
      const rows = await stockByLocation(item.id)
      expect(rows.get(DEFAULT_LOCATION_ID)?.unpackedQuantity).toBe(0.5)
      expect(rows.get(cabin.id)?.unpackedQuantity).toBe(0.2)
      expect(rows.get(office.id)?.unpackedQuantity).toBe(0.1)
    })

    const rows = await stockByLocation(item.id)
    expect(rows.get(DEFAULT_LOCATION_ID)).toMatchObject({
      unpackedQuantity: 0.5,
      targetQuantity: 2,
      refillThreshold: 0.4,
    })
    expect(rows.get(cabin.id)).toMatchObject({
      unpackedQuantity: 0.2,
      targetQuantity: 4,
      refillThreshold: 1,
    })
    expect(rows.get(office.id)).toMatchObject({
      unpackedQuantity: 0.1,
      targetQuantity: 1,
      refillThreshold: 0.5,
    })

    // And the item itself now tracks in packages
    expect((await getItem(item.id))?.targetUnit).toBe('package')
  })

  it('user turning Consumable off drops opened stock and rounds target and refill up to whole packs in every location', async () => {
    const user = userEvent.setup()

    // Given flour tracked in grams (500 g per pack) in three locations, each
    // with opened stock
    const { item, cabin, office } = await seedThreeLocations()

    await renderInfoTab(item.id)
    await screen.findByLabelText(/amount per consume/i)

    // When the user turns Consumable off, saves and confirms
    await user.click(screen.getByRole('switch', { name: /^consumable$/i }))
    await user.click(screen.getByRole('button', { name: /save/i }))
    const dialog = await screen.findByRole('alertdialog')
    const rowFor = (name: string) =>
      within(dialog).getByText(name).closest('tr') as HTMLElement
    // The dialog lists the opened stock going to 0 in every location
    expect(within(rowFor('My Home')).getByText('250 → 0')).toBeInTheDocument()
    expect(within(rowFor('Cabin')).getByText('100 → 0')).toBeInTheDocument()
    expect(within(rowFor('Office')).getByText('50 → 0')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /update & save/i }))

    // Then every location: no opened stock, and target and refill in whole
    // packs, rounded up (200 g is 0.4 of a pack -> 1)
    await waitFor(async () => {
      expect((await getItem(item.id))?.consumable).toBe(false)
    })
    const rows = await stockByLocation(item.id)
    expect(rows.get(DEFAULT_LOCATION_ID)).toMatchObject({
      packedQuantity: 2,
      unpackedQuantity: 0,
      targetQuantity: 2,
      refillThreshold: 1,
    })
    expect(rows.get(cabin.id)).toMatchObject({
      packedQuantity: 1,
      unpackedQuantity: 0,
      targetQuantity: 4,
      refillThreshold: 1,
    })
    expect(rows.get(office.id)).toMatchObject({
      packedQuantity: 3,
      unpackedQuantity: 0,
      targetQuantity: 1,
      refillThreshold: 1,
    })
    expect((await getItem(item.id))?.targetUnit).toBe('package')
  })

  // Only consumable items can be in a recipe (owner decision 2026-11-26).
  // Turning Consumable off removes the item from every recipe, and the
  // dialog says so first.
  it('user turning Consumable off is told how many recipes the item leaves, and it leaves them', async () => {
    const user = userEvent.setup()

    // Given flour in two recipes, and a third recipe without it
    const { item } = await seedThreeLocations()
    const salt = await createItem({
      name: 'Salt',
      tagIds: [],
      consumeAmount: 1,
    })
    const bread = await createRecipe({
      name: 'Bread',
      items: [
        { itemId: item.id, defaultAmount: 200 },
        { itemId: salt.id, defaultAmount: 1 },
      ],
    })
    const cake = await createRecipe({
      name: 'Cake',
      items: [{ itemId: item.id, defaultAmount: 100 }],
    })
    const soup = await createRecipe({
      name: 'Soup',
      items: [{ itemId: salt.id, defaultAmount: 1 }],
    })

    await renderInfoTab(item.id)
    await screen.findByLabelText(/amount per consume/i)

    // When the user turns Consumable off and saves
    await user.click(screen.getByRole('switch', { name: /^consumable$/i }))
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the dialog says the item leaves 2 recipes
    const dialog = await screen.findByRole('alertdialog')
    const recipeLine = within(dialog).getByText(/removed from 2 recipes/i)
    expect(recipeLine).toBeInTheDocument()
    // And it is titled "Mark as not consumable?" even though stock converts
    // (owner request 2026-11-26), with the recipe line BEFORE the conversion
    // line
    expect(
      within(dialog).getByRole('heading', { name: /mark as not consumable/i }),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByText(/update stock numbers/i),
    ).not.toBeInTheDocument()
    const conversionLine = within(dialog).getByText(/opened packs are removed/i)
    expect(
      recipeLine.compareDocumentPosition(conversionLine) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    // When the user confirms
    await user.click(screen.getByRole('button', { name: /update & save/i }))

    // Then flour is in no recipe, and every other link stays
    await waitFor(async () => {
      expect(
        (await db.recipes.get(bread.id))?.items.map((ri) => ri.itemId),
      ).toEqual([salt.id])
    })
    expect((await db.recipes.get(cake.id))?.items).toEqual([])
    expect(
      (await db.recipes.get(soup.id))?.items.map((ri) => ri.itemId),
    ).toEqual([salt.id])
  })

  it('user turning Consumable off for an item with no stock to convert still sees the recipe warning', async () => {
    const user = userEvent.setup()

    // Given a pack-tracked item with whole numbers (nothing to convert) in a recipe
    const cups = await createItem({
      name: 'Cups',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 4,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    const tea = await createRecipe({
      name: 'Tea',
      items: [{ itemId: cups.id, defaultAmount: 1 }],
    })

    await renderInfoTab(cups.id)
    await screen.findByLabelText(/amount per consume/i)

    // When the user turns Consumable off and saves
    await user.click(screen.getByRole('switch', { name: /^consumable$/i }))
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then a dialog still opens, with its own title and the warning
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByRole('heading', { name: /mark as not consumable/i }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/removed from 1 recipe,/i),
    ).toBeInTheDocument()
    // And nothing is written before the user confirms
    expect((await getItem(cups.id))?.consumable).not.toBe(false)

    // When the user cancels
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))

    // Then the item is still consumable and still in the recipe
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect((await getItem(cups.id))?.consumable).not.toBe(false)
    expect((await db.recipes.get(tea.id))?.items).toHaveLength(1)

    // When the user saves again and confirms
    await user.click(screen.getByRole('button', { name: /save/i }))
    await user.click(
      await screen.findByRole('button', { name: /update & save/i }),
    )

    // Then the item is non-consumable and the recipe no longer holds it
    await waitFor(async () => {
      expect((await getItem(cups.id))?.consumable).toBe(false)
    })
    expect((await db.recipes.get(tea.id))?.items).toEqual([])
  })

  it('packed quantity is untouched by the switch in every location', async () => {
    const user = userEvent.setup()

    // Given the same three stocked locations, each with a different packed count
    const { item, cabin, office } = await seedThreeLocations()

    await renderInfoTab(item.id)
    await screen.findByLabelText(/amount per consume/i)

    // When the user switches to packages and confirms
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))
    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: /update & save/i }))

    // Then packedQuantity is unchanged everywhere — it counts sealed packages,
    // which are packages whichever unit the item is tracked in
    await waitFor(async () => {
      expect(
        (await stockByLocation(item.id)).get(DEFAULT_LOCATION_ID)
          ?.targetQuantity,
      ).toBe(2)
    })
    const rows = await stockByLocation(item.id)
    expect(rows.get(DEFAULT_LOCATION_ID)?.packedQuantity).toBe(2)
    expect(rows.get(cabin.id)?.packedQuantity).toBe(1)
    expect(rows.get(office.id)?.packedQuantity).toBe(3)
  })

  it('user can cancel the dialog and no location is changed', async () => {
    const user = userEvent.setup()

    // Given the same three stocked locations
    const { item, cabin, office } = await seedThreeLocations()
    const before = await stockByLocation(item.id)

    await renderInfoTab(item.id)
    await screen.findByLabelText(/amount per consume/i)

    // When the user switches the unit, saves, then cancels the preview
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))
    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    // Then the dialog closes and nothing was written — not the item's unit,
    // and not one number in any location
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect((await getItem(item.id))?.targetUnit).toBe('measurement')
    const after = await stockByLocation(item.id)
    for (const locationId of [DEFAULT_LOCATION_ID, cabin.id, office.id]) {
      expect(after.get(locationId)).toMatchObject({
        unpackedQuantity: before.get(locationId)?.unpackedQuantity,
        targetQuantity: before.get(locationId)?.targetQuantity,
        refillThreshold: before.get(locationId)?.refillThreshold,
        packedQuantity: before.get(locationId)?.packedQuantity,
      })
    }
  })

  // Negative control: green by construction while the feature is intact, and
  // the guard against a save of any kind rewriting inventory.
  it('saving without changing the tracking unit converts nothing', async () => {
    const user = userEvent.setup()

    // Given the same three stocked locations
    const { item, cabin, office } = await seedThreeLocations()
    const before = await stockByLocation(item.id)

    await renderInfoTab(item.id)
    await screen.findByLabelText(/amount per consume/i)

    // When the user edits only the name and saves
    const nameInput = screen.getByLabelText(/^name$/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Bread Flour')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then no dialog appears and every quantity is exactly as it was
    await waitFor(async () => {
      expect((await getItem(item.id))?.name).toBe('Bread Flour')
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    const after = await stockByLocation(item.id)
    for (const locationId of [DEFAULT_LOCATION_ID, cabin.id, office.id]) {
      expect(after.get(locationId)).toMatchObject({
        unpackedQuantity: before.get(locationId)?.unpackedQuantity,
        targetQuantity: before.get(locationId)?.targetQuantity,
        refillThreshold: before.get(locationId)?.refillThreshold,
      })
    }
  })

  it('a location holding nothing is left alone and not listed', async () => {
    const user = userEvent.setup()

    // Given one location with stock and one that is stocked but empty
    const cabin = await createLocation('Cabin')
    const item = await createItem({
      name: 'Rice',
      tagIds: [],
      packageUnit: 'bag',
      measurementUnit: 'g',
      amountPerPackage: 1000,
      targetUnit: 'measurement',
      consumeAmount: 100,
      targetQuantity: 2000,
      refillThreshold: 500,
      packedQuantity: 1,
      unpackedQuantity: 300,
    })
    await upsertItemStock(item.id, cabin.id, {
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
    })

    await renderInfoTab(item.id)
    await screen.findByLabelText(/amount per consume/i)

    // When the user switches to packages and saves
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then only the location whose numbers actually move is previewed
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('My Home')).toBeInTheDocument()
    expect(within(dialog).queryByText('Cabin')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /update & save/i }))

    // And the empty location stays at zero rather than being written to
    await waitFor(async () => {
      const rows = await stockByLocation(item.id)
      expect(rows.get(DEFAULT_LOCATION_ID)?.unpackedQuantity).toBe(0.3)
    })
    const rows = await stockByLocation(item.id)
    expect(rows.get(cabin.id)).toMatchObject({
      unpackedQuantity: 0,
      targetQuantity: 0,
      refillThreshold: 0,
    })
  })

  it('nothing converts when the item has no usable amount per package', async () => {
    const user = userEvent.setup()

    // Given an item tracked in measurement with no amount per package — there
    // is no factor, so no conversion is defensible (same bail as the recipe
    // rescale)
    const item = await createItem({
      name: 'Loose Tea',
      tagIds: [],
      packageUnit: 'tin',
      measurementUnit: 'g',
      targetUnit: 'measurement',
      consumeAmount: 5,
      targetQuantity: 200,
      refillThreshold: 50,
      packedQuantity: 1,
      unpackedQuantity: 75,
    })

    await renderInfoTab(item.id)
    await screen.findByLabelText(/amount per consume/i)

    // When the user switches to packages and saves
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the unit change saves with no dialog and no quantity is touched
    await waitFor(async () => {
      expect((await getItem(item.id))?.targetUnit).toBe('package')
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(
      (await stockByLocation(item.id)).get(DEFAULT_LOCATION_ID),
    ).toMatchObject({
      unpackedQuantity: 75,
      targetQuantity: 200,
      refillThreshold: 50,
    })
  })
})

describe('Item detail page - toolbar tabs', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemDetailPage = (itemId: string, initialPath?: string) => {
    const history = createMemoryHistory({
      initialEntries: [initialPath || `/items/${itemId}`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  it('user sees discard dialog when leaving the Info tab with unsaved changes', async () => {
    const user = userEvent.setup()

    // Given an item shown on the Info tab
    const item = await createItem({
      name: 'Test Item',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(item.id, `/items/${item.id}`)

    await waitFor(() => {
      expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument()
    })

    // When the user edits the name (making the Info form dirty)
    const nameInput = screen.getByLabelText(/^name$/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Renamed Item')

    // And clicks another tab (Stock)
    const stockLink = screen
      .getAllByRole('link')
      .find((l) => l.getAttribute('href') === `/items/${item.id}/stock`)
    expect(stockLink).toBeDefined()
    if (stockLink) await user.click(stockLink)

    // Then the discard dialog appears
    await waitFor(() => {
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    })
  })

  it('user sees discard dialog when leaving the Stock tab with unsaved changes', async () => {
    const user = userEvent.setup()

    // Given an item shown on the Stock tab
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

    renderItemDetailPage(item.id, `/items/${item.id}/stock`)

    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toBeInTheDocument()
    })

    // When the user edits packed quantity (making the Stock form dirty)
    const packedInput = screen.getByLabelText(/^packed/i)
    await user.clear(packedInput)
    await user.type(packedInput, '5')

    // And clicks another tab (Info / index)
    const infoLink = screen
      .getAllByRole('link')
      .find((l) => l.getAttribute('href') === `/items/${item.id}`)
    expect(infoLink).toBeDefined()
    if (infoLink) await user.click(infoLink)

    // Then the discard dialog appears
    await waitFor(() => {
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    })
  })
})

// The route builds the form's initialValues from the item. It used to write
// `item.consumeAmount ?? 1` there — dead on both counts (`consumeAmount` is a
// required number on Item, and `??` never fires for 0), but it read as though
// an unconfigured item were worth a step of 1, which is exactly the lie the
// form then told with `consumeAmount || 1`. The route now passes 0 through.
//
// (From commit a203c204.) `consumeAmount: 0` means "no step size" and is shown as
// stored — nothing may fabricate a 1 for it. 0 stopped being the create default
// on 2026-08-24, so both fixtures set it EXPLICITLY; they must keep doing so, or
// they would create consumeAmount-1 items and pin nothing.
describe('Item detail form — a consume amount of 0 is displayed honestly', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemDetailPage = (initialPath: string) => {
    const history = createMemoryHistory({ initialEntries: [initialPath] })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user sees 0 in Amount per Consume for an item whose consume amount is 0', async () => {
    // Given an item whose consumeAmount is 0 — set explicitly here, but equally
    // reachable via an import or an item created while 0 was the default
    const item = await createItem({
      name: 'Milk',
      tagIds: [],
      consumeAmount: 0,
    })
    expect((await getItem(item.id))?.consumeAmount).toBe(0)

    // When the user opens the Info tab
    renderItemDetailPage(`/items/${item.id}`)

    // Then the field shows what is stored, not a fabricated 1
    const consumeInput = (await screen.findByLabelText(
      /amount per consume/i,
    )) as HTMLInputElement
    expect(consumeInput.value).toBe('0')
  })

  it('user editing Unpacked for such an item is not rounded to a whole unit', async () => {
    const user = userEvent.setup()

    // Given the same 0-consume-amount item, opened on the Stock tab
    const item = await createItem({
      name: 'Milk',
      tagIds: [],
      consumeAmount: 0,
    })
    renderItemDetailPage(`/items/${item.id}/stock`)
    const unpackedInput = (await screen.findByLabelText(
      /^unpacked/i,
    )) as HTMLInputElement

    // Then the input imposes no step at all
    expect(unpackedInput).toHaveAttribute('step', 'any')

    // When the user types a decimal and leaves the field
    await user.click(unpackedInput)
    await user.keyboard('{Backspace}2.5')
    await user.tab()

    // Then it survives — nothing snapped it to 3
    expect(unpackedInput.value).toBe('2.5')
  })
})

// A failed save (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
// `ItemForm` calls `onSubmit` without awaiting it, so before the fix a failed
// write on the Info or Stock tab was an unhandled rejection with nothing on
// screen. The unit-switch confirm had the same problem.
describe('Item detail page - a failed save', () => {
  let queryClient: QueryClient
  let rejections: ReturnType<typeof watchUnhandledRejections>

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.recipes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    rejections = watchUnhandledRejections()
  })

  afterEach(() => {
    rejections.stop()
    vi.restoreAllMocks()
  })

  const renderPage = async (path: string) => {
    await queryClient.prefetchQuery({
      queryKey: ['recipes'],
      queryFn: getRecipes,
    })
    const history = createMemoryHistory({ initialEntries: [path] })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  const makeFlour = () =>
    createItem({
      name: 'Flour',
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 2,
      tagIds: [],
    })

  it('user sees a message when saving the Stock tab fails, and the edit is kept', async () => {
    const user = userEvent.setup()
    // Given an item, and a database that refuses the stock write
    const item = await makeFlour()
    vi.spyOn(db.itemStocks, 'put').mockRejectedValueOnce(new Error('disk full'))
    const router = await renderPage(`/items/${item.id}/stock`)

    // When the user changes the packed quantity and saves
    const packedInput = await screen.findByLabelText(/^packed/i)
    await user.clear(packedInput)
    await user.type(packedInput, '7')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then a message says the change was not saved
    expect(
      await screen.findByText('Could not save the change. Please try again.'),
    ).toBeInTheDocument()
    // And the page stays, with the typed value and Save enabled again
    expect(router.state.location.pathname).toBe(`/items/${item.id}/stock`)
    expect(screen.getByLabelText(/^packed/i)).toHaveValue(7)
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled()
    expect(
      (await getItemStock(item.id, DEFAULT_LOCATION_ID))?.packedQuantity,
    ).toBe(2)
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees a message when saving the Info tab fails, and the edit is kept', async () => {
    const user = userEvent.setup()
    // Given an item, and a database that refuses the item write
    const item = await makeFlour()
    vi.spyOn(db.items, 'update').mockRejectedValueOnce(new Error('disk full'))
    const router = await renderPage(`/items/${item.id}`)

    // When the user renames it and saves
    const nameInput = await screen.findByRole('textbox', { name: /^name/i })
    await user.clear(nameInput)
    await user.type(nameInput, 'Rye flour')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then a message says the change was not saved, and the page stays
    expect(
      await screen.findByText('Could not save the change. Please try again.'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/items/${item.id}`)
    expect(screen.getByRole('textbox', { name: /^name/i })).toHaveValue(
      'Rye flour',
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled()
    expect((await getItem(item.id))?.name).toBe('Flour')
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })

  it('user sees a message when confirming the recipe update fails', async () => {
    const user = userEvent.setup()
    // Given an item used by a recipe, and a database that refuses the write
    const item = await makeFlour()
    const recipe = await createRecipe({
      name: 'Bread',
      items: [{ itemId: item.id, defaultAmount: 4 }],
    })
    vi.spyOn(db.items, 'update').mockRejectedValueOnce(new Error('disk full'))
    const router = await renderPage(`/items/${item.id}`)

    // When the user changes the consume amount, saves and confirms
    const consumeInput = await screen.findByLabelText(/amount per consume/i)
    await user.clear(consumeInput)
    await user.type(consumeInput, '3')
    await user.click(screen.getByRole('button', { name: /save/i }))
    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: /update & save/i }))

    // Then a message says the change was not saved, and nothing moved
    expect(
      await screen.findByText('Could not save the change. Please try again.'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/items/${item.id}`)
    // The dialog has closed; Save opens it again
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/amount per consume/i)).toHaveValue(3)
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled()
    const stored = await db.recipes.get(recipe.id)
    expect(stored?.items[0]?.defaultAmount).toBe(4)
    await rejections.settle()
    expect(rejections.list).toEqual([])
  })
})
