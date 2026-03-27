import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, WithValidationError, Dirty, Saving } = composeStories(stories)

describe('RecipeInfoForm stories smoke tests', () => {
  it('Default renders name input', () => {
    render(<Default />)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('WithValidationError renders validation message', () => {
    render(<WithValidationError />)
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })

  it('Dirty renders save button', () => {
    render(<Dirty />)
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('Saving renders disabled saving button', () => {
    render(<Saving />)
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
  })
})
