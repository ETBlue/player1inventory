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

    expect(screen.getByLabelText(/^packed quantity$/i)).toBeInTheDocument()
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

    const input = screen.getByLabelText(
      /^packed quantity$/i,
    ) as HTMLInputElement
    expect(input.value).toBe('5')
  })
})

describe('ItemForm - Unpacked Quantity', () => {
  it('renders unpacked quantity field', () => {
    const onSubmit = vi.fn()
    render(<ItemForm submitLabel="Save" onSubmit={onSubmit} />)

    expect(screen.getByLabelText(/^unpacked quantity$/i)).toBeInTheDocument()
  })

  it('uses consumeAmount as step for unpacked quantity', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          consumeAmount: 0.25,
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText(
      /^unpacked quantity$/i,
    ) as HTMLInputElement
    expect(input.step).toBe('0.25')
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

    const input = screen.getByLabelText(
      /^packed quantity$/i,
    ) as HTMLInputElement
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

describe('ItemForm - Step Attribute', () => {
  it('uses step=1 for target quantity when tracking in packages', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          packageUnit: 'pack',
          targetUnit: 'package',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText(/target quantity/i) as HTMLInputElement
    expect(input.step).toBe('1')
  })

  it('uses step=1 for refill threshold when tracking in packages', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          packageUnit: 'pack',
          targetUnit: 'package',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText(
      /refill when below/i,
    ) as HTMLInputElement
    expect(input.step).toBe('1')
  })

  it('uses step=consumeAmount for target quantity when tracking in measurement', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          packageUnit: 'bottle',
          measurementUnit: 'L',
          targetUnit: 'measurement',
          consumeAmount: 0.25,
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText(/target quantity/i) as HTMLInputElement
    expect(input.step).toBe('0.25')
  })

  it('uses step=consumeAmount for refill threshold when tracking in measurement', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          packageUnit: 'bottle',
          measurementUnit: 'L',
          targetUnit: 'measurement',
          consumeAmount: 0.5,
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText(
      /refill when below/i,
    ) as HTMLInputElement
    expect(input.step).toBe('0.5')
  })

  it('defaults to step=1 for target quantity when consumeAmount is not defined', () => {
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

    const input = screen.getByLabelText(/target quantity/i) as HTMLInputElement
    expect(input.step).toBe('1')
  })

  it('defaults to step=1 for refill threshold when consumeAmount is not defined', () => {
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

    const input = screen.getByLabelText(
      /refill when below/i,
    ) as HTMLInputElement
    expect(input.step).toBe('1')
  })
})

describe('ItemForm - Tracking Unit Conversion', () => {
  it('converts values from package to measurement when switching targetUnit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const { rerender } = render(
      <ItemForm
        initialData={{
          packageUnit: 'bottle',
          measurementUnit: 'ml',
          amountPerPackage: 500,
          targetUnit: 'package',
          targetQuantity: 2,
          refillThreshold: 1,
          consumeAmount: 1,
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    // Verify initial values
    expect(
      (screen.getByLabelText(/target quantity/i) as HTMLInputElement).value,
    ).toBe('2')
    expect(
      (screen.getByLabelText(/refill when below/i) as HTMLInputElement).value,
    ).toBe('1')
    expect(
      (screen.getByLabelText(/amount per consume/i) as HTMLInputElement).value,
    ).toBe('1')

    // Switch to measurement tracking
    const measurementRadio = screen.getByLabelText(/measurement \(ml\)/i)
    await user.click(measurementRadio)

    // Values should be converted (multiplied by amountPerPackage)
    expect(
      (screen.getByLabelText(/target quantity/i) as HTMLInputElement).value,
    ).toBe('1000')
    expect(
      (screen.getByLabelText(/refill when below/i) as HTMLInputElement).value,
    ).toBe('500')
    expect(
      (screen.getByLabelText(/amount per consume/i) as HTMLInputElement).value,
    ).toBe('500')
  })

  it('converts values from measurement to package when switching targetUnit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          packageUnit: 'bottle',
          measurementUnit: 'ml',
          amountPerPackage: 500,
          targetUnit: 'measurement',
          targetQuantity: 1000,
          refillThreshold: 500,
          consumeAmount: 250,
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    // Verify initial values
    expect(
      (screen.getByLabelText(/target quantity/i) as HTMLInputElement).value,
    ).toBe('1000')
    expect(
      (screen.getByLabelText(/refill when below/i) as HTMLInputElement).value,
    ).toBe('500')
    expect(
      (screen.getByLabelText(/amount per consume/i) as HTMLInputElement).value,
    ).toBe('250')

    // Switch to package tracking
    const packageRadio = screen.getByLabelText(/packages \(bottle\)/i)
    await user.click(packageRadio)

    // Values should be converted (divided by amountPerPackage)
    expect(
      (screen.getByLabelText(/target quantity/i) as HTMLInputElement).value,
    ).toBe('2')
    expect(
      (screen.getByLabelText(/refill when below/i) as HTMLInputElement).value,
    ).toBe('1')
    expect(
      (screen.getByLabelText(/amount per consume/i) as HTMLInputElement).value,
    ).toBe('0.5')
  })

  it('does not convert when amountPerPackage is not set', async () => {
    const _user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          packageUnit: 'pack',
          targetUnit: 'package',
          targetQuantity: 2,
          refillThreshold: 1,
          consumeAmount: 1,
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    // Note: No dual-unit setup, so no conversion should happen
    const targetInput = screen.getByLabelText(
      /target quantity/i,
    ) as HTMLInputElement
    expect(targetInput.value).toBe('2')

    // Even if we could switch modes, values should stay the same
    // (In reality, the radio buttons won't appear without dual-unit setup)
  })
})
