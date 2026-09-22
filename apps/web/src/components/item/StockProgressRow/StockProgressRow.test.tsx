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
