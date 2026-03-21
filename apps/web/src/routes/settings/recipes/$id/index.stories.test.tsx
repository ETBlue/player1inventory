import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default } = composeStories(stories)

describe('Settings recipe detail info tab stories smoke tests', () => {
  it('Default renders the recipe name in the form', async () => {
    render(<Default />)
    expect(await screen.findByText(/pasta bolognese/i)).toBeInTheDocument()
  })
})
