import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ConsumableFilterDropdown.stories'

const { All, NotConsumable } = composeStories(stories)

describe('ConsumableFilterDropdown stories smoke tests', () => {
  it('All renders the Consumable button', () => {
    render(<All />)
    expect(
      screen.getByRole('button', { name: 'Consumable' }),
    ).toBeInTheDocument()
  })

  it('NotConsumable renders the active choice', () => {
    render(<NotConsumable />)
    expect(
      screen.getByRole('button', { name: 'Not consumable' }),
    ).toBeInTheDocument()
  })
})
