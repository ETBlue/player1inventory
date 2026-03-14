import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TagNameForm.stories'

const { Empty, WithName, Pending } = composeStories(stories)

describe('TagNameForm stories smoke tests', () => {
  it('Empty renders without error', () => {
    render(<Empty />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('WithName renders without error', () => {
    render(<WithName />)
    expect(screen.getByDisplayValue('Dairy')).toBeInTheDocument()
  })

  it('Pending renders without error', () => {
    render(<Pending />)
    expect(screen.getByDisplayValue('Dairy')).toBeInTheDocument()
  })
})
