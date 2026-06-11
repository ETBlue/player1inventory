import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './LocationList.stories'

const { DefaultOnly, MultipleLocations } = composeStories(stories)

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
