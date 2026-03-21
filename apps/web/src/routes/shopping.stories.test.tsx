import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './shopping.stories'

const { Default, WithCartItems, WithPinnedItem } = composeStories(stories)

describe('Shopping page stories smoke tests', () => {
  it('Default renders with empty cart toolbar', async () => {
    render(<Default />)
    expect(await screen.findByText(/packs in cart/i)).toBeInTheDocument()
  })

  it('WithCartItems renders seeded item names', async () => {
    render(<WithCartItems />)
    expect(await screen.findByText(/milk/i)).toBeInTheDocument()
  })

  it('WithPinnedItem renders pinned item name', async () => {
    render(<WithPinnedItem />)
    expect(await screen.findByText(/butter/i)).toBeInTheDocument()
  })
})
