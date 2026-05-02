import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './PantryControlBar.stories'

const { AllCollapsed, AllExpanded, Mixed } = composeStories(stories)

describe('PantryControlBar stories smoke tests', () => {
  it('AllCollapsed: Expand All button is enabled', () => {
    render(<AllCollapsed />)
    expect(
      screen.getByRole('button', { name: /expand all/i }),
    ).not.toBeDisabled()
  })

  it('AllCollapsed: Collapse All button is disabled', () => {
    render(<AllCollapsed />)
    expect(screen.getByRole('button', { name: /collapse all/i })).toBeDisabled()
  })

  it('AllExpanded: Collapse All button is enabled', () => {
    render(<AllExpanded />)
    expect(
      screen.getByRole('button', { name: /collapse all/i }),
    ).not.toBeDisabled()
  })

  it('AllExpanded: Expand All button is disabled', () => {
    render(<AllExpanded />)
    expect(screen.getByRole('button', { name: /expand all/i })).toBeDisabled()
  })

  it('Mixed: both buttons are enabled', () => {
    render(<Mixed />)
    expect(
      screen.getByRole('button', { name: /expand all/i }),
    ).not.toBeDisabled()
    expect(
      screen.getByRole('button', { name: /collapse all/i }),
    ).not.toBeDisabled()
  })
})
