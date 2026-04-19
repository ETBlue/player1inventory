import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ViewToggle.stories'

const { ListActive, ShelfActive } = composeStories(stories)

describe('ViewToggle stories smoke tests', () => {
  it('ListActive renders with list view button pressed', () => {
    render(<ListActive />)
    expect(
      screen.getByRole('button', { name: 'List view' }),
    ).toBeInTheDocument()
  })

  it('ShelfActive renders with shelf view button pressed', () => {
    render(<ShelfActive />)
    expect(
      screen.getByRole('button', { name: 'Shelf view' }),
    ).toBeInTheDocument()
  })
})
