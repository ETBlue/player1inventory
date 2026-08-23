import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { PantryItem } from '@/types'
import { QuickUpdateDialog } from '.'

// Fixtures: a package-unit item whose only varying field is consumeAmount.
// `consumeAmount: 0` is a real stored value, not a hypothetical — items can
// carry it, and it is exactly the value that used to kill this dialog's
// steppers.
const makeItem = (overrides: Partial<PantryItem> = {}): PantryItem => ({
  id: 'item-1',
  name: 'Yogurt (plain)',
  packageUnit: 'gallon',
  targetUnit: 'package',
  tagIds: [],
  targetQuantity: 4,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 1,
  consumeAmount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const renderDialog = (item: PantryItem) =>
  render(
    <QuickUpdateDialog
      item={item}
      isOpen={true}
      onClose={() => {}}
      onSubmit={async () => {}}
    />,
  )

const unpackedInput = () =>
  screen.getByRole('spinbutton', { name: 'Unpacked (gallon)' })

describe('QuickUpdateDialog — stepper fallback for consumeAmount 0', () => {
  it('user can increase the unpacked quantity on an item with consumeAmount 0', async () => {
    // Given an item stored with consumeAmount 0 and 1 unpacked
    const user = userEvent.setup()
    renderDialog(makeItem())

    // When the user clicks +
    await user.click(screen.getByRole('button', { name: 'Increase unpacked' }))

    // Then the quantity rises by the fallback step of 1
    expect(unpackedInput()).toHaveValue(2)
  })

  it('user can decrease the unpacked quantity on an item with consumeAmount 0', async () => {
    // Given an item stored with consumeAmount 0 and 1 unpacked
    const user = userEvent.setup()
    renderDialog(makeItem({ unpackedQuantity: 1 }))

    // When the user clicks −
    await user.click(screen.getByRole('button', { name: 'Decrease unpacked' }))

    // Then the quantity falls by the fallback step of 1, and stops at 0
    expect(unpackedInput()).toHaveValue(0)
    expect(
      screen.getByRole('button', { name: 'Decrease unpacked' }),
    ).toBeDisabled()
  })

  it('user sees a valid step on the unpacked input of an item with consumeAmount 0', () => {
    // Given an item stored with consumeAmount 0
    renderDialog(makeItem())

    // When the dialog renders
    // Then the number input carries a usable step, never the invalid step="0"
    expect(unpackedInput()).toHaveAttribute('step', '1')
    expect(unpackedInput()).not.toHaveAttribute('step', '0')
  })

  it('user still steps by the configured amount when consumeAmount is set', async () => {
    // Given an item with a configured consumeAmount of 2 — the control that
    // proves the fallback did not flatten every item to a step of 1
    const user = userEvent.setup()
    renderDialog(makeItem({ consumeAmount: 2, unpackedQuantity: 4 }))
    expect(unpackedInput()).toHaveAttribute('step', '2')

    // When the user clicks + and then −
    await user.click(screen.getByRole('button', { name: 'Increase unpacked' }))

    // Then each click moves the quantity by 2
    expect(unpackedInput()).toHaveValue(6)
    await user.click(screen.getByRole('button', { name: 'Decrease unpacked' }))
    expect(unpackedInput()).toHaveValue(4)
  })
})
