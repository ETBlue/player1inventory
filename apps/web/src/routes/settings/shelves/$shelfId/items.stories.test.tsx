import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './items.stories'

const { FilterShelf, EmptySelectionShelf, SelectionShelfWithItems } =
  composeStories(stories)

describe('ShelfItemsTab stories smoke tests', () => {
  it('FilterShelf renders not applicable message', async () => {
    render(<FilterShelf />)
    expect(
      await screen.findByText(/filter shelves include items automatically/i),
    ).toBeInTheDocument()
  })

  it('EmptySelectionShelf renders the empty state', async () => {
    render(<EmptySelectionShelf />)
    expect(await screen.findByText(/no items yet/i)).toBeInTheDocument()
  })

  it('SelectionShelfWithItems renders assigned item names', async () => {
    render(<SelectionShelfWithItems />)
    expect(await screen.findByText(/milk/i)).toBeInTheDocument()
  })
})
