import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, WithVendors } = composeStories(stories)

describe('Settings vendors list stories smoke tests', () => {
  it('Default renders the vendors list page', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('button', { name: /new vendor/i }),
    ).toBeInTheDocument()
  })

  it('WithVendors renders a seeded vendor name', async () => {
    render(<WithVendors />)
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()
  })
})
