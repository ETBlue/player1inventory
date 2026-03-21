import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, WithTagsAndVendors } = composeStories(stories)

describe('Item detail index (info/stock) stories smoke tests', () => {
  it('Default renders the item name after setup', async () => {
    render(<Default />)
    expect(await screen.findByText('Milk')).toBeInTheDocument()
  })

  it('WithTagsAndVendors renders the item name after setup', async () => {
    render(<WithTagsAndVendors />)
    expect(await screen.findByText('Organic Whole Milk')).toBeInTheDocument()
  })
})
