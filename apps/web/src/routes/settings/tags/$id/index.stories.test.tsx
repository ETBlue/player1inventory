import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, WithParentSelector } = composeStories(stories)

describe('Settings tags $id index stories smoke tests', () => {
  it('Default renders without error', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('heading', { name: /organic/i }),
    ).toBeInTheDocument()
  })

  it('WithParentSelector renders parent tag selector', async () => {
    render(<WithParentSelector />)
    expect(
      await screen.findByRole('heading', { name: /vegetables/i }),
    ).toBeInTheDocument()
  })
})
