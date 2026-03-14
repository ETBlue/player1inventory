import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './dropdown-menu.stories'

const {
  Default,
  WithCheckboxItems,
  WithRadioItems,
  WithSubMenu,
  WithSeparatorsAndLabels,
} = composeStories(stories)

describe('DropdownMenu stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(
      screen.getByRole('button', { name: 'Open Menu' }),
    ).toBeInTheDocument()
  })

  it('WithCheckboxItems renders without error', () => {
    render(<WithCheckboxItems />)
    expect(
      screen.getByRole('button', { name: 'View Options' }),
    ).toBeInTheDocument()
  })

  it('WithRadioItems renders without error', () => {
    render(<WithRadioItems />)
    expect(
      screen.getByRole('button', { name: 'Panel Position' }),
    ).toBeInTheDocument()
  })

  it('WithSubMenu renders without error', () => {
    render(<WithSubMenu />)
    expect(
      screen.getAllByRole('button', { name: 'Open Menu' })[0],
    ).toBeInTheDocument()
  })

  it('WithSeparatorsAndLabels renders without error', () => {
    render(<WithSeparatorsAndLabels />)
    expect(
      screen.getByRole('button', { name: 'Open Menu' }),
    ).toBeInTheDocument()
  })
})
