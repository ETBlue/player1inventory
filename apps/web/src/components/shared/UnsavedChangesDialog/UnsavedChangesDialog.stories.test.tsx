import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './UnsavedChangesDialog.stories'

const { CanSave, FieldError, SaveFails, WithoutSave } = composeStories(stories)

describe('UnsavedChangesDialog stories smoke tests', () => {
  it('CanSave shows Cancel, Discard and an enabled Save', () => {
    render(<CanSave />)
    const dialog = screen.getByRole('alertdialog')
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Discard' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('FieldError shows Save disabled', () => {
    render(<FieldError />)
    expect(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Save',
      }),
    ).toBeDisabled()
  })

  it('SaveFails renders an enabled Save', () => {
    render(<SaveFails />)
    expect(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Save',
      }),
    ).toBeEnabled()
  })

  it('WithoutSave shows no Save button', () => {
    render(<WithoutSave />)
    const dialog = screen.getByRole('alertdialog')
    expect(
      within(dialog).getByRole('button', { name: 'Discard' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument()
  })
})
