import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './EmptyState.stories'

const { Default, WithCustomClassName } = composeStories(stories)

describe('EmptyState stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('No items found')).toBeInTheDocument()
  })

  it('WithCustomClassName renders without error', () => {
    render(<WithCustomClassName />)
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
  })
})
