import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, WithItems, ShelfGroupView, VendorGroupView, RecipeGroupView } =
  composeStories(stories)

describe('Pantry index stories smoke tests', () => {
  it('Default renders without error', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('button', { name: /add item/i }),
    ).toBeInTheDocument()
  })

  it('Default shows the Create item CTA button in empty state', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('button', { name: /create item/i }),
    ).toBeInTheDocument()
  })

  it('WithItems renders seeded items', async () => {
    render(<WithItems />)
    expect(await screen.findByText(/milk/i)).toBeInTheDocument()
  })

  it('ShelfGroupView renders the manage shelves link', async () => {
    render(<ShelfGroupView />)
    expect(
      await screen.findByRole('link', { name: /manage shelves/i }),
    ).toBeInTheDocument()
  })

  it('VendorGroupView renders with a vendor card', async () => {
    render(<VendorGroupView />)
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()
  })

  it('RecipeGroupView renders with a recipe card', async () => {
    render(<RecipeGroupView />)
    expect(await screen.findByText(/pasta carbonara/i)).toBeInTheDocument()
  })
})
