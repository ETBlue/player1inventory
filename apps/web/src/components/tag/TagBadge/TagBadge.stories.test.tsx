import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TagBadge.stories'

const { Default, DifferentColors } = composeStories(stories)

describe('TagBadge stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText(/dairy/i)).toBeInTheDocument()
  })

  it('DifferentColors renders without error', () => {
    render(<DifferentColors />)
    expect(screen.getAllByText(/red/i).length).toBeGreaterThan(0)
  })
})
