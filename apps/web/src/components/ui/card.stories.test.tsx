import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './card.stories'

const { Default, Simple, HeaderOnly, WithDescenders, Variants } =
  composeStories(stories)

describe('Card stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Card Title')).toBeInTheDocument()
  })

  it('Simple renders without error', () => {
    render(<Simple />)
    expect(
      screen.getByText('Simple card with just content.'),
    ).toBeInTheDocument()
  })

  it('HeaderOnly renders without error', () => {
    render(<HeaderOnly />)
    expect(screen.getByText('Header Only')).toBeInTheDocument()
  })

  it('WithDescenders renders without error', () => {
    render(<WithDescenders />)
    expect(screen.getByText('Yogurt (plain) — g p q y j')).toBeInTheDocument()
  })

  it('Variants renders without error', () => {
    render(<Variants />)
    expect(screen.getByText('Default Card')).toBeInTheDocument()
  })
})
