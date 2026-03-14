import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './AddNameDialog.stories'

const { AddTag, AddVendor, AddRecipe } = composeStories(stories)

describe('AddNameDialog stories smoke tests', () => {
  it('AddTag renders without error', () => {
    render(<AddTag />)
    expect(screen.getByRole('button', { name: 'Add Tag' })).toBeInTheDocument()
  })

  it('AddVendor renders without error', () => {
    render(<AddVendor />)
    expect(
      screen.getByRole('button', { name: 'New Vendor' }),
    ).toBeInTheDocument()
  })

  it('AddRecipe renders without error', () => {
    render(<AddRecipe />)
    expect(
      screen.getByRole('button', { name: 'New Recipe' }),
    ).toBeInTheDocument()
  })
})
