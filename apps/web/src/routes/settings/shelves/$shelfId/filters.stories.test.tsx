import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './filters.stories'

const { EmptyFilters, WithTagsAndVendors, SelectionShelf } =
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
})
