import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, WithNestedTags } = composeStories(stories)

describe('Settings tags index stories smoke tests', () => {
  it('Default renders without error', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('heading', { name: /tags/i }),
    ).toBeInTheDocument()
  })

  it('WithNestedTags renders nested tag hierarchy', async () => {
    render(<WithNestedTags />)
    // The page heading ("Tags") should be visible
    expect(
      await screen.findByRole('heading', { name: /tags/i }),
    ).toBeInTheDocument()
    // The "New Tag Type" button should be visible (confirms full page rendered)
    expect(
      await screen.findByRole('button', { name: /new tag type/i }),
    ).toBeInTheDocument()
  })
})
