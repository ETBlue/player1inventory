import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './new.stories'

const { Default } = composeStories(stories)

describe('Settings new recipe stories smoke tests', () => {
  it('Default renders the new recipe form heading', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('heading', { name: /new recipe/i }),
    ).toBeInTheDocument()
  })
})
