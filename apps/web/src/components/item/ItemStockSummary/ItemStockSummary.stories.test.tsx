import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemStockSummary.stories'

const {
  Consumable,
  MeasurementWithOpenPack,
  NonConsumable,
  NameOnly,
  NameAsSpan,
} = composeStories(stories)

describe('ItemStockSummary stories smoke tests', () => {
  it('Consumable shows the name as a heading, the quantity and the bar', () => {
    const { container } = render(<Consumable />)
    expect(
      screen.getByRole('heading', { level: 3, name: 'Yogurt (plain)' }),
    ).toBeInTheDocument()
    expect(screen.getByText('1 / 2 gallon')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-segment]')).toHaveLength(2)
  })

  it('MeasurementWithOpenPack shows the open pack in the text', () => {
    render(<MeasurementWithOpenPack />)
    expect(screen.getByText('1 (+0.7) / 2 L')).toBeInTheDocument()
  })

  it('NonConsumable shows one square per piece', () => {
    render(<NonConsumable />)
    expect(screen.getByText('2 / 6 cup')).toBeInTheDocument()
    expect(screen.getAllByTestId('count-square')).toHaveLength(6)
  })

  it('NameOnly shows no quantity and no bar', () => {
    const { container } = render(<NameOnly />)
    expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    expect(screen.queryByText(/gallon/)).toBeNull()
    expect(container.querySelectorAll('[data-segment]')).toHaveLength(0)
  })

  it('NameAsSpan shows the name with no heading', () => {
    render(<NameAsSpan />)
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.getByText('Yogurt (plain)').tagName).toBe('SPAN')
  })
})
