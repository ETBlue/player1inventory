import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './$vendorId.stories'

const { Default, WithCartItems, WithNoVendorCart } = composeStories(stories)

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
})
