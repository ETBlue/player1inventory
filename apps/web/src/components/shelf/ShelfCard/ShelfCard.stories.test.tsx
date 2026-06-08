import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ShelfCard.stories'

const {
  FilterShelf,
  SelectionShelf,
  EmptyShelf,
  WithOutOfStock,
  WithLowStock,
  WithBothStockStatuses,
  AllActiveItems,
  WithInactiveItems,
} = composeStories(stories)

describe('ShelfCard stories smoke tests', () => {
  it('FilterShelf renders shelf name', () => {
    render(<FilterShelf />)
    expect(screen.getByText('dairy')).toBeInTheDocument()
  })

  it('SelectionShelf renders shelf name', () => {
    render(<SelectionShelf />)
    expect(screen.getByText('favorites')).toBeInTheDocument()
  })

  it('EmptyShelf renders shelf name with 0 / 0 active', () => {
    render(<EmptyShelf />)
    expect(screen.getByText('snacks')).toBeInTheDocument()
    expect(screen.getByText('0 / 0 active')).toBeInTheDocument()
  })

  it('WithOutOfStock renders empty count', () => {
    render(<WithOutOfStock />)
    expect(screen.getByText('3 empty')).toBeInTheDocument()
  })

  it('WithLowStock renders low stock count', () => {
    render(<WithLowStock />)
    expect(screen.getByText('2 low stock')).toBeInTheDocument()
  })

  it('WithBothStockStatuses renders both counts', () => {
    render(<WithBothStockStatuses />)
    expect(screen.getByText('1 empty')).toBeInTheDocument()
    expect(screen.getByText('4 low stock')).toBeInTheDocument()
  })

  it('AllActiveItems renders "X / Z active" when all active', () => {
    render(<AllActiveItems />)
    expect(screen.getByText('5 / 5 active')).toBeInTheDocument()
  })

  it('WithInactiveItems renders "X / Z active" with total including inactive', () => {
    render(<WithInactiveItems />)
    expect(screen.getByText('5 / 7 active')).toBeInTheDocument()
  })

  it('FilterShelf renders progress label with pack unit', () => {
    render(<FilterShelf />)
    expect(screen.getByText('3/5')).toBeInTheDocument()
    expect(screen.getByText('pack')).toBeInTheDocument()
  })

  it('EmptyShelf renders 0/0 pack label', () => {
    render(<EmptyShelf />)
    expect(screen.getByText('0/0')).toBeInTheDocument()
    expect(screen.getByText('pack')).toBeInTheDocument()
  })
})
