import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './GroupCard.stories'

const {
  Default,
  VendorStyle,
  RecipeStyle,
  WithFilterSummary,
  OutOfStock,
  LowStock,
  Unsorted,
} = composeStories(stories)

describe('GroupCard stories smoke tests', () => {
  it('Default renders the group name', () => {
    render(<Default />)
    expect(screen.getByText('Pantry')).toBeInTheDocument()
  })

  it('VendorStyle renders with normal-case name', () => {
    render(<VendorStyle />)
    expect(screen.getByText('iHerb')).toBeInTheDocument()
  })

  it('RecipeStyle renders recipe name', () => {
    render(<RecipeStyle />)
    expect(screen.getByText('Pasta Bolognese')).toBeInTheDocument()
  })

  it('WithFilterSummary renders filter summary text', () => {
    render(<WithFilterSummary />)
    expect(screen.getByText(/Expires this week/)).toBeInTheDocument()
  })

  it('OutOfStock renders empty badge', () => {
    render(<OutOfStock />)
    expect(screen.getByText(/empty/)).toBeInTheDocument()
  })

  it('LowStock renders low stock badge', () => {
    render(<LowStock />)
    expect(screen.getByText(/low stock/)).toBeInTheDocument()
  })

  it('Unsorted renders without icon', () => {
    render(<Unsorted />)
    expect(screen.getByText('Unsorted')).toBeInTheDocument()
  })
})
