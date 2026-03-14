import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './input.stories'

const { Default, WithLabel, Disabled, WithValue } = composeStories(stories)

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
})
