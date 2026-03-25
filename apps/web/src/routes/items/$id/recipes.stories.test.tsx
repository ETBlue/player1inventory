import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './recipes.stories'

const { Default, WithRecipes, EmptyRecipes } = composeStories(stories)

describe('Item detail recipes tab stories smoke tests', () => {
  it('Default renders the New Recipe button after setup', async () => {
    render(<Default />)
    expect(await screen.findByText('New Recipe')).toBeInTheDocument()
  })

  it('Default renders the no-recipes-assigned empty hint when no recipes assigned', async () => {
    render(<Default />)
    expect(await screen.findByText('No recipes assigned.')).toBeInTheDocument()
  })

  it('WithRecipes renders recipe badges after setup', async () => {
    render(<WithRecipes />)
    expect(await screen.findByText('Pancakes')).toBeInTheDocument()
    expect(screen.getByText('Pasta Sauce')).toBeInTheDocument()
  })

  it('EmptyRecipes renders the no-recipes-assigned empty hint', async () => {
    render(<EmptyRecipes />)
    expect(await screen.findByText('No recipes assigned.')).toBeInTheDocument()
  })
})
