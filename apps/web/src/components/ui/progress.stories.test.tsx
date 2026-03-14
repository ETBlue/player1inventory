import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './progress.stories'

const { Default, WithCustomColor, Sizes } = composeStories(stories)

describe('Progress stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('0% Complete')).toBeInTheDocument()
  })

  it('WithCustomColor renders without error', () => {
    render(<WithCustomColor />)
    expect(screen.getByText('Primary (default)')).toBeInTheDocument()
  })

  it('Sizes renders without error', () => {
    render(<Sizes />)
    expect(screen.getByText('Small (h-2)')).toBeInTheDocument()
  })
})
