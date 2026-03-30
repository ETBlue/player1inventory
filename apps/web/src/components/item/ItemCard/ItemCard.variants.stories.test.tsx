import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemCard.variants.stories'

const {
  TagsHidden,
  MultipleTags,
  VendorsAndRecipesCollapsed,
  VendorsAndRecipesExpanded,
  ActiveTagFilter,
  ActiveVendorFilter,
} = composeStories(stories)

describe('ItemCard variants stories smoke tests', () => {
  it('TagsHidden renders without error', async () => {
    render(<TagsHidden />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('MultipleTags renders without error', async () => {
    render(<MultipleTags />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('VendorsAndRecipesCollapsed renders without error', async () => {
    render(<VendorsAndRecipesCollapsed />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('VendorsAndRecipesExpanded renders without error', async () => {
    render(<VendorsAndRecipesExpanded />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('ActiveTagFilter renders without error', async () => {
    render(<ActiveTagFilter />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('ActiveVendorFilter renders without error', async () => {
    render(<ActiveVendorFilter />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })
})
