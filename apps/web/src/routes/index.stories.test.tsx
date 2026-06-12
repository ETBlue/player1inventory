import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const {
  Default,
  WithItems,
  ShelfGroupView,
  VendorGroupView,
  RecipeGroupView,
  ShelfDetailView,
  VendorDetailView,
  RecipeDetailView,
} = composeStories(stories)

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

  it('ShelfGroupView mounts the LocationSwitcher', async () => {
    render(<ShelfGroupView />)
    expect(
      await screen.findByRole('button', { name: /switch location/i }),
    ).toBeInTheDocument()
  })

  it('VendorGroupView renders with a vendor card', async () => {
    render(<VendorGroupView />)
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()
  })

  it('VendorGroupView renders the manage vendors link', async () => {
    render(<VendorGroupView />)
    expect(
      await screen.findByRole('link', { name: /manage vendors/i }),
    ).toBeInTheDocument()
  })

  it('VendorGroupView mounts the LocationSwitcher', async () => {
    render(<VendorGroupView />)
    expect(
      await screen.findByRole('button', { name: /switch location/i }),
    ).toBeInTheDocument()
  })

  it('RecipeGroupView renders with a recipe card', async () => {
    render(<RecipeGroupView />)
    expect(await screen.findByText(/pasta carbonara/i)).toBeInTheDocument()
  })

  it('RecipeGroupView renders the manage recipes link', async () => {
    render(<RecipeGroupView />)
    expect(
      await screen.findByRole('link', { name: /manage recipes/i }),
    ).toBeInTheDocument()
  })

  it('RecipeGroupView mounts the LocationSwitcher', async () => {
    render(<RecipeGroupView />)
    expect(
      await screen.findByRole('button', { name: /switch location/i }),
    ).toBeInTheDocument()
  })

  it('ShelfDetailView renders the seeded item', async () => {
    render(<ShelfDetailView />)
    expect(await screen.findByText(/milk/i)).toBeInTheDocument()
  })

  it('ShelfDetailView mounts the LocationSwitcher', async () => {
    render(<ShelfDetailView />)
    expect(
      await screen.findByRole('button', { name: /switch location/i }),
    ).toBeInTheDocument()
  })

  it('VendorDetailView renders the seeded item', async () => {
    render(<VendorDetailView />)
    expect(await screen.findByText(/eggs/i)).toBeInTheDocument()
  })

  it('VendorDetailView mounts the LocationSwitcher', async () => {
    render(<VendorDetailView />)
    expect(
      await screen.findByRole('button', { name: /switch location/i }),
    ).toBeInTheDocument()
  })

  it('RecipeDetailView renders the seeded item', async () => {
    render(<RecipeDetailView />)
    const matches = await screen.findAllByText(/pasta/i)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('RecipeDetailView mounts the LocationSwitcher', async () => {
    render(<RecipeDetailView />)
    expect(
      await screen.findByRole('button', { name: /switch location/i }),
    ).toBeInTheDocument()
  })
})
