import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './items.stories'

const { Default, WithItems } = composeStories(stories)

describe('Settings vendor detail items tab stories smoke tests', () => {
  it('Default renders the items tab with unassigned items visible', async () => {
    render(<Default />)
    expect(await screen.findByText(/olive oil/i)).toBeInTheDocument()
  })

  it('WithItems renders an item assigned to the vendor', async () => {
    render(<WithItems />)
    expect(await screen.findByText(/almond butter/i)).toBeInTheDocument()
  })
})
