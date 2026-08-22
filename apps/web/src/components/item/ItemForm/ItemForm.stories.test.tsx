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

  it('InfoSection shows the note and wikidata fields plus the global stock settings', () => {
    render(<InfoSection />)
    // Note textarea is rendered in the info section
    expect(screen.getByRole('textbox', { name: /note/i })).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /wikidata/i }),
    ).toBeInTheDocument()
    // Package unit is a GLOBAL setting since v16, so it lives here
    expect(screen.getByLabelText(/package unit/i)).toBeInTheDocument()
    // …and the per-location numbers do not
    expect(screen.queryByLabelText(/^packed/i)).not.toBeInTheDocument()
  })

  it('StockSection shows the per-location quantity fields, not the global settings', () => {
    render(<StockSection />)
    expect(screen.getByLabelText(/^packed/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/target quantity/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/package unit/i)).not.toBeInTheDocument()
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
