import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './new.stories'

const { Default } = composeStories(stories)

describe('Settings new vendor stories smoke tests', () => {
  it('Default renders the new vendor form heading', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('heading', { name: /new vendor/i }),
    ).toBeInTheDocument()
  })
})
