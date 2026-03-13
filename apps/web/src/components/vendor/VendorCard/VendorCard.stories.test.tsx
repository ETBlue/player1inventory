import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './VendorCard.stories'

const { Default, WithItemCount, WithNoItems } = composeStories(stories)

describe('VendorCard stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Costco')).toBeInTheDocument()
  })

  it('WithItemCount renders without error', () => {
    render(<WithItemCount />)
    // The count span renders "· {count} items" with the dot as a separate text node
    expect(screen.getByText(/5 items/)).toBeInTheDocument()
  })

  it('WithNoItems renders without error', () => {
    render(<WithNoItems />)
    expect(screen.getByText(/0 items/)).toBeInTheDocument()
  })
})
