import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as stories from './accordion.stories'

const { Closed, OneOpen, Multiple } = composeStories(stories)

describe('Accordion stories smoke tests', () => {
  it('Closed renders both triggers collapsed', () => {
    render(<Closed />)
    expect(screen.getByRole('button', { name: 'My data' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByText('Theme, language, data mode')).toBeNull()
  })

  it('OneOpen shows only the open section', () => {
    render(<OneOpen />)
    expect(
      screen.getByText('Locations, shelves, vendors, recipes, tags'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Theme, language, data mode')).toBeNull()
  })

  it('Multiple shows both sections', () => {
    render(<Multiple />)
    expect(
      screen.getByText('Locations, shelves, vendors, recipes, tags'),
    ).toBeInTheDocument()
    expect(screen.getByText('Theme, language, data mode')).toBeInTheDocument()
  })

  it('user can open a section by pressing its trigger', async () => {
    // Given a closed accordion
    const user = userEvent.setup()
    render(<Closed />)

    // When the user presses a trigger
    await user.click(screen.getByRole('button', { name: 'Account' }))

    // Then that section opens
    expect(screen.getByRole('button', { name: 'Account' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByText('Theme, language, data mode')).toBeInTheDocument()
  })
})
