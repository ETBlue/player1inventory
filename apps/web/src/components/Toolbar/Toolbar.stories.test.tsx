import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './Toolbar.stories'

const { Default, WithJustifyBetween } = composeStories(stories)

describe('Toolbar stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Add item')).toBeInTheDocument()
  })

  it('WithJustifyBetween renders without error', () => {
    render(<WithJustifyBetween />)
    expect(screen.getByText('Page Title')).toBeInTheDocument()
  })
})
