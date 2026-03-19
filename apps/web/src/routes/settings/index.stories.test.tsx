import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default } = composeStories(stories)

describe('Settings index stories smoke tests', () => {
  it('Default renders without error', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('heading', { name: /settings/i }),
    ).toBeInTheDocument()
  })
})
