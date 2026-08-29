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

  it('WithShelves renders the filter count on filter shelves only', async () => {
    render(<WithShelves />)

    // Fridge selects 2 tags of one type + 1 vendor + 1 recipe = 4 options
    expect(await screen.findByText('4 filters')).toBeInTheDocument()
    // Snacks selects a single vendor — singular
    expect(await screen.findByText('1 filter')).toBeInTheDocument()
    // The selection shelf is the contrast case: no filter count anywhere on it
    expect(screen.getAllByText(/^\d+ filters?$/)).toHaveLength(2)
  })
})
