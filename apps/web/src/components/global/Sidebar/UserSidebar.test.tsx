import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UserSidebar } from './UserSidebar'

describe('UserSidebar', () => {
  it('puts Back first, then the heading, then the cards, with focus on Back', () => {
    // Given local mode
    // When the user view renders
    render(<UserSidebar onBack={vi.fn()} />)

    // Then Back comes before the heading, and the heading before the cards
    const back = screen.getByRole('button', { name: 'Back' })
    const heading = screen.getByRole('heading', { name: 'Preferences' })
    const theme = screen.getByText('Theme')
    expect(
      back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      heading.compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    // And focus is on Back, because the 👤 button that opened the view is gone
    expect(back).toHaveFocus()
  })

  it('calls onBack when Back is pressed', async () => {
    // Given the user view
    const onBack = vi.fn()
    render(<UserSidebar onBack={onBack} />)

    // When the user presses Back
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    // Then the sidebar is told to go back
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
