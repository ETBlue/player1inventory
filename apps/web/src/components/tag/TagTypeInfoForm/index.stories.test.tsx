import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { CreateMode, EditMode, WithValidationError, Dirty, Saving } =
  composeStories(stories)

describe('TagTypeInfoForm stories smoke tests', () => {
  it('CreateMode renders name input', () => {
    render(<CreateMode />)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('EditMode renders name input with existing value', () => {
    render(<EditMode />)
    expect(screen.getByLabelText('Name')).toHaveValue('Category')
  })

  it('WithValidationError renders validation message', () => {
    render(<WithValidationError />)
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })

  it('Dirty renders save button', () => {
    render(<Dirty />)
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('Saving renders disabled submit button', () => {
    render(<Saving />)
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
  })
})
