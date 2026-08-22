import { composeStories } from '@storybook/react'
import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './$vendorId.stories'

const { Default, WithCartItems, WithNoVendorCart, WithMultipleLocations } =
  composeStories(stories)

describe('ShoppingVendorCart page stories smoke tests', () => {
  it('Default renders vendor name or back button', async () => {
    render(<Default />)
    const backButton = await screen.findByRole('button', { name: /go back/i })
    expect(backButton).toBeInTheDocument()
  })

  it('WithCartItems renders an item name', async () => {
    render(<WithCartItems />)
    await waitFor(() => {
      expect(screen.getByText(/milk/i)).toBeInTheDocument()
    })
  })

  it('WithNoVendorCart renders no vendor text', async () => {
    render(<WithNoVendorCart />)
    expect(await screen.findByText(/no vendor/i)).toBeInTheDocument()
  })

  it('WithMultipleLocations renders the active-location switcher in the toolbar', async () => {
    render(<WithMultipleLocations />)
    // Scoped to <main>: the desktop Sidebar also mounts a switcher, and jsdom
    // loads no CSS so the toolbar's `lg:hidden` copy is present too.
    const main = await screen.findByRole('main')
    await waitFor(() =>
      expect(
        within(main).getByRole('button', { name: /switch location/i }),
      ).toBeInTheDocument(),
    )
  })
})
