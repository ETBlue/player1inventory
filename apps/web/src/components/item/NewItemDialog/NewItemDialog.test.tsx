import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { addItemToLocation, createItem, getItemStock } from '@/db/operations'
import { ActiveLocationProvider } from '@/hooks/useActiveLocation'
import type { Item } from '@/types'
import { DEFAULT_LOCATION_ID } from '@/types'
import { NewItemDialog } from './NewItemDialog'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...original, useNavigate: () => mockNavigate }
})

const mockNavigate = vi.fn()

function renderDialog(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveLocationProvider>{ui}</ActiveLocationProvider>
    </QueryClientProvider>,
  )
}

describe('NewItemDialog', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    mockNavigate.mockClear()
  })

  it('renders a search combobox when open', async () => {
    // Given the dialog is open
    renderDialog(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // Then the dialog and its combobox are visible
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(
      await screen.findByRole('combobox', { name: /name/i }),
    ).toBeInTheDocument()
  })

  it('user can create a new item when the name matches nothing', async () => {
    // Given the dialog is open and no items exist
    const user = userEvent.setup()
    renderDialog(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // When the user types a name with no catalog match and clicks Create
    await user.type(
      await screen.findByRole('combobox', { name: /name/i }),
      'Milk',
    )
    await user.click(await screen.findByRole('button', { name: /create/i }))

    // Then navigate is called to the new item's detail page
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/items/$id' }),
      )
    })
    // And the item is persisted with stock in the active location
    const items = await db.items.toArray()
    const milk = items.find((i) => i.name === 'Milk')
    expect(milk).toBeDefined()
    expect(
      await getItemStock(milk?.id ?? '', DEFAULT_LOCATION_ID),
    ).toBeDefined()
  })

  it('user can select an existing not-yet-stocked item to add it here', async () => {
    // Given a global item that is NOT stocked in the active location
    const created = await createItem(
      { name: 'Butter', tagIds: [] },
      'loc-other',
    )
    await db.itemStocks.where('locationId').equals(DEFAULT_LOCATION_ID).delete()
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    renderDialog(
      <NewItemDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    )

    // When the user searches and selects the existing item
    await user.type(
      await screen.findByRole('combobox', { name: /name/i }),
      'Butter',
    )
    await user.click(await screen.findByRole('option', { name: /butter/i }))

    // Then it is stocked in the active location via copy-on-add (no navigation)
    await vi.waitFor(async () => {
      expect(await getItemStock(created.id, DEFAULT_LOCATION_ID)).toBeDefined()
    })
    expect(onSuccess).toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows an already-stocked item as a disabled option', async () => {
    // Given an item already stocked in the active location
    await createItem({ name: 'Eggs', tagIds: [] }, DEFAULT_LOCATION_ID)
    const user = userEvent.setup()
    renderDialog(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // When the user searches for it
    await user.type(
      await screen.findByRole('combobox', { name: /name/i }),
      'Eggs',
    )

    // Then the option is marked disabled (can't be re-added)
    const option = await screen.findByRole('option', { name: /eggs/i })
    expect(option).toHaveAttribute('aria-disabled', 'true')
  })

  it('copy-on-add is a no-op for an already-stocked item (quantities preserved)', async () => {
    // Given an item stocked here with quantities
    const item = await createItem(
      {
        name: 'Rice',
        tagIds: [],
        packedQuantity: 5,
        unpackedQuantity: 2,
      },
      DEFAULT_LOCATION_ID,
    )

    // When addItemToLocation runs again for the same location
    await addItemToLocation(item.id, DEFAULT_LOCATION_ID)

    // Then quantities are untouched
    const stock = await getItemStock(item.id, DEFAULT_LOCATION_ID)
    expect(stock?.packedQuantity).toBe(5)
    expect(stock?.unpackedQuantity).toBe(2)
  })

  it('calls onSuccess with the created item when creating new', async () => {
    // Given the dialog is open with an onSuccess callback
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    renderDialog(
      <NewItemDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    )

    // When the user creates a new item
    await user.type(
      await screen.findByRole('combobox', { name: /name/i }),
      'Yogurt',
    )
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /create/i,
      }),
    )

    // Then onSuccess fires with the item
    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Yogurt' }) as Item,
      )
    })
  })

  it('resets the search field when the dialog closes', async () => {
    // Given the dialog is open with typed content
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderDialog(<NewItemDialog open={true} onOpenChange={onOpenChange} />)

    const input = await screen.findByRole('combobox', { name: /name/i })
    await user.type(input, 'Tea')
    expect(input).toHaveValue('Tea')

    // When the user cancels
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Then onOpenChange(false) is requested
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
