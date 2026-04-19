import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './$shelfId.stories'

// shelves.$shelfId.stories uses Dexie (fake-indexeddb/auto handles this in test setup)
// and ApolloProvider (no-op client, set up in the story). Each story initialises
// IndexedDB in a useEffect before navigating to the route. The page renders a
// search input once loaded.
const { Unsorted, SelectionShelf, FilterShelf, EmptySelection } =
  composeStories(stories)

describe('ShelfDetail stories smoke tests', () => {
  it('Unsorted renders search input', async () => {
    render(<Unsorted />)
    expect(
      await screen.findByRole(
        'textbox',
        { name: /search items/i },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
  })

  it('SelectionShelf renders search input', async () => {
    render(<SelectionShelf />)
    expect(
      await screen.findByRole(
        'textbox',
        { name: /search items/i },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
  })

  it('FilterShelf renders search input', async () => {
    render(<FilterShelf />)
    expect(
      await screen.findByRole(
        'textbox',
        { name: /search items/i },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
  })

  it('EmptySelection renders search input', async () => {
    render(<EmptySelection />)
    expect(
      await screen.findByRole(
        'textbox',
        { name: /search items/i },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
  })
})
