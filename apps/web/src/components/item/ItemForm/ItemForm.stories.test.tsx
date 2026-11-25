import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemForm.stories'

const {
  CreateMode,
  InfoSection,
  StockSection,
  StockSectionDateMode,
  EditMode,
  EditMeasurementMode,
  EditValidationError,
  CreateModeEmptyError,
  Saving,
  InfoSectionReadOnly,
  StockSectionReadOnly,
  SaveInTopBar,
  NotConsumable,
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
    expect(
      screen.getByRole('spinbutton', { name: /target quantity/i }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/package unit/i)).not.toBeInTheDocument()
  })

  it('StockSectionDateMode shows the "Expires on" row with its stored date', () => {
    render(<StockSectionDateMode />)
    // The row only renders when `expirationMode === 'date'`, so this query
    // fails if the fixture's mode changes. Same locator the row-order tests in
    // ItemForm.test.tsx and QuickUpdateDialog.test.tsx use.
    const dueDate = screen.getByLabelText(/expires on/i)
    expect(dueDate).toBeInTheDocument()
    expect(dueDate).toHaveValue('2026-10-15')
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

  it('InfoSectionReadOnly shows a readOnly name and no Save button', () => {
    render(<InfoSectionReadOnly />)
    expect(document.getElementById('name')).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
  })

  it('StockSectionReadOnly shows readOnly numbers, disabled steppers and no Save', () => {
    render(<StockSectionReadOnly />)
    expect(document.getElementById('packedQuantity')).toHaveAttribute(
      'readonly',
    )
    expect(
      screen.getByRole('button', { name: /increase packed/i }),
    ).toBeDisabled()
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
  })

  it('SaveInTopBar puts Save in the top bar, outside the form', async () => {
    render(<SaveInTopBar />)
    const save = await screen.findByRole('button', { name: /^save$/i })
    expect(save.closest('form')).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'Whole Milk' }).parentElement,
    ).toContainElement(save)
  })

  it('NotConsumable shows the switch off and hides the opened packs', () => {
    render(<NotConsumable />)
    expect(
      screen.getByRole('switch', { name: /^consumable$/i }),
    ).not.toBeChecked()
    expect(screen.getByLabelText(/^packed/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^unpacked/i)).not.toBeInTheDocument()
  })
})
