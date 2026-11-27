import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Item } from '@/types'
import { ConsumableFilterDropdown } from '.'

function item(id: string, consumable?: boolean): Item {
  return {
    id,
    name: id,
    tagIds: [],
    targetUnit: 'package',
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(consumable !== undefined ? { consumable } : {}),
  }
}

// Two consumable (one with no value) and one not.
const items = [item('tissue', true), item('old'), item('cups', false)]

describe('ConsumableFilterDropdown', () => {
  it('user can pick Not consumable', async () => {
    const onChange = vi.fn()
    render(
      <ConsumableFilterDropdown
        value="all"
        onChange={onChange}
        items={items}
      />,
    )
    const user = userEvent.setup()

    // When the user opens the menu
    await user.click(screen.getByRole('button', { name: 'Consumable' }))

    // Then three choices show, with counts, and All is checked
    const choices = screen.getAllByRole('menuitemradio')
    expect(choices.map((c) => c.textContent)).toEqual([
      'All(3)',
      'Consumable(2)',
      'Not consumable(1)',
    ])
    expect(screen.getByRole('menuitemradio', { name: /All/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    // When the user picks Not consumable
    await user.click(
      screen.getByRole('menuitemradio', { name: /Not consumable/ }),
    )

    // Then the filter changes
    expect(onChange).toHaveBeenCalledWith('notConsumable')
  })

  it('user sees the active choice on the button', () => {
    render(
      <ConsumableFilterDropdown value="notConsumable" onChange={vi.fn()} />,
    )
    expect(
      screen.getByRole('button', { name: 'Not consumable' }),
    ).toBeInTheDocument()
  })
})
