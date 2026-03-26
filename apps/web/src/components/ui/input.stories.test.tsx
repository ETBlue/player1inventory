import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Input } from './input'
import * as stories from './input.stories'

const { Default, WithLabel, Disabled, WithValue, WithError } =
  composeStories(stories)

describe('Input stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByPlaceholderText('Enter text...')).toBeInTheDocument()
  })

  it('WithLabel renders without error', () => {
    render(<WithLabel />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('Disabled renders without error', () => {
    render(<Disabled />)
    expect(screen.getByPlaceholderText('Disabled input')).toBeInTheDocument()
  })

  it('WithValue renders without error', () => {
    render(<WithValue />)
    expect(screen.getByDisplayValue('Prefilled value')).toBeInTheDocument()
  })

  it('WithError renders validation message', () => {
    render(<WithError />)
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })
})

describe('Input error prop', () => {
  it('shows error message when error prop is set', () => {
    render(<Input error="This field is required." />)
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })

  it('applies destructive border class when error prop is set', () => {
    const { container } = render(<Input error="Error" />)
    expect(container.querySelector('input')).toHaveClass('border-destructive')
  })

  it('does not show error message when error prop is undefined', () => {
    render(<Input placeholder="test" />)
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument()
  })
})
