import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './cooking.stories'

// cooking.stories uses Dexie (fake-indexeddb/auto handles this in test setup)
// and ApolloProvider (no-op client, set up in the story itself).
// Each story initialises IndexedDB in a useEffect. Once loaded, the cooking
// page always renders a "Done" button (initially disabled).
const {
  Default,
  WithRecipes,
  WithCheckedRecipe,
  WithExpandedRecipe,
  WithActiveToolbar,
  WithSearch,
  SortByRecent,
  SortByCount,
} = composeStories(stories)

describe('Cooking stories smoke tests', () => {
  it('Default renders without error', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('Default empty state shows create recipe button', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('link', { name: /create recipe/i }),
    ).toBeInTheDocument()
  })

  it('WithRecipes renders without error', async () => {
    render(<WithRecipes />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('WithSearch renders without error', async () => {
    render(<WithSearch />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('SortByRecent renders without error', async () => {
    render(<SortByRecent />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('WithCheckedRecipe renders without error', async () => {
    render(<WithCheckedRecipe />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('WithExpandedRecipe renders without error', async () => {
    render(<WithExpandedRecipe />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('WithActiveToolbar renders without error', async () => {
    render(<WithActiveToolbar />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('SortByCount renders without error', async () => {
    render(<SortByCount />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })
})
