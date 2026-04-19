import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './$shelfId.stories'

const { Unsorted, SelectionShelf, FilterShelf, EmptySelection } =
  composeStories(stories)

describe('ShelfDetail stories smoke tests', () => {
  it('Unsorted renders the shelf heading', async () => {
    render(<Unsorted />)
    expect(
      await screen.findByRole(
        'heading',
        { name: /unsorted/i },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
  })

  it('SelectionShelf renders the shelf heading', async () => {
    render(<SelectionShelf />)
    expect(
      await screen.findByRole('heading', { name: /dairy/i }, { timeout: 5000 }),
    ).toBeInTheDocument()
  })

  it('FilterShelf renders the shelf heading', async () => {
    render(<FilterShelf />)
    expect(
      await screen.findByRole(
        'heading',
        { name: /low stock/i },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
  })

  it('EmptySelection renders the shelf heading', async () => {
    render(<EmptySelection />)
    expect(
      await screen.findByRole(
        'heading',
        { name: /favorites/i },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
  })
})
