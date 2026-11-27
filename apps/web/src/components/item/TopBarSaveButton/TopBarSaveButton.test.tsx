import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TopBarSaveButton } from '.'

describe('TopBarSaveButton', () => {
  it('renders nothing when there is no slot', () => {
    render(
      <TopBarSaveButton
        saveSlot={null}
        onClick={() => {}}
        disabled={false}
        isLoading={false}
      />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders Save inside the slot, as a plain button that calls onClick', async () => {
    const user = userEvent.setup()
    const slot = document.createElement('div')
    document.body.appendChild(slot)
    const onClick = vi.fn()
    render(
      <TopBarSaveButton
        saveSlot={slot}
        onClick={onClick}
        disabled={false}
        isLoading={false}
      />,
    )
    const button = screen.getByRole('button', { name: 'Save' })
    expect(slot).toContainElement(button)
    expect(button).toHaveAttribute('type', 'button')
    expect(button).not.toHaveAttribute('form')
    expect(button).toHaveClass('shrink-0')
    await user.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
    slot.remove()
  })

  it('is off while disabled or saving', () => {
    const slot = document.createElement('div')
    document.body.appendChild(slot)
    const { rerender } = render(
      <TopBarSaveButton
        saveSlot={slot}
        onClick={() => {}}
        disabled
        isLoading={false}
      />,
    )
    expect(screen.getByRole('button')).toBeDisabled()
    rerender(
      <TopBarSaveButton
        saveSlot={slot}
        onClick={() => {}}
        disabled={false}
        isLoading
      />,
    )
    expect(screen.getByRole('button')).toBeDisabled()
    slot.remove()
  })
})
