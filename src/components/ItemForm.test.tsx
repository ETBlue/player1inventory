import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('ItemForm - Validation', () => {
  it('prevents negative packed quantity', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{ name: 'Test Item' }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText(/packed quantity/i) as HTMLInputElement
    // Simulate user typing negative value (bypassing HTML5 validation)
    fireEvent.change(input, { target: { value: '-5' } })

    const submitButton = screen.getByRole('button', { name: /save/i })
    await user.click(submitButton)

    // Form should not submit with negative value
    expect(onSubmit).not.toHaveBeenCalled()

    // Error message should display
    await waitFor(() => {
      expect(screen.getByText('Must be 0 or greater')).toBeInTheDocument()
    })
  })

  it('prevents negative unpacked quantity', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          name: 'Test Item',
          packageUnit: 'bottle',
          measurementUnit: 'L',
          targetUnit: 'measurement',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText(
      /unpacked quantity/i,
    ) as HTMLInputElement
    // Simulate user typing negative value (bypassing HTML5 validation)
    fireEvent.change(input, { target: { value: '-0.5' } })

    const submitButton = screen.getByRole('button', { name: /save/i })
    await user.click(submitButton)

    // Form should not submit with negative value
    expect(onSubmit).not.toHaveBeenCalled()

    // Error message should display
    await waitFor(() => {
      expect(screen.getByText('Must be 0 or greater')).toBeInTheDocument()
    })
  })

  it('shows warning when unpacked quantity exceeds amountPerPackage', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          name: 'Test Item',
          packageUnit: 'bottle',
          measurementUnit: 'L',
          amountPerPackage: 1,
          targetUnit: 'measurement',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText(/unpacked quantity/i)
    await user.clear(input)
    await user.type(input, '1.5')

    // Trigger validation by attempting to submit
    const submitButton = screen.getByRole('button', { name: /save/i })
    await user.click(submitButton)

    expect(screen.getByText(/should be less than 1 L/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
