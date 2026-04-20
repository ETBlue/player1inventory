import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './$shelfId.stories'

const {
  Unsorted,
  SelectionShelf,
  FilterShelf,
  EmptySelection,
  WithInactiveItems,
} = composeStories(stories)

describe('ShelfDetail stories smoke tests', () => {
  it('Unsorted renders the shelf heading', async () => {
    render(<Unsorted />)
    expect(
      await screen.findByRole(
        'heading',
        { name: /unsorted/i },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
  })

  it('SelectionShelf renders the shelf heading', async () => {
    render(<SelectionShelf />)
    expect(
      await screen.findByRole('heading', { name: /dairy/i }, { timeout: 5000 }),
    ).toBeInTheDocument()
  })

  it('FilterShelf renders the shelf heading', async () => {
    render(<FilterShelf />)
    expect(
      await screen.findByRole(
        'heading',
        { name: /low stock/i },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
  })

  it('EmptySelection renders the shelf heading', async () => {
    render(<EmptySelection />)
    expect(
      await screen.findByRole(
        'heading',
        { name: /favorites/i },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
  })

  it('WithInactiveItems renders inactive items divider and active item before it', async () => {
    render(<WithInactiveItems />)

    // Wait for shelf heading
    await screen.findByRole(
      'heading',
      { name: /mixed shelf/i },
      { timeout: 5000 },
    )

    // Inactive items divider should be present
    const divider = await screen.findByText(/1 inactive item/i, undefined, {
      timeout: 5000,
    })
    expect(divider).toBeInTheDocument()

    // Both items should be rendered
    const activeCard = await screen.findByText(/^active item$/i, undefined, {
      timeout: 5000,
    })
    const inactiveCard = await screen.findByText(
      /^inactive item$/i,
      undefined,
      { timeout: 5000 },
    )
    expect(activeCard).toBeInTheDocument()
    expect(inactiveCard).toBeInTheDocument()

    // Active item should appear before the divider, divider before the inactive item
    // Use compareDocumentPosition instead of textContent index — the inactive item's
    // h3 includes a sr-only "Inactive" prefix, so exact textContent matching fails.
    expect(
      activeCard.compareDocumentPosition(divider) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      divider.compareDocumentPosition(inactiveCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
