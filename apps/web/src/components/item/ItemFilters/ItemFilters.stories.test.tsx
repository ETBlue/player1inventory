import { composeStories } from '@storybook/react'
import { render, waitFor } from '@testing-library/react'
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
    const { container } = render(<Default />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('EmptyItems renders without error', async () => {
    const { container } = render(<EmptyItems />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('Disabled renders without error', async () => {
    const { container } = render(<Disabled />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithVendors renders without error', async () => {
    const { container } = render(<WithVendors />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithRecipes renders without error', async () => {
    const { container } = render(<WithRecipes />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithVendorsAndRecipes renders without error', async () => {
    const { container } = render(<WithVendorsAndRecipes />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('HideVendorFilter renders without error', async () => {
    const { container } = render(<HideVendorFilter />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('HideRecipeFilter renders without error', async () => {
    const { container } = render(<HideRecipeFilter />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })
})
