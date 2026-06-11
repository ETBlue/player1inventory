import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { DefaultOnly, WithLocations } = composeStories(stories)

describe('Settings locations page stories smoke tests', () => {
  it('DefaultOnly renders the locations settings page heading', async () => {
    render(<DefaultOnly />)
    expect(
      await screen.findByRole('heading', { name: /locations/i }),
    ).toBeInTheDocument()
  })

  it('WithLocations renders a seeded location name', async () => {
    render(<WithLocations />)
    expect(await screen.findByText(/office/i)).toBeInTheDocument()
  })
})
