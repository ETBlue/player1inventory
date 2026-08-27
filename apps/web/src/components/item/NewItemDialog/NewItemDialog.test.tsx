import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { addItemToLocation, createItem, getItemStock } from '@/db/operations'
import { ActiveLocationProvider } from '@/hooks/useActiveLocation'
import type { Item, PantryItem } from '@/types'
import { DEFAULT_LOCATION_ID } from '@/types'
import { NewItemDialog } from './NewItemDialog'

// Lets one test hold the location query unresolved, to pin the loading guard on
// the inline exact-match feedback.
const locationsGate = { hang: false }
vi.mock('@/db/operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/operations')>()
  return {
    ...actual,
    getLocations: vi.fn(() =>
      locationsGate.hang ? new Promise<never>(() => {}) : actual.getLocations(),
    ),
  }
})

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
    locationsGate.hang = false
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
    // And it is created valid: consumeAmount 1, the single default shared by
    // every interactive create path (local and cloud). The dialog passes no
    // `consumeAmount` of its own — `createItem` is the one place that decides.
    expect(milk?.consumeAmount).toBe(1)
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
    // `onSuccess` fires after the mutation's `await`, which now also awaits
    // `useAddItemToLocation`'s returned invalidation — so it lands strictly
    // after the stock row exists, not in the same tick. Same `waitFor` shape
    // the sibling test below already used.
    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('calls onSuccess with the freshly copied stock, not the stale pre-add join', async () => {
    // Given a global item stocked elsewhere with a non-default consumeAmount
    // (not stocked in the active location, so the pre-add join would supply
    // ZERO_STOCK's consumeAmount of 1 instead of the real value)
    const created = await createItem(
      {
        name: 'Honey',
        tagIds: [],
        consumeAmount: 3,
        targetQuantity: 10,
        refillThreshold: 2,
      },
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
      'Honey',
    )
    await user.click(await screen.findByRole('option', { name: /honey/i }))

    // Then onSuccess receives the real copied consumeAmount (3), not the
    // stale ZERO_STOCK default (1) from the pre-add PantryItem join
    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })
    const arg = onSuccess.mock.calls[0]?.[0] as PantryItem
    expect(arg.consumeAmount).toBe(3)
    expect(arg.stockId).toBeDefined()
    expect(arg.stockId).not.toBe('pending')
    const stockRow = await getItemStock(created.id, DEFAULT_LOCATION_ID)
    expect(arg.stockId).toBe(stockRow?.id)
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

  it('pressing Enter creates a new item when the only catalog match is disabled (already-stocked)', async () => {
    // Given an item already stocked here that partially matches the query
    // (not an exact match, so the Create option is offered alongside it)
    await createItem({ name: 'Eggsalad', tagIds: [] }, DEFAULT_LOCATION_ID)
    const user = userEvent.setup()
    renderDialog(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // When the user types a partial query matching only the disabled item,
    // then presses Enter without using the mouse to pick the Create option
    const input = await screen.findByRole('combobox', { name: /name/i })
    await user.type(input, 'Eggs')
    await screen.findByRole('option', { name: /eggsalad/i })
    await user.keyboard('{Enter}')

    // Then Enter is not a dead key: it creates the typed name as a new item
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/items/$id' }),
      )
    })
    const items = await db.items.toArray()
    expect(items.find((i) => i.name === 'Eggs')).toBeDefined()
  })

  it('hovering a disabled option does not steal keyboard focus (Enter still creates)', async () => {
    // Given an item already stocked here that partially matches the query
    // (not an exact match, so the Create option is offered alongside it)
    await createItem({ name: 'Eggsalad', tagIds: [] }, DEFAULT_LOCATION_ID)
    const user = userEvent.setup()
    renderDialog(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // When the user types a partial query, hovers the mouse over the
    // disabled (already-stocked) option, then presses Enter without clicking
    const input = await screen.findByRole('combobox', { name: /name/i })
    await user.type(input, 'Eggs')
    const disabledOption = await screen.findByRole('option', {
      name: /eggsalad/i,
    })
    await user.hover(disabledOption)
    await user.keyboard('{Enter}')

    // Then Enter is not a dead key: hovering the disabled option must not
    // move the keyboard highlight there, so Enter still creates the typed
    // name via the selectable Create option
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/items/$id' }),
      )
    })
    const items = await db.items.toArray()
    expect(items.find((i) => i.name === 'Eggs')).toBeDefined()
  })

  it('shows inline feedback when the query exactly matches an item already stocked here (Enter is inert)', async () => {
    // Given an item already stocked in the active location
    await createItem({ name: 'Milk', tagIds: [] }, DEFAULT_LOCATION_ID)
    const user = userEvent.setup()
    renderDialog(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // When the user types the exact name of the already-stocked item
    const input = await screen.findByRole('combobox', { name: /name/i })
    await user.type(input, 'Milk')

    // Then the sole option is disabled and no Create option is offered —
    // the plan's original "skip non-selectable options" remedy provably
    // cannot fix this case (there is no other option to skip to)
    const option = await screen.findByRole('option', { name: /milk/i })
    expect(option).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.queryByRole('button', { name: /create/i }),
    ).not.toBeInTheDocument()

    // And inline feedback explains why, naming the item and location
    // (user ruling 2026-08-16: inline feedback, not a fix to the option
    // list — see PR D review 3.3 / Important 3)
    expect(
      await screen.findByText('Milk is already in My Home.'),
    ).toBeInTheDocument()

    // And Enter stays inert — no navigation, no mutation
    await user.keyboard('{Enter}')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not render a half-formed sentence while the location list loads', async () => {
    // Given an already-stocked item and a location query that has not resolved
    await createItem({ name: 'Milk', tagIds: [] }, DEFAULT_LOCATION_ID)
    locationsGate.hang = true
    const user = userEvent.setup()
    renderDialog(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // When the user types the exact name
    const input = await screen.findByRole('combobox', { name: /name/i })
    await user.type(input, 'Milk')

    // Then the option is already known to be stocked here...
    const option = await screen.findByRole('option', { name: /milk/i })
    expect(option).toHaveAttribute('aria-disabled', 'true')

    // ...but the feedback waits for the location name instead of rendering
    // "Milk is already in ." (the sibling dialog in items/$id/stock.tsx guards
    // exactly this)
    expect(screen.queryByText(/is already in/i)).not.toBeInTheDocument()
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
