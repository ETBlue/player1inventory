import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './PantryShelfCard.stories'

const {
  Collapsed,
  CollapsedWithLowStock,
  CollapsedWithOutOfStock,
  Expanded,
  SystemShelf,
} = composeStories(stories)

describe('PantryShelfCard stories smoke tests', () => {
  it('Collapsed renders shelf name', async () => {
    render(<Collapsed />)
    await waitFor(() => expect(screen.getByText('dairy')).toBeInTheDocument())
  })

  it('CollapsedWithLowStock renders low stock badge', async () => {
    render(<CollapsedWithLowStock />)
    await waitFor(() =>
      expect(screen.getByText(/low stock/i)).toBeInTheDocument(),
    )
  })

  it('CollapsedWithOutOfStock renders out of stock badge', async () => {
    render(<CollapsedWithOutOfStock />)
    await waitFor(() =>
      expect(screen.getByText(/out of stock/i)).toBeInTheDocument(),
    )
  })

  it('Expanded renders an item name', async () => {
    render(<Expanded />)
    await waitFor(() => expect(screen.getByText('yogurt')).toBeInTheDocument())
  })

  it('SystemShelf does not render settings link', async () => {
    render(<SystemShelf />)
    await waitFor(() =>
      expect(screen.getByText('unsorted')).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('link', { name: /shelf settings/i }),
    ).not.toBeInTheDocument()
  })
})
