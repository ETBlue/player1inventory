import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Empty, WithShelves, WithItems } = composeStories(stories)

describe('ShelvesPage stories smoke tests', () => {
  it('Empty renders Manage shelves button', async () => {
    render(<Empty />)
    expect(
      await screen.findByRole('link', { name: /manage shelves/i }),
    ).toBeInTheDocument()
  })

  it('WithShelves renders shelf names', async () => {
    render(<WithShelves />)
    expect(await screen.findByText(/fridge/i)).toBeInTheDocument()
  })

  it('WithItems renders the selection shelf', async () => {
    render(<WithItems />)
    expect(await screen.findByText(/weekly staples/i)).toBeInTheDocument()
  })
})
