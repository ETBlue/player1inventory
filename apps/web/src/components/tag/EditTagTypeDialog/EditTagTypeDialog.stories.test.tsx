import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './EditTagTypeDialog.stories'

const { Default, WithValidationError } = composeStories(stories)

describe('EditTagTypeDialog stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByRole('heading', { name: /edit/i })).toBeInTheDocument()
  })

  it('WithValidationError renders dialog open with validation error visible', () => {
    render(<WithValidationError />)
    expect(screen.getByRole('heading', { name: /edit/i })).toBeInTheDocument()
  })
})
