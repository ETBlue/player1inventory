import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './checkbox.stories'

const { Unchecked, Checked, Indeterminate, Disabled, DisabledChecked } =
  composeStories(stories)

describe('Checkbox stories smoke tests', () => {
  it('Unchecked renders without error', () => {
    render(<Unchecked />)
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('Checked renders without error', () => {
    render(<Checked />)
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('Indeterminate renders without error', () => {
    render(<Indeterminate />)
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('Disabled renders without error', () => {
    render(<Disabled />)
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('DisabledChecked renders without error', () => {
    render(<DisabledChecked />)
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })
})
