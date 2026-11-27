import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PantryItem } from '@/types'
import { CartAmountDialog } from '.'

// Milk: 1 bottle in stock, target 4 bottles
const milk: PantryItem = {
  id: 'milk',
  name: 'Milk',
  packageUnit: 'bottle',
  targetUnit: 'package',
  targetQuantity: 4,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 0,
  consumeAmount: 1,
  tagIds: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

function setup(props: Partial<Parameters<typeof CartAmountDialog>[0]> = {}) {
  const onSubmit = vi.fn(async (_amount: number) => {})
  const onClose = vi.fn()
  render(
    <CartAmountDialog
      item={milk}
      mode="edit"
      initialAmount={2}
      onSubmit={onSubmit}
      onClose={onClose}
      {...props}
    />,
  )
  const field = screen.getByRole('spinbutton', { name: 'Buy (bottle)' })
  const save = screen.getByRole('button', { name: 'Save' })
  return { onSubmit, onClose, field, save, user: userEvent.setup() }
}

const ZERO_NOTE = /Amount 0 keeps the item in the cart/

describe('CartAmountDialog', () => {
  it('user sees "Item in cart" as the title when the item is in the cart', () => {
    setup({ mode: 'edit' })
    expect(
      screen.getByRole('heading', { name: 'Item in cart' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Milk' })).toBeNull()
  })

  it('user sees "Add to cart" as the title when the item is not in the cart yet', () => {
    setup({ mode: 'add', initialAmount: 3 })
    expect(
      screen.getByRole('heading', { name: 'Add to cart' }),
    ).toBeInTheDocument()
  })

  it('user sees the item name and its quantity in the body, like on the card', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    // The same text the item card shows: "1 / 4 bottle"
    const name = within(dialog).getByText('Milk')
    const quantity = within(dialog).getByText('1 / 4 bottle')
    // Not in the header: the header holds the title and the close button
    const header = screen.getByRole('heading', {
      name: 'Item in cart',
    }).parentElement
    expect(header).not.toContainElement(name)
    expect(header).not.toContainElement(quantity)
    // The name keeps `capitalize` (Name Display Convention)
    expect(name).toHaveClass('capitalize')
    // The row comes before the amount field
    const field = screen.getByRole('spinbutton', { name: /^Buy/ })
    expect(
      quantity.compareDocumentPosition(field) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('user hears the item name and quantity as the dialog description', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    // The title is generic, so the description must say which item
    expect(dialog).toHaveAccessibleDescription(/^Milk 1 \/ 4 bottle/)
  })

  it('user sees the percentage bar for a consumable item', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    // ItemProgressBar draws one segment per package (target 4)
    expect(dialog.querySelectorAll('[data-segment]').length).toBeGreaterThan(0)
    expect(within(dialog).queryAllByTestId('count-square')).toHaveLength(0)
  })

  it('user sees one square per piece for a non-consumable item', () => {
    setup({ item: { ...milk, name: 'Cups', consumable: false } })
    const dialog = screen.getByRole('dialog')
    // ItemCountBar: 4 squares, 1 filled
    const squares = within(dialog).getAllByTestId('count-square')
    expect(squares).toHaveLength(4)
    expect(
      squares.filter((s) => s.getAttribute('data-filled') === 'true'),
    ).toHaveLength(1)
    expect(dialog.querySelectorAll('[data-segment]')).toHaveLength(0)
  })

  it('user sees "Buy", then the amount field, then the package unit', () => {
    const { field } = setup()
    const buy = screen.getByText('Buy')
    const unit = screen.getByText('bottle', { selector: 'span' })
    expect(
      buy.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      field.compareDocumentPosition(unit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // All three in one row
    expect(buy.parentElement).toContainElement(field)
    expect(buy.parentElement).toContainElement(unit)
  })

  it('the amount field is narrow, just wide enough for 4 digits', () => {
    const { field } = setup()
    expect(field).toHaveClass('w-20')
    expect(field).not.toHaveClass('w-full')
  })

  it('user can step and type the amount, and Save sends it ONCE', async () => {
    const { user, field, save, onSubmit } = setup()

    // When the user steps up 3 times, down once, then types 10
    const increase = screen.getByRole('button', { name: 'Increase amount' })
    await user.click(increase)
    await user.click(increase)
    await user.click(increase)
    await user.click(screen.getByRole('button', { name: 'Decrease amount' }))
    expect(field).toHaveValue(4)
    expect(onSubmit).not.toHaveBeenCalled()
    await user.clear(field)
    await user.type(field, '10')

    // And presses Save
    await user.click(save)

    // Then ONE submit with 10
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith(10)
  })

  it('user can save with Enter in the field', async () => {
    const { user, field, onSubmit } = setup()
    await user.clear(field)
    await user.type(field, '7{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith(7)
  })

  it('user sees the buy-next-time note only when the amount is 0', async () => {
    const { user, field } = setup()

    // At 2, no note
    expect(screen.queryByText(ZERO_NOTE)).toBeNull()

    // At 1, still no note
    await user.click(screen.getByRole('button', { name: 'Decrease amount' }))
    expect(field).toHaveValue(1)
    expect(screen.queryByText(ZERO_NOTE)).toBeNull()

    // At 0, the note, and the field points at it
    await user.click(screen.getByRole('button', { name: 'Decrease amount' }))
    expect(field).toHaveValue(0)
    const note = screen.getByText(ZERO_NOTE)
    expect(field).toHaveAccessibleDescription(note.textContent)

    // Back at 1, gone again
    await user.click(screen.getByRole('button', { name: 'Increase amount' }))
    expect(screen.queryByText(ZERO_NOTE)).toBeNull()
  })

  it('user can save 0', async () => {
    const { user, field, save, onSubmit } = setup()
    await user.clear(field)
    await user.type(field, '0')
    expect(save).toBeEnabled()
    await user.click(save)
    expect(onSubmit).toHaveBeenCalledWith(0)
  })

  describe('Save is off', () => {
    it('when editing and the amount did not change', async () => {
      const { user, save } = setup({ mode: 'edit', initialAmount: 2 })
      expect(save).toBeDisabled()
      await user.click(screen.getByRole('button', { name: 'Increase amount' }))
      expect(save).toBeEnabled()
      await user.click(screen.getByRole('button', { name: 'Decrease amount' }))
      expect(save).toBeDisabled()
    })

    it('not when adding, even at the suggested amount', () => {
      const { save } = setup({ mode: 'add', initialAmount: 3 })
      expect(save).toBeEnabled()
    })

    it('when the field is empty', async () => {
      const { user, field, save } = setup({ mode: 'add', initialAmount: 3 })
      await user.clear(field)
      expect(save).toBeDisabled()
    })

    it('when the field is not a whole number', async () => {
      const { user, field, save, onSubmit } = setup({
        mode: 'add',
        initialAmount: 3,
      })
      await user.clear(field)
      await user.type(field, '1.5')
      expect(save).toBeDisabled()
      await user.type(field, '{Enter}')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('when the field is negative', async () => {
      const { user, field, save } = setup({ mode: 'add', initialAmount: 3 })
      await user.clear(field)
      await user.type(field, '-2')
      expect(save).toBeDisabled()
    })

    it('while a save runs, with a spinner, and Cancel off too', async () => {
      let release: () => void = () => {}
      const { user, save } = setup({
        mode: 'add',
        initialAmount: 3,
        onSubmit: () =>
          new Promise<void>((resolve) => {
            release = resolve
          }),
      })
      await user.click(save)
      expect(save).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
      release()
      await waitFor(() => expect(save).toBeEnabled())
    })
  })

  it('user sees a failed save in the dialog, with the number kept', async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error('offline')
    })
    const { user, field, save, onClose } = setup({ onSubmit })
    await user.clear(field)
    await user.type(field, '9')
    await user.click(save)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the change. Please try again.',
    )
    expect(field).toHaveValue(9)
    expect(onClose).not.toHaveBeenCalled()
    expect(save).toBeEnabled()
  })

  it('user can cancel, and nothing is submitted', async () => {
    const { user, onSubmit, onClose } = setup({ mode: 'add', initialAmount: 3 })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('user can close with Escape, and nothing is submitted', async () => {
    const { user, onSubmit, onClose } = setup({ mode: 'add', initialAmount: 3 })
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('puts the focus in the amount field', () => {
    const { field } = setup()
    expect(field).toHaveFocus()
  })
})
