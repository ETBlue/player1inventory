import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StockProgressRow } from './StockProgressRow'

// The component is presentational — every display value comes in as a prop, so
// one fixture covers both size cases and only `size` changes between them.
const baseProps = {
  quantityLabel: '3 / 4',
  unitLabel: 'pack',
  current: 3,
  target: 4,
  status: 'ok' as const,
  consumable: true,
  targetUnit: 'package' as const,
  packed: 3,
  unpacked: 0,
  onClear: () => {},
  onFill: () => {},
  clearDisabled: false,
  fillDisabled: false,
  clearLabel: 'Clear',
  fillLabel: 'Fill to Full',
}

const clearButton = () => screen.getByRole('button', { name: 'Clear' })
const fillButton = () => screen.getByRole('button', { name: 'Fill to Full' })

describe('StockProgressRow size', () => {
  // The two sizes pair with QuantityStepper's two sizes — see the prop's doc
  // comment. The cross-surface tests that pin the pairing live in
  // QuickUpdateDialog.test.tsx and ItemForm.test.tsx.
  it('defaults to size="sm" — icon-sm buttons (h-7 w-7)', () => {
    render(<StockProgressRow {...baseProps} />)

    expect(clearButton()).toHaveClass('h-7', 'w-7')
    expect(fillButton()).toHaveClass('h-7', 'w-7')
    expect(clearButton()).not.toHaveClass('h-8')
    expect(fillButton()).not.toHaveClass('h-8')
  })

  it('size="default" gives icon buttons (h-8 w-8)', () => {
    render(<StockProgressRow {...baseProps} size="default" />)

    expect(clearButton()).toHaveClass('h-8', 'w-8')
    expect(fillButton()).toHaveClass('h-8', 'w-8')
    expect(clearButton()).not.toHaveClass('h-7')
    expect(fillButton()).not.toHaveClass('h-7')
  })

  it('size="sm" passed explicitly matches the default', () => {
    render(<StockProgressRow {...baseProps} size="sm" />)

    expect(clearButton()).toHaveClass('h-7', 'w-7')
    expect(fillButton()).toHaveClass('h-7', 'w-7')
  })
})

describe('StockProgressRow refill threshold', () => {
  it('forwards refillThreshold to the progress bar', () => {
    // Given a threshold (2) that differs from current (3), target (4) and
    // unpacked (0), so the test cannot pass by reading the wrong number
    render(<StockProgressRow {...baseProps} refillThreshold={2} />)

    // Then the bar draws its refill tick at 2 packages
    expect(screen.getByTestId('refill-marker')).toHaveAttribute(
      'data-threshold',
      '2',
    )
    expect(screen.getByText('Refill when below 2')).toBeInTheDocument()
  })

  it('forwards a threshold of 0, so the bar draws the tick at the left end', () => {
    // A truthiness check (`refillThreshold ? ... : {}`) would drop 0 here
    render(<StockProgressRow {...baseProps} refillThreshold={0} />)

    expect(screen.getByTestId('refill-marker')).toHaveAttribute(
      'data-threshold',
      '0',
    )
    expect(screen.getByText('Refill when below 0')).toBeInTheDocument()
  })

  it('draws no tick when refillThreshold is not passed', () => {
    render(<StockProgressRow {...baseProps} />)

    expect(screen.queryByTestId('refill-marker')).not.toBeInTheDocument()
  })
})

describe('StockProgressRow bar choice', () => {
  // Only the count bar draws `count-square` elements, so they show which bar
  // is drawn (the same check as ItemCard.test.tsx).
  it('user sees one square per piece for a non-consumable item', () => {
    // Given cups, not consumable: 3 of 5, refill below 2
    render(
      <StockProgressRow
        {...baseProps}
        consumable={false}
        current={3}
        target={5}
        refillThreshold={2}
      />,
    )

    // Then 5 squares, 3 filled, with the refill marker at 2
    const squares = screen.getAllByTestId('count-square')
    expect(squares).toHaveLength(5)
    expect(squares.filter((s) => s.dataset.filled === 'true')).toHaveLength(3)
    expect(screen.getByTestId('refill-marker')).toHaveAttribute(
      'data-threshold',
      '2',
    )
    // And Clear and Fill to Full are still there
    expect(clearButton()).toBeEnabled()
    expect(fillButton()).toBeEnabled()
  })

  it('user sees the progress bar, not squares, for a consumable item', () => {
    render(<StockProgressRow {...baseProps} refillThreshold={2} />)

    expect(screen.queryAllByTestId('count-square')).toHaveLength(0)
    // The progress bar still draws its tick
    expect(screen.getByTestId('refill-marker')).toBeInTheDocument()
  })

  it('a non-consumable item tracked in a measurement unit shows whole pieces', () => {
    // Given 750 ml of a 1000 ml target, 250 ml per piece, refill below 500 ml
    render(
      <StockProgressRow
        {...baseProps}
        consumable={false}
        targetUnit="measurement"
        measurementUnit="ml"
        amountPerPackage={250}
        current={750}
        target={1000}
        packed={750}
        refillThreshold={500}
      />,
    )

    // Then 4 squares, 3 filled, and the marker at 2 pieces
    const squares = screen.getAllByTestId('count-square')
    expect(squares).toHaveLength(4)
    expect(squares.filter((s) => s.dataset.filled === 'true')).toHaveLength(3)
    expect(screen.getByTestId('refill-marker')).toHaveAttribute(
      'data-threshold',
      '2',
    )
  })
})
