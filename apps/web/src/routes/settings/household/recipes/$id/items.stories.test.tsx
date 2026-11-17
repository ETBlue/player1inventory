import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './items.stories'

const { Default, WithItems } = composeStories(stories)

describe('Settings recipe detail items tab stories smoke tests', () => {
  it('Default renders the items tab with unassigned items visible', async () => {
    render(<Default />)
    expect(
      await screen.findByText(/romaine lettuce/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument()
  })

  it('WithItems renders an item assigned to the recipe', async () => {
    render(<WithItems />)
    // 3s, not the default 1s: under full-suite load this page took longer
    // than 1s to show its rows after H5 task F.5 added the role read
    expect(
      await screen.findByText('Chicken Breast', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
  })
})
