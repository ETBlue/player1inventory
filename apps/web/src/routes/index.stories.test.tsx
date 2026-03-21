import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, WithItems } = composeStories(stories)

describe('Pantry index stories smoke tests', () => {
  it('Default renders without error', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('button', { name: /add item/i }),
    ).toBeInTheDocument()
  })

  it('WithItems renders seeded items', async () => {
    render(<WithItems />)
    expect(await screen.findByText(/milk/i)).toBeInTheDocument()
  })
})
