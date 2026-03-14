import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ColorSelect.stories'

const { Default, AllColors, WithLabel, InForm } = composeStories(stories)

describe('ColorSelect stories smoke tests', () => {
  it('Default renders without error', () => {
    const { container } = render(<Default />)
    expect(container.firstChild).not.toBeNull()
  })

  it('AllColors renders without error', () => {
    render(<AllColors />)
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
  })

  it('WithLabel renders without error', () => {
    render(<WithLabel />)
    expect(screen.getByText('Tag Color')).toBeInTheDocument()
  })

  it('InForm renders without error', () => {
    render(<InForm />)
    expect(screen.getByText('Tag Name')).toBeInTheDocument()
  })
})
