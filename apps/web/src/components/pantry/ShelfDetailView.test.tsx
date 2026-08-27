import { fireEvent, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { createItem, createShelf } from '@/db/operations'
import { ACTIVE_LOCATION_STORAGE_KEY } from '@/hooks/useActiveLocation'
import { renderWithRouter } from '@/test/utils'
import { DEFAULT_LOCATION_ID } from '@/types'
import { ShelfDetailView } from './ShelfDetailView'

// `useUpdateItem` is replaced by a spy so the assertion can read the exact
// `{ id, updates }` payload the view builds — what is under test is the view's
// forwarding of the dialog's `onSubmit` fields, not what Dexie does afterwards.
const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }))

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>()
  return {
    ...actual,
    useUpdateItem: () => ({ mutateAsync, mutate: vi.fn(), isPending: false }),
  }
})

// The stored values are deliberately different from the submitted ones, and all
// four submitted values differ from each other. A view that forwards the item's
// stored target/refill, drops a field, or swaps the two therefore cannot pass.
const STORED = {
  packedQuantity: 1,
  unpackedQuantity: 0,
  targetQuantity: 6,
  refillThreshold: 2,
}
const SUBMITTED = {
  packedQuantity: 3,
  unpackedQuantity: 1,
  targetQuantity: 7,
  refillThreshold: 4,
}

const stockMilk = () =>
  createItem(
    {
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      packageUnit: 'bottle',
      consumeAmount: 1,
      ...STORED,
    },
    DEFAULT_LOCATION_ID,
  )

// Opens the quick-update dialog on Milk, moves all four fields off their stored
// values via the steppers, then presses Update.
async function quickUpdateMilk(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: 'Update quantity of Milk' }),
  )
  const dialog = await screen.findByRole('dialog')
  const press = async (label: string, times: number) => {
    for (let i = 0; i < times; i++) {
      await user.click(within(dialog).getByRole('button', { name: label }))
    }
  }
  await press('Increase packed', 2) // 1 -> 3
  await press('Increase unpacked', 1) // 0 -> 1
  await press('Increase target quantity', 1) // 6 -> 7
  await press('Increase refill threshold', 2) // 2 -> 4
  await user.click(within(dialog).getByRole('button', { name: 'Update' }))
}

describe('ShelfDetailView quick update', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.shelves.clear()
    await db.recipes.clear()
    await db.vendors.clear()
    await db.locations.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    localStorage.clear()
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
    mutateAsync.mockReset()
    mutateAsync.mockResolvedValue(undefined)
  })

  it('user can edit target and refill from a shelf page and have all four stock fields saved', async () => {
    // Given a selection shelf holding an item with target 6 / refill 2
    const milk = await stockMilk()
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'selection',
      order: 0,
      itemIds: [milk.id],
    })
    const user = userEvent.setup()
    await renderWithRouter(<ShelfDetailView shelfId={shelf.id} />)

    // When the user raises every field in the quick-update dialog and submits
    await quickUpdateMilk(user)

    // Then all four fields reach the update mutation with the edited values
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync).toHaveBeenCalledWith({
      id: milk.id,
      updates: SUBMITTED,
    })
  })

  it('user can edit the due date from a shelf page when the item is in date mode', async () => {
    // Given a selection shelf holding an item in date mode with a stored due date
    const milk = await createItem(
      {
        name: 'Milk',
        tagIds: [],
        targetUnit: 'package',
        packageUnit: 'bottle',
        consumeAmount: 1,
        expirationMode: 'date',
        dueDate: new Date('2026-09-01'),
        ...STORED,
      },
      DEFAULT_LOCATION_ID,
    )
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'selection',
      order: 0,
      itemIds: [milk.id],
    })
    const user = userEvent.setup()
    await renderWithRouter(<ShelfDetailView shelfId={shelf.id} />)

    // When the user opens the dialog, edits the due date, and presses Update
    await user.click(
      await screen.findByRole('button', { name: 'Update quantity of Milk' }),
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/expires on/i), {
      target: { value: '2026-10-15' },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Update' }))

    // Then the mutation receives the edited due date alongside the untouched
    // stored quantities — proving the view forwards `dueDate` through rather
    // than dropping it on the way to `updateItem.mutateAsync`.
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync).toHaveBeenCalledWith({
      id: milk.id,
      updates: { ...STORED, dueDate: new Date('2026-10-15') },
    })
  })
})
