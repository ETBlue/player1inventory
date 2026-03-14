import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './button.stories'

const { Default, Variants, Sizes, Disabled } = composeStories(stories)

describe('Button stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByRole('button', { name: 'Button' })).toBeInTheDocument()
  })

  it('Variants renders without error', () => {
    render(<Variants />)
    expect(screen.getByText('Semantic Variants')).toBeInTheDocument()
  })

  it('Sizes renders without error', () => {
    render(<Sizes />)
    expect(screen.getByRole('button', { name: 'XSmall' })).toBeInTheDocument()
  })

  it('Disabled renders without error', () => {
    render(<Disabled />)
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeInTheDocument()
  })
})
