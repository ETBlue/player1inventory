import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './new.stories'

const { Default, WithTags } = composeStories(stories)

describe('New Item form stories smoke tests', () => {
  it('Default renders the New Item page without error', async () => {
    render(<Default />)
    expect(await screen.findByText(/new item/i)).toBeInTheDocument()
  })

  it('WithTags renders the New Item page without error', async () => {
    render(<WithTags />)
    expect(await screen.findByText(/new item/i)).toBeInTheDocument()
  })
})
