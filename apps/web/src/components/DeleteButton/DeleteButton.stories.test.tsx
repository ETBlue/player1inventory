import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './DeleteButton.stories'

const {
  TextButton,
  WithImpact,
  NoImpact,
  IconButton,
  TrashIcon,
  AsyncDelete,
  WithAriaLabel,
} = composeStories(stories)

describe('DeleteButton stories smoke tests', () => {
  it('TextButton renders without error', () => {
    render(<TextButton />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('WithImpact renders without error', () => {
    render(<WithImpact />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('NoImpact renders without error', () => {
    render(<NoImpact />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('IconButton renders without error', () => {
    const { container } = render(<IconButton />)
    expect(container.firstChild).not.toBeNull()
  })

  it('TrashIcon renders without error', () => {
    const { container } = render(<TrashIcon />)
    expect(container.firstChild).not.toBeNull()
  })

  it('AsyncDelete renders without error', () => {
    render(<AsyncDelete />)
    expect(
      screen.getByRole('button', { name: 'Delete (Async)' }),
    ).toBeInTheDocument()
  })

  it('WithAriaLabel renders without error', () => {
    render(<WithAriaLabel />)
    expect(
      screen.getByRole('button', { name: 'Delete Costco' }),
    ).toBeInTheDocument()
  })
})
