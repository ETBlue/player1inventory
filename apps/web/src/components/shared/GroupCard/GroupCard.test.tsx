import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PACKAGE_UNIT } from '@/types'
import { GroupCard } from './GroupCard'

describe('GroupCard', () => {
  it('exposes the group name as an accessible button', () => {
    // Given a group card with a name
    render(<GroupCard name="Pasta" itemCount={9} onClick={() => {}} />)

    // Then the clickable element is reachable as a button named after the group
    const button = screen.getByRole('button', { name: /Pasta/ })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('tabIndex', '0')
  })

  it('keeps descendant text queryable despite aria-label', () => {
    // Given a group card with packed totals and a unit
    render(
      <GroupCard
        name="Pasta"
        itemCount={9}
        onClick={() => {}}
        totalPackedQuantity={5}
        totalTargetInPacks={9}
      />,
    )

    // Then descendant text inside the button is still found by getByText.
    // The unit trails the totals inside the SAME metadata span — group
    // totals are pack-counted, so it is the explicit DEFAULT_PACKAGE_UNIT.
    expect(screen.getByText('5 / 9 pack')).toBeInTheDocument()
  })

  it('user sees the pack unit trailing the totals in the same text node', () => {
    // Given a group card with packed totals
    render(
      <GroupCard
        name="Pasta"
        itemCount={9}
        onClick={() => {}}
        totalPackedQuantity={12}
        totalTargetInPacks={20}
      />,
    )

    // When the metadata line renders
    // Then the unit is part of that line's own text, not a separate badge
    // element — group totals are pack-counted, so it is DEFAULT_PACKAGE_UNIT
    expect(
      screen.getByText(`12 / 20 ${DEFAULT_PACKAGE_UNIT}`),
    ).toBeInTheDocument()
    expect(screen.queryByText('pack')).not.toBeInTheDocument()
  })

  it('user can activate the card by clicking it', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    // Given a group card
    render(<GroupCard name="Pasta" itemCount={9} onClick={handleClick} />)

    // When the user clicks the card
    await user.click(screen.getByRole('button', { name: /Pasta/ }))

    // Then onClick fires
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('user can activate the card with Enter and Space', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    // Given a focused group card
    render(<GroupCard name="Pasta" itemCount={9} onClick={handleClick} />)
    screen.getByRole('button', { name: /Pasta/ }).focus()

    // When the user presses Enter then Space
    await user.keyboard('{Enter}')
    await user.keyboard(' ')

    // Then onClick fires for each activation
    expect(handleClick).toHaveBeenCalledTimes(2)
  })
})
