import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './GroupByToggle.stories'

const { Default, VendorActive, RecipeActive } = composeStories(stories)

describe('GroupByToggle stories smoke tests', () => {
  it('Default renders with shelf group-by button pressed', () => {
    render(<Default />)
    expect(
      screen.getByRole('button', { name: 'Group by shelf' }),
    ).toBeInTheDocument()
  })

  it('VendorActive renders with vendor group-by button pressed', () => {
    render(<VendorActive />)
    expect(
      screen.getByRole('button', { name: 'Group by vendor' }),
    ).toBeInTheDocument()
  })

  it('RecipeActive renders with recipe group-by button pressed', () => {
    render(<RecipeActive />)
    expect(
      screen.getByRole('button', { name: 'Group by recipe' }),
    ).toBeInTheDocument()
  })
})
