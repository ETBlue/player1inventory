import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as stories from './LocationList.stories'

const { DefaultOnly, MixedCaseNames, MultipleLocations } =
  composeStories(stories)

describe('LocationList stories smoke tests', () => {
  it('DefaultOnly renders the default location without a delete control', () => {
    render(<DefaultOnly />)
    // Default location name is visible
    expect(screen.getByText('My Home')).toBeInTheDocument()
    // No delete button is rendered for the default location
    expect(
      screen.queryByRole('button', { name: /delete my home/i }),
    ).not.toBeInTheDocument()
  })

  it('MultipleLocations renders all locations and delete controls for non-default ones', () => {
    render(<MultipleLocations />)
    expect(screen.getByText('My Home')).toBeInTheDocument()
    expect(screen.getByText('Office')).toBeInTheDocument()
    expect(screen.getByText('Beach House')).toBeInTheDocument()
    // Non-default locations expose a delete control
    expect(
      screen.getByRole('button', { name: /delete office/i }),
    ).toBeInTheDocument()
  })
})

describe('LocationList name casing', () => {
  it('user sees location names rendered exactly as stored', () => {
    // Given locations stored with deliberate mixed casing
    render(<MixedCaseNames />)

    // Then each name keeps its stored casing and carries no capitalize class
    for (const name of ['my Garage', 'iHerb pantry']) {
      const label = screen.getByText(name)
      expect(label).toBeInTheDocument()
      expect(label.className).not.toMatch(/capitalize/)
    }
  })

  it('user sees the dragged location name as stored in the drag overlay', async () => {
    // Given a mixed-case location list
    const user = userEvent.setup()
    render(<MixedCaseNames />)

    // When the user picks up "my Garage" with the keyboard
    const handle = screen.getByRole('button', {
      name: 'Drag to reorder my Garage',
    })
    handle.focus()
    await user.keyboard(' ')

    // Then the drag overlay shows the name as stored, with no capitalize class
    const overlayLabel = screen.getAllByText('my Garage').at(-1)
    expect(overlayLabel).toBeDefined()
    expect(screen.getAllByText('my Garage')).toHaveLength(2)
    expect(overlayLabel?.className).not.toMatch(/capitalize/)
  })
})
