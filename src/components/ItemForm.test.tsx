import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ItemForm } from './ItemForm'

// Mock the hooks
vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({ data: [] }),
  useTagTypes: () => ({ data: [] }),
}))

describe('ItemForm - Packed Quantity', () => {
  it('renders packed quantity field', () => {
    const onSubmit = vi.fn()
    render(<ItemForm submitLabel="Save" onSubmit={onSubmit} />)

    expect(screen.getByLabelText(/packed quantity/i)).toBeInTheDocument()
  })

  it('initializes packed quantity from initialData', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{ packedQuantity: 5 }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText(/packed quantity/i) as HTMLInputElement
    expect(input.value).toBe('5')
  })
})

describe('ItemForm - Unpacked Quantity', () => {
  it('hides unpacked quantity field for package-only items', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{ targetUnit: 'package' }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    expect(
      screen.queryByLabelText(/unpacked quantity/i),
    ).not.toBeInTheDocument()
  })

  it('shows unpacked quantity field for dual-unit items', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          packageUnit: 'bottle',
          measurementUnit: 'L',
          targetUnit: 'measurement',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByLabelText(/unpacked quantity/i)).toBeInTheDocument()
  })

  it('initializes unpacked quantity from initialData', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          packageUnit: 'bottle',
          measurementUnit: 'L',
          targetUnit: 'measurement',
          unpackedQuantity: 0.5,
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText(
      /unpacked quantity/i,
    ) as HTMLInputElement
    expect(input.value).toBe('0.5')
  })
})
