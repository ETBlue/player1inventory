import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './AddNameDialog.stories'

const { AddTag, AddVendor, AddRecipe, WithError } = composeStories(stories)

describe('AddNameDialog stories smoke tests', () => {
  it('AddTag renders without error', () => {
    render(<AddTag />)
    expect(screen.getByRole('button', { name: 'Add Tag' })).toBeInTheDocument()
  })

  it('AddVendor renders without error', () => {
    render(<AddVendor />)
    expect(
      screen.getByRole('button', { name: 'Add Vendor' }),
    ).toBeInTheDocument()
  })

  it('AddRecipe renders without error', () => {
    render(<AddRecipe />)
    expect(
      screen.getByRole('button', { name: 'Add Recipe' }),
    ).toBeInTheDocument()
  })

  it('WithError renders validation message when name is empty', () => {
    render(<WithError />)
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })
})
