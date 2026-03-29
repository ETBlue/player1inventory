import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './FilterStatus.stories'

const {
  WithActiveFilters,
  NoActiveFilters,
  AllFiltered,
  EmptyList,
  DisabledWithActiveFilters,
  DisabledNoActiveFilters,
} = composeStories(stories)

describe('FilterStatus stories smoke tests', () => {
  it('WithActiveFilters renders without error', () => {
    render(<WithActiveFilters />)
    expect(screen.getByText('Showing 5 of 10 items')).toBeInTheDocument()
  })

  it('NoActiveFilters renders without error', () => {
    render(<NoActiveFilters />)
    expect(screen.getByText('Showing 10 of 10 items')).toBeInTheDocument()
  })

  it('AllFiltered renders without error', () => {
    render(<AllFiltered />)
    expect(screen.getByText('Showing 0 of 10 items')).toBeInTheDocument()
  })

  it('EmptyList renders without error', () => {
    render(<EmptyList />)
    expect(screen.getByText('Showing 0 of 0 items')).toBeInTheDocument()
  })

  it('DisabledWithActiveFilters renders without error', () => {
    render(<DisabledWithActiveFilters />)
    expect(screen.getByText('Showing 5 of 10 items')).toBeInTheDocument()
  })

  it('DisabledNoActiveFilters renders without error', () => {
    render(<DisabledNoActiveFilters />)
    expect(screen.getByText('Showing 10 of 10 items')).toBeInTheDocument()
  })
})
