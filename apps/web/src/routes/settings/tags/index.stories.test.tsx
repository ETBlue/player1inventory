import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, WithNestedTags, WithParentSelector } = composeStories(stories)

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

  it('WithParentSelector renders tag list with sibling tags', async () => {
    render(<WithParentSelector />)
    expect(
      await screen.findByRole('heading', { name: /tags/i }),
    ).toBeInTheDocument()
    // "New Tag" button should be visible inside a tag type card
    expect(
      await screen.findByRole('button', { name: /new tag/i }),
    ).toBeInTheDocument()
  })
})
