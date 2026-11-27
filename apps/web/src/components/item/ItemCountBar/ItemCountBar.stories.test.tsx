import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemCountBar.stories'

const { InStock, LowStock, OutOfStock, MoreThanTwenty, AboveTarget } =
  composeStories(stories)

function filledCount() {
  return screen
    .getAllByTestId('count-square')
    .filter((s) => s.dataset.filled === 'true').length
}

describe('ItemCountBar stories smoke tests', () => {
  it('InStock renders 6 squares, 4 filled', () => {
    render(<InStock />)
    expect(screen.getAllByTestId('count-square')).toHaveLength(6)
    expect(filledCount()).toBe(4)
  })

  it('LowStock renders the refill marker', () => {
    render(<LowStock />)
    expect(screen.getByTestId('refill-marker')).toBeInTheDocument()
  })

  it('OutOfStock renders only outlined squares', () => {
    render(<OutOfStock />)
    expect(filledCount()).toBe(0)
  })

  it('MoreThanTwenty renders the +N label', () => {
    render(<MoreThanTwenty />)
    expect(screen.getByTestId('count-more')).toHaveTextContent('+12')
  })

  it('AboveTarget renders every piece filled', () => {
    render(<AboveTarget />)
    expect(filledCount()).toBe(5)
  })
})
