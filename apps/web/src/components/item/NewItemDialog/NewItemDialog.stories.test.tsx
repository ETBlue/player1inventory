import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './NewItemDialog.stories'

const { Default, WithInitialName, WithoutSuccessCallback } =
  composeStories(stories)

describe('NewItemDialog stories smoke tests', () => {
  it('Default renders the dialog with name and package unit inputs', () => {
    render(<Default />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/package unit/i)).toBeInTheDocument()
  })

  it('WithInitialName renders with pre-filled name', () => {
    render(<WithInitialName />)
    expect(screen.getByLabelText(/name/i)).toHaveValue('Milk')
  })

  it('WithoutSuccessCallback renders the dialog', () => {
    render(<WithoutSuccessCallback />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
