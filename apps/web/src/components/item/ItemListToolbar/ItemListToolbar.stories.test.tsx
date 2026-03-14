import { composeStories } from '@storybook/react'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemListToolbar.stories'

const {
  Default,
  WithTagsToggle,
  WithAddButton,
  WithLeadingSlot,
  SortedByStock,
  DescendingSort,
  WithVendors,
  WithRecipes,
  WithVendorsAndRecipes,
  HideVendorFilter,
  HideRecipeFilter,
} = composeStories(stories)

describe('ItemListToolbar stories smoke tests', () => {
  it('Default renders without error', async () => {
    const { container } = render(<Default />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithTagsToggle renders without error', async () => {
    const { container } = render(<WithTagsToggle />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithAddButton renders without error', async () => {
    const { container } = render(<WithAddButton />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithLeadingSlot renders without error', async () => {
    const { container } = render(<WithLeadingSlot />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('SortedByStock renders without error', async () => {
    const { container } = render(<SortedByStock />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('DescendingSort renders without error', async () => {
    const { container } = render(<DescendingSort />)
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
