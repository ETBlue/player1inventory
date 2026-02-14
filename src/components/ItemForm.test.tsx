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

  it('sets packageUnit to undefined when cleared', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          name: 'Test Item',
          packageUnit: 'bottle',
          measurementUnit: 'L',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    // Clear the package unit field
    const packageUnitInput = screen.getByLabelText(/package unit/i)
    await user.clear(packageUnitInput)

    // Submit the form
    const submitButton = screen.getByRole('button', { name: /save/i })
    await user.click(submitButton)

    // Verify packageUnit is undefined in submitted data
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        packageUnit: undefined,
      }),
    )
  })

  it('sets measurementUnit to undefined when cleared', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          name: 'Test Item',
          packageUnit: 'bottle',
          measurementUnit: 'L',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    // Clear the measurement unit field
    const measurementUnitInput = screen.getByLabelText(/measurement unit/i)
    await user.clear(measurementUnitInput)

    // Submit the form
    const submitButton = screen.getByRole('button', { name: /save/i })
    await user.click(submitButton)

    // Verify measurementUnit is undefined in submitted data
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        measurementUnit: undefined,
      }),
    )
  })

  it('sets amountPerPackage to undefined when cleared', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          name: 'Test Item',
          packageUnit: 'bottle',
          measurementUnit: 'L',
          amountPerPackage: 1,
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    // Clear the amount per package field
    const amountInput = screen.getByLabelText(/amount per package/i)
    await user.clear(amountInput)

    // Submit the form
    const submitButton = screen.getByRole('button', { name: /save/i })
    await user.click(submitButton)

    // Verify amountPerPackage is undefined in submitted data
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        amountPerPackage: undefined,
      }),
    )
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

describe('ItemForm - Field Visibility', () => {
  it('shows amount per package field when measurementUnit is set with packageUnit', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          packageUnit: 'bottle',
          measurementUnit: 'L',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByLabelText(/amount per package/i)).toBeInTheDocument()
  })

  it('shows amount per package field when measurementUnit is set without packageUnit', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          measurementUnit: 'g',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByLabelText(/amount per package/i)).toBeInTheDocument()
  })

  it('does not show amount per package field when measurementUnit is not set', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          packageUnit: 'pack',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    expect(
      screen.queryByLabelText(/amount per package/i),
    ).not.toBeInTheDocument()
  })

  it('shows track target in radio when measurementUnit is set without packageUnit', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          measurementUnit: 'g',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByText(/track target in/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/packages/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/measurement \(g\)/i)).toBeInTheDocument()
  })

  it('shows package label without unit when packageUnit is not defined', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          measurementUnit: 'g',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    // Label should be just "Packages" without the unit
    const packageLabel = screen.getByLabelText(/^packages$/i)
    expect(packageLabel).toBeInTheDocument()
  })

  it('shows package label with unit when packageUnit is defined', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          packageUnit: 'bottle',
          measurementUnit: 'L',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    // Label should include the unit
    const packageLabel = screen.getByLabelText(/packages \(bottle\)/i)
    expect(packageLabel).toBeInTheDocument()
  })

  it('shows helper text with package fallback when packageUnit is not defined', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          measurementUnit: 'g',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    // Helper text should say "in each package" as fallback
    expect(screen.getByText(/how much g in each package/i)).toBeInTheDocument()
  })

  it('shows helper text with packageUnit when defined', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          packageUnit: 'bottle',
          measurementUnit: 'L',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    // Helper text should include the specific packageUnit
    expect(screen.getByText(/how much L in each bottle/i)).toBeInTheDocument()
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

  it('converts values in measurement-only mode (no packageUnit)', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          measurementUnit: 'g',
          amountPerPackage: 100,
          targetUnit: 'package',
          targetQuantity: 3,
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
    ).toBe('3')
    expect(
      (screen.getByLabelText(/refill when below/i) as HTMLInputElement).value,
    ).toBe('1')
    expect(
      (screen.getByLabelText(/amount per consume/i) as HTMLInputElement).value,
    ).toBe('1')

    // Switch to measurement tracking
    const measurementRadio = screen.getByLabelText(/measurement \(g\)/i)
    await user.click(measurementRadio)

    // Values should be converted even without packageUnit
    expect(
      (screen.getByLabelText(/target quantity/i) as HTMLInputElement).value,
    ).toBe('300')
    expect(
      (screen.getByLabelText(/refill when below/i) as HTMLInputElement).value,
    ).toBe('100')
    expect(
      (screen.getByLabelText(/amount per consume/i) as HTMLInputElement).value,
    ).toBe('100')
  })
})

describe('ItemForm - Expiration Threshold', () => {
  it('includes expirationThreshold in submitted data when set', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          name: 'Test Item',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    // Set expiration threshold
    const thresholdInput = screen.getByLabelText(
      /expiration warning threshold/i,
    )
    await user.type(thresholdInput, '3')

    // Submit the form
    const submitButton = screen.getByRole('button', { name: /save/i })
    await user.click(submitButton)

    // Verify expirationThreshold is included
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        expirationThreshold: 3,
      }),
    )
  })

  it('sets expirationThreshold to undefined when empty', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          name: 'Test Item',
          expirationThreshold: 5,
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    // Clear the threshold field
    const thresholdInput = screen.getByLabelText(
      /expiration warning threshold/i,
    )
    await user.clear(thresholdInput)

    // Submit the form
    const submitButton = screen.getByRole('button', { name: /save/i })
    await user.click(submitButton)

    // Verify expirationThreshold is undefined
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        expirationThreshold: undefined,
      }),
    )
  })
})
