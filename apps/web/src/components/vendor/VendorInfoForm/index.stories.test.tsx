import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, WithValidationError, Dirty, Saving, ReadOnly } =
  composeStories(stories)

describe('VendorInfoForm stories smoke tests', () => {
  it('Default renders name input with vendor name', () => {
    render(<Default />)
    expect(screen.getByDisplayValue('Costco')).toBeInTheDocument()
  })

  it('WithValidationError renders required error', () => {
    render(<WithValidationError />)
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })

  it('Dirty renders form with save button', () => {
    render(<Dirty />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('Saving renders disabled save button', () => {
    render(<Saving />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('ReadOnly shows a readOnly name and no Save button', () => {
    render(<ReadOnly />)
    expect(screen.getByLabelText('Name')).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
  })
})
