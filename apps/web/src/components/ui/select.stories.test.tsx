import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './select.stories'

const { Default, WithDefaultValue, Disabled, LongList, NestedOptions } =
  composeStories(stories)

describe('Select stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Select a fruit')).toBeInTheDocument()
  })

  it('WithDefaultValue renders without error', () => {
    render(<WithDefaultValue />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('Disabled renders without error', () => {
    render(<Disabled />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('LongList renders without error', () => {
    render(<LongList />)
    expect(screen.getByText('Select a country')).toBeInTheDocument()
  })

  it('NestedOptions renders without error', () => {
    render(<NestedOptions />)
    expect(screen.getByText('Select a category')).toBeInTheDocument()
  })
})
