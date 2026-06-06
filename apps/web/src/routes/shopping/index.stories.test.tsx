import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, WithVendors, WithVendorCarts } = composeStories(stories)

describe('ShoppingIndex page stories smoke tests', () => {
  it('Default renders shopping title', async () => {
    render(<Default />)
    const shoppingElements = await screen.findAllByText(/shopping/i)
    expect(shoppingElements.length).toBeGreaterThan(0)
  })

  it('WithVendors renders vendor names', async () => {
    render(<WithVendors />)
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()
  })

  it('WithVendorCarts renders vendors with cart data', async () => {
    render(<WithVendorCarts />)
    expect(await screen.findByText(/iherb/i)).toBeInTheDocument()
  })
})
