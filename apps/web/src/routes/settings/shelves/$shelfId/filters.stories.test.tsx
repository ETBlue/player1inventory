import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './filters.stories'

const { EmptyFilters, WithTagsAndVendors, SelectionShelf, WithItemCounts } =
  composeStories(stories)

describe('ShelfFiltersTab stories smoke tests', () => {
  it('EmptyFilters renders the no tags empty state', async () => {
    render(<EmptyFilters />)
    expect(await screen.findByText(/no tags/i)).toBeInTheDocument()
  })

  it('WithTagsAndVendors renders tag type heading', async () => {
    render(<WithTagsAndVendors />)
    expect(await screen.findByText(/category/i)).toBeInTheDocument()
  })

  it('SelectionShelf renders not applicable empty state', async () => {
    render(<SelectionShelf />)
    expect(await screen.findByText(/not applicable/i)).toBeInTheDocument()
  })

  it('WithItemCounts renders global counts on the badges', async () => {
    render(<WithItemCounts />)
    // Parent tag count comes from its descendants, not direct assignments
    expect(
      await screen.findByRole('button', { name: /food \(2\)/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /costco \(2\)/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /pancakes \(2\)/i }),
    ).toBeInTheDocument()
  })
})
