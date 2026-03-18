import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemForm.stories'

const { CreateMode, EditMode, EditMeasurementMode, EditValidationError } =
  composeStories(stories)

describe('ItemForm stories smoke tests', () => {
  it('CreateMode renders without error', () => {
    render(<CreateMode />)
    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument()
  })

  it('EditMode renders without error', () => {
    render(<EditMode />)
    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument()
  })

  it('EditMeasurementMode renders without error', () => {
    render(<EditMeasurementMode />)
    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument()
  })

  it('EditValidationError renders without error', () => {
    render(<EditValidationError />)
    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument()
  })
})
