import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './VendorNameForm.stories'

const { Empty, WithName, Pending, WithError } = composeStories(stories)

describe('VendorNameForm stories smoke tests', () => {
  it('Empty renders without error', () => {
    render(<Empty />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('WithName renders without error', () => {
    render(<WithName />)
    expect(screen.getByDisplayValue('Costco')).toBeInTheDocument()
  })

  it('Pending renders without error', () => {
    render(<Pending />)
    expect(screen.getByDisplayValue('Costco')).toBeInTheDocument()
  })

  it('WithError renders validation message', () => {
    render(<WithError />)
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })
})
