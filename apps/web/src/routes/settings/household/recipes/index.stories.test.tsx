import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, WithRecipes } = composeStories(stories)

describe('Settings recipes list stories smoke tests', () => {
  it('Default renders the recipes list page', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('button', { name: /new recipe/i }),
    ).toBeInTheDocument()
  })

  it('WithRecipes renders a seeded recipe name', async () => {
    render(<WithRecipes />)
    expect(await screen.findByText(/pasta bolognese/i)).toBeInTheDocument()
  })
})
