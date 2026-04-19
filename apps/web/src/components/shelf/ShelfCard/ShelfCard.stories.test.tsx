import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ShelfCard.stories'

const { FilterShelf, SelectionShelf, EmptyShelf } = composeStories(stories)

describe('ShelfCard stories smoke tests', () => {
  it('FilterShelf renders shelf name', () => {
    render(<FilterShelf />)
    expect(screen.getByText('dairy')).toBeInTheDocument()
  })

  it('SelectionShelf renders shelf name', () => {
    render(<SelectionShelf />)
    expect(screen.getByText('favorites')).toBeInTheDocument()
  })

  it('EmptyShelf renders shelf name with 0 items', () => {
    render(<EmptyShelf />)
    expect(screen.getByText('snacks')).toBeInTheDocument()
    expect(screen.getByText('0 items')).toBeInTheDocument()
  })
})
