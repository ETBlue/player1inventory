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

  it('number inputs have accessible names matching item info tab format', () => {
    render(<Default />)
    // mockItem: packageUnit='gallon', targetUnit='package'
    // packed label: "Packed (gallon)", unpacked label: "Unpacked (gallon)"
    expect(
      screen.getByRole('spinbutton', { name: 'Packed (gallon)' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: 'Unpacked (gallon)' }),
    ).toBeInTheDocument()
  })

  it('dual-unit item shows Pack and Unpack buttons', () => {
    render(<DualUnit />)
    expect(screen.getByRole('button', { name: 'Unpack' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pack' })).toBeInTheDocument()
  })
})
