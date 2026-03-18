import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
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
    render(<Default />)
    expect(
      await screen.findByRole('button', { name: /sort by criteria/i }),
    ).toBeInTheDocument()
  })

  it('WithTagsToggle renders without error', async () => {
    render(<WithTagsToggle />)
    expect(
      await screen.findByRole('button', { name: /sort by criteria/i }),
    ).toBeInTheDocument()
  })

  it('WithAddButton renders without error', async () => {
    render(<WithAddButton />)
    expect(
      await screen.findByRole('button', { name: /sort by criteria/i }),
    ).toBeInTheDocument()
  })

  it('WithLeadingSlot renders without error', async () => {
    render(<WithLeadingSlot />)
    expect(await screen.findByRole('combobox')).toBeInTheDocument()
  })

  it('SortedByStock renders without error', async () => {
    render(<SortedByStock />)
    expect(await screen.findByText('Stock')).toBeInTheDocument()
  })

  it('DescendingSort renders without error', async () => {
    render(<DescendingSort />)
    expect(
      await screen.findByRole('button', { name: /sort by criteria/i }),
    ).toBeInTheDocument()
  })

  it('WithVendors renders without error', async () => {
    render(<WithVendors />)
    expect(
      await screen.findByRole('button', { name: /sort by criteria/i }),
    ).toBeInTheDocument()
  })

  it('WithRecipes renders without error', async () => {
    render(<WithRecipes />)
    expect(
      await screen.findByRole('button', { name: /sort by criteria/i }),
    ).toBeInTheDocument()
  })

  it('WithVendorsAndRecipes renders without error', async () => {
    render(<WithVendorsAndRecipes />)
    expect(
      await screen.findByRole('button', { name: /sort by criteria/i }),
    ).toBeInTheDocument()
  })

  it('HideVendorFilter renders without error', async () => {
    render(<HideVendorFilter />)
    expect(
      await screen.findByRole('button', { name: /sort by criteria/i }),
    ).toBeInTheDocument()
  })

  it('HideRecipeFilter renders without error', async () => {
    render(<HideRecipeFilter />)
    expect(
      await screen.findByRole('button', { name: /sort by criteria/i }),
    ).toBeInTheDocument()
  })
})
