import { composeStories } from '@storybook/react'
import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const {
  Default,
  WithItems,
  WithSearchTail,
  ShelfGroupView,
  VendorGroupView,
  RecipeGroupView,
  ShelfDetailView,
  ShelfDetailViewSearchTail,
  VendorDetailView,
  VendorDetailViewSearchTail,
  RecipeDetailView,
  RecipeDetailViewSearchTail,
} = composeStories(stories)

// These stories mount the whole routeTree, so the desktop Sidebar's
// full-variant LocationSwitcher sits in the DOM next to the page toolbar's
// `lg:hidden` copy — jsdom loads no CSS, so both are present and an unscoped
// query matches two elements. Scope to <main> to assert on the toolbar copy,
// which is what these tests are about.
async function expectToolbarSwitcher() {
  const main = await screen.findByRole('main')
  await waitFor(() =>
    expect(
      within(main).getByRole('button', { name: /switch location/i }),
    ).toBeInTheDocument(),
  )
}

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

  it('WithSearchTail shows the not-stocked-here section for a search match', async () => {
    render(<WithSearchTail />)
    expect(await screen.findByText('1 not stocked here')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add to My Home: Milk Powder' }),
    ).toBeInTheDocument()
  })

  it('ShelfGroupView renders the manage shelves link', async () => {
    render(<ShelfGroupView />)
    expect(
      await screen.findByRole('link', { name: /manage shelves/i }),
    ).toBeInTheDocument()
  })

  it('ShelfGroupView mounts the LocationSwitcher', async () => {
    render(<ShelfGroupView />)
    await expectToolbarSwitcher()
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
    await expectToolbarSwitcher()
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
    await expectToolbarSwitcher()
  })

  it('ShelfDetailView renders the seeded item', async () => {
    render(<ShelfDetailView />)
    expect(await screen.findByText(/milk/i)).toBeInTheDocument()
  })

  it('ShelfDetailView mounts the LocationSwitcher', async () => {
    render(<ShelfDetailView />)
    await expectToolbarSwitcher()
  })

  it('ShelfDetailViewSearchTail shows both tail sections for a selection shelf', async () => {
    render(<ShelfDetailViewSearchTail />)
    expect(await screen.findByText('1 not in this list')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add to shelf: Milk' }),
    ).toBeInTheDocument()
    expect(screen.getByText('1 not stocked here')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add to My Home: Milk Powder' }),
    ).toBeInTheDocument()
  })

  it('VendorDetailView renders the seeded item', async () => {
    render(<VendorDetailView />)
    expect(await screen.findByText(/eggs/i)).toBeInTheDocument()
  })

  it('VendorDetailView mounts the LocationSwitcher', async () => {
    render(<VendorDetailView />)
    await expectToolbarSwitcher()
  })

  it('VendorDetailViewSearchTail shows both tail sections with the vendor action', async () => {
    render(<VendorDetailViewSearchTail />)
    // Bucket 2 — stocked at My Home but carrying no vendor.
    expect(await screen.findByText('1 not in this list')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Apply Costco: Milk' }),
    ).toBeInTheDocument()
    // Bucket 3 — stocked ONLY at the Office. Its only action stocks it here;
    // applying the vendor is a separate second press, so no "Apply Costco"
    // button exists for it.
    expect(screen.getByText('1 not stocked here')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add to My Home: Milk Powder' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Apply Costco: Milk Powder' }),
    ).not.toBeInTheDocument()
  })

  it('RecipeDetailView renders the seeded item', async () => {
    render(<RecipeDetailView />)
    const matches = await screen.findAllByText(/pasta/i)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('RecipeDetailView mounts the LocationSwitcher', async () => {
    render(<RecipeDetailView />)
    await expectToolbarSwitcher()
  })

  it('RecipeDetailViewSearchTail shows both tail sections with the recipe action', async () => {
    render(<RecipeDetailViewSearchTail />)
    // Bucket 2 — stocked at My Home but not an ingredient yet.
    expect(await screen.findByText('1 not in this list')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add to recipe: Milk' }),
    ).toBeInTheDocument()
    // Bucket 3 — stocked ONLY at the Office. Its only action stocks it here;
    // adding it to the recipe is a separate second press.
    expect(screen.getByText('1 not stocked here')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add to My Home: Milk Powder' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add to recipe: Milk Powder' }),
    ).not.toBeInTheDocument()
  })
})
