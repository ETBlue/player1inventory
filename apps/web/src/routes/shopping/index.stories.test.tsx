import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

// Assertions re-query inside waitFor rather than holding the element returned
// by findByText: a vendor card is remounted when it moves from the
// below-the-divider section to the top one as the item query resolves, so a
// captured element can already be detached by the time it is asserted on.

const { Default, WithVendors, WithVendorCarts, WithNotStockedHere } =
  composeStories(stories)

describe('ShoppingIndex page stories smoke tests', () => {
  it('Default renders shopping title', async () => {
    render(<Default />)
    const shoppingElements = await screen.findAllByText(/shopping/i)
    expect(shoppingElements.length).toBeGreaterThan(0)
  })

  it('WithVendors renders vendor names', async () => {
    render(<WithVendors />)
    await waitFor(() => expect(screen.getByText(/costco/i)).toBeInTheDocument())
  })

  it('WithVendorCarts renders vendors with cart data', async () => {
    render(<WithVendorCarts />)
    await waitFor(() => expect(screen.getByText(/iherb/i)).toBeInTheDocument())
  })

  it('WithNotStockedHere sinks the unstocked vendor and no-vendor bucket below the divider', async () => {
    render(<WithNotStockedHere />)
    await waitFor(() =>
      expect(screen.getByText(/not stocked here/i)).toHaveTextContent(
        '2 not stocked here',
      ),
    )
    expect(screen.getByText(/costco/i)).toBeInTheDocument()
    expect(screen.getByText(/cabin supply/i)).toBeInTheDocument()
    expect(screen.getByText(/no vendor/i)).toBeInTheDocument()
  })
})
