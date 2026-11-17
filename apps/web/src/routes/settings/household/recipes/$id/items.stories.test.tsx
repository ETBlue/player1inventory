import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
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
    // Wait for the ASSIGNED state, not just the name. The story creates the
    // item and then assigns it, so the row can first render unassigned and
    // then move to the assigned group, which mounts a new node. Waiting for
    // the name alone found the first node, which was gone a moment later
    // (seen in full-suite runs after households H5 task F.5 added a render).
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'Remove Chicken Breast' }),
      ).toBeChecked(),
    )
  })
})
