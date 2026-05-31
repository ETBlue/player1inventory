import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './QuickUpdateDialog.stories'

const { Default, DualUnit } = composeStories(stories)

describe('QuickUpdateDialog stories smoke tests', () => {
  it('renders without crashing', () => {
    render(<Default />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows Update heading in the dialog title', () => {
    render(<Default />)
    expect(screen.getByRole('heading', { name: /Update/i })).toBeInTheDocument()
  })

  it('icon-only buttons have accessible names', () => {
    render(<Default />)
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Fill to Full' }),
    ).toBeInTheDocument()
  })

  it('number inputs have accessible names', () => {
    render(<Default />)
    // Default story uses mockItem (packageUnit: 'gallon') — labels come from item units
    expect(
      screen.getByRole('spinbutton', { name: 'gallon' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: 'Unpacked' }),
    ).toBeInTheDocument()
  })

  it('dual-unit item shows Pack and Unpack buttons', () => {
    render(<DualUnit />)
    expect(screen.getByRole('button', { name: 'Unpack' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pack' })).toBeInTheDocument()
  })
})
