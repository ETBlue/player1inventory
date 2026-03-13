import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './cooking.stories'

// cooking.stories uses Dexie (fake-indexeddb/auto handles this in test setup)
// and ApolloProvider (no-op client, set up in the story itself).
// Each story initialises IndexedDB in a useEffect — the initial render shows
// "Loading..." while that runs, which is enough for a smoke test.
const { Default, WithRecipes, WithSearch, SortByRecent, SortByCount } =
  composeStories(stories)

describe('Cooking stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('WithRecipes renders without error', () => {
    render(<WithRecipes />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('WithSearch renders without error', () => {
    render(<WithSearch />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('SortByRecent renders without error', () => {
    render(<SortByRecent />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('SortByCount renders without error', () => {
    render(<SortByCount />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
