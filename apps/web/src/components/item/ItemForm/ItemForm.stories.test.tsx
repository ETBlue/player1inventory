import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemForm.stories'

const {
  CreateMode,
  InfoSection,
  StockSection,
  EditMode,
  EditMeasurementMode,
  EditValidationError,
  CreateModeEmptyError,
  Saving,
} = composeStories(stories)

describe('ItemForm stories smoke tests', () => {
  it('CreateMode renders without error', () => {
    render(<CreateMode />)
    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument()
  })

  it('InfoSection shows the new note and wikidata fields', () => {
    render(<InfoSection />)
    // Note textarea is rendered in the info section
    expect(screen.getByRole('textbox', { name: /note/i })).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /wikidata/i }),
    ).toBeInTheDocument()
    // Package unit lives in the stock section, so it should NOT be here
    expect(screen.queryByLabelText(/package unit/i)).not.toBeInTheDocument()
  })

  it('StockSection shows the package unit field', () => {
    render(<StockSection />)
    expect(screen.getByLabelText(/package unit/i)).toBeInTheDocument()
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

  it('CreateModeEmptyError shows name validation error', () => {
    render(<CreateModeEmptyError />)
    expect(screen.getByText('Name is required.')).toBeInTheDocument()
  })

  it('Saving renders disabled submit button', () => {
    render(<Saving />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })
})
