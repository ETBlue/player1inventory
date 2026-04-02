import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TagBadge.stories'

const { Default, DifferentColors, WithCountProp } = composeStories(stories)

describe('TagBadge stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText(/dairy/i)).toBeInTheDocument()
  })

  it('DifferentColors renders without error', () => {
    render(<DifferentColors />)
    expect(screen.getAllByText(/red/i).length).toBeGreaterThan(0)
  })

  it('WithCountProp renders the provided count instead of database value', () => {
    render(<WithCountProp />)
    // count prop = 42, so badge should display "(42)"
    expect(screen.getByText(/frozen.*42/i)).toBeInTheDocument()
  })
})
