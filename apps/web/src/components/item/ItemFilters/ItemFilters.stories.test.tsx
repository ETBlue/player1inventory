import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemFilters.stories'

const {
  Default,
  EmptyItems,
  Disabled,
  WithVendors,
  WithRecipes,
  WithVendorsAndRecipes,
  HideVendorFilter,
  HideRecipeFilter,
} = composeStories(stories)

describe('ItemFilters stories smoke tests', () => {
  it('Default renders without error', async () => {
    render(<Default />)
    await waitFor(() =>
      expect(screen.queryByText('Vendors')).not.toBeInTheDocument(),
    )
  })

  it('EmptyItems renders without error', async () => {
    render(<EmptyItems />)
    await waitFor(() =>
      expect(screen.queryByText('Vendors')).not.toBeInTheDocument(),
    )
  })

  it('Disabled renders without error', async () => {
    render(<Disabled />)
    await waitFor(() =>
      expect(screen.queryByText('Vendors')).not.toBeInTheDocument(),
    )
  })

  it('WithVendors renders without error', async () => {
    render(<WithVendors />)
    expect(await screen.findByText('Vendors')).toBeInTheDocument()
  })

  it('WithRecipes renders without error', async () => {
    render(<WithRecipes />)
    expect(await screen.findByText('Recipes')).toBeInTheDocument()
  })

  it('WithVendorsAndRecipes renders without error', async () => {
    render(<WithVendorsAndRecipes />)
    expect(await screen.findByText('Vendors')).toBeInTheDocument()
  })

  it('HideVendorFilter renders without error', async () => {
    render(<HideVendorFilter />)
    expect(await screen.findByText('Recipes')).toBeInTheDocument()
  })

  it('HideRecipeFilter renders without error', async () => {
    render(<HideRecipeFilter />)
    expect(await screen.findByText('Vendors')).toBeInTheDocument()
  })
})
