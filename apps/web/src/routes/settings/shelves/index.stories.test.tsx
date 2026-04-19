import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Empty, WithShelves } = composeStories(stories)

describe('Settings shelves page stories smoke tests', () => {
  it('Empty renders the shelves settings page heading', async () => {
    render(<Empty />)
    expect(
      await screen.findByRole('heading', { name: /shelves/i }),
    ).toBeInTheDocument()
  })

  it('WithShelves renders a seeded shelf name', async () => {
    render(<WithShelves />)
    expect(await screen.findByText(/fridge/i)).toBeInTheDocument()
  })
})
