import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as stories from './recipes.stories'

const {
  Default,
  PressedUnsaved,
  WithRecipes,
  EmptyRecipes,
  NonConsumableItem,
} = composeStories(stories)

describe('Item detail recipes tab stories smoke tests', () => {
  it('Default renders the New Recipe button after setup', async () => {
    render(<Default />)
    expect(await screen.findByText('New Recipe')).toBeInTheDocument()
  })

  it('Default renders the no-recipes-assigned empty hint when no recipes assigned', async () => {
    render(<Default />)
    expect(await screen.findByText('No recipes assigned')).toBeInTheDocument()
  })

  it('PressedUnsaved shows the pressed badge and the Save on', async () => {
    render(<PressedUnsaved />)
    const user = userEvent.setup()

    // Present first: Save is there and off
    const omelette = await screen.findByRole('button', { name: 'Omelette' })
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()

    // The press the story's `play` makes
    await user.click(omelette)

    expect(omelette).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled()
  })

  it('WithRecipes renders recipe badges after setup', async () => {
    render(<WithRecipes />)
    expect(await screen.findByText('Pancakes')).toBeInTheDocument()
    expect(screen.getByText('Pasta Sauce')).toBeInTheDocument()
  })

  it('EmptyRecipes renders the no-recipes-assigned empty hint', async () => {
    render(<EmptyRecipes />)
    expect(await screen.findByText('No recipes assigned')).toBeInTheDocument()
  })

  it('NonConsumableItem says it cannot be added and disables the other recipe', async () => {
    render(<NonConsumableItem />)
    expect(
      await screen.findByText(/not consumable, so it cannot be added/i),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Pasta Sauce' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })
})
