import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './NewRecipeDialog.stories'

const { Default, WithInitialName, WithoutSuccessCallback } =
  composeStories(stories)

describe('NewRecipeDialog stories smoke tests', () => {
  it('Default renders the dialog with name input', () => {
    render(<Default />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('WithInitialName renders with pre-filled name', () => {
    render(<WithInitialName />)
    expect(screen.getByRole('textbox')).toHaveValue('Pasta')
  })

  it('WithoutSuccessCallback renders the dialog', () => {
    render(<WithoutSuccessCallback />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
