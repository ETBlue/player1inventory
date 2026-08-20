import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './VendorCartCard.stories'

const {
  Default,
  EmptyCart,
  NoVendorCard,
  WithInactiveCount,
  WithoutInactiveCount,
} = composeStories(stories)

describe('VendorCartCard stories smoke tests', () => {
  it('renders vendor name and item count', () => {
    render(<Default />)
    expect(screen.getByText('Costco')).toBeInTheDocument()
    expect(screen.getByText(/12/)).toBeInTheDocument()
  })

  it('renders no-vendor card without capitalize', () => {
    render(<NoVendorCard />)
    expect(screen.getByText('No vendor')).toBeInTheDocument()
  })

  it('renders empty cart without badge', () => {
    render(<EmptyCart />)
    expect(screen.getByText('iHerb')).toBeInTheDocument()
    expect(screen.queryByText(/packs/)).not.toBeInTheDocument()
  })

  it('renders the inactive segment in the metadata line when inactiveCount > 0', () => {
    render(<WithInactiveCount />)
    expect(
      screen.getByText(/4 items? · 2 inactive · 1 in cart/),
    ).toBeInTheDocument()
  })

  it('omits the inactive segment when inactiveCount is 0', () => {
    render(<WithoutInactiveCount />)
    expect(screen.queryByText(/inactive/)).not.toBeInTheDocument()
  })
})
