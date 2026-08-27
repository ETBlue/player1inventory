import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { QuantityStepper } from './QuantityStepper'

// The component owns no state — value/onStep are controlled from outside, so
// every interactive test wraps it in a tiny stateful harness that mirrors how
// QuickUpdateDialog and (later) ItemForm actually drive it.
function Harness({
  initial,
  step,
  round,
  disabled,
}: {
  initial: number
  step: number
  round?: (n: number) => number
  disabled?: boolean
}) {
  const [value, setValue] = useState(initial)
  return (
    <QuantityStepper
      value={value}
      onStep={setValue}
      step={step}
      {...(round ? { round } : {})}
      decreaseLabel="Decrease quantity"
      increaseLabel="Increase quantity"
      {...(disabled !== undefined ? { disabled } : {})}
      inputProps={{ 'aria-label': 'Quantity', value, readOnly: true }}
    />
  )
}

const input = () => screen.getByRole('spinbutton', { name: 'Quantity' })
const decreaseButton = () =>
  screen.getByRole('button', { name: 'Decrease quantity' })
const increaseButton = () =>
  screen.getByRole('button', { name: 'Increase quantity' })

describe('QuantityStepper', () => {
  it('user can step the value up by the given step', async () => {
    // Given a stepper at 2 with a step of 1
    const user = userEvent.setup()
    render(<Harness initial={2} step={1} />)

    // When the user clicks +
    await user.click(increaseButton())

    // Then the value rises by the step
    expect(input()).toHaveValue(3)
  })

  it('user can step the value down by the given step', async () => {
    // Given a stepper at 2 with a step of 1
    const user = userEvent.setup()
    render(<Harness initial={2} step={1} />)

    // When the user clicks −
    await user.click(decreaseButton())

    // Then the value falls by the step
    expect(input()).toHaveValue(1)
  })

  it('user sees the round normalizer applied to the stepped value', async () => {
    // Given a stepper whose step introduces floating-point drift
    // (0.1 + 0.2 === 0.30000000000000004 in JS) and a round function that
    // corrects it to one decimal place
    const user = userEvent.setup()
    render(
      <Harness
        initial={0.1}
        step={0.2}
        round={(n) => Math.round(n * 10) / 10}
      />,
    )

    // When the user clicks +
    await user.click(increaseButton())

    // Then the displayed value is the rounded one, not the raw float
    expect(input()).toHaveValue(0.3)
  })

  it('user is clamped at zero when a step would overshoot below it', async () => {
    // Given a stepper at 0.3 with a step of 1 — one decrease would go negative
    const user = userEvent.setup()
    render(<Harness initial={0.3} step={1} />)

    // When the user clicks −
    await user.click(decreaseButton())

    // Then the value clamps at 0 rather than going negative
    expect(input()).toHaveValue(0)
  })

  it('user sees the − button disabled when the value is already 0', () => {
    // Given a stepper already at 0
    render(<Harness initial={0} step={1} />)

    // Then − is disabled but + is not
    expect(decreaseButton()).toBeDisabled()
    expect(increaseButton()).not.toBeDisabled()
  })

  it('user sees both buttons disabled when the disabled prop is set', () => {
    // Given a stepper at a nonzero value, explicitly disabled
    render(<Harness initial={5} step={1} disabled={true} />)

    // Then both + and − are disabled, even though the value is not 0
    expect(decreaseButton()).toBeDisabled()
    expect(increaseButton()).toBeDisabled()
  })

  it('user sees inputProps win over the component defaults', () => {
    // Given a caller that overrides className via inputProps
    render(
      <QuantityStepper
        value={4}
        onStep={() => {}}
        step={1}
        decreaseLabel="Decrease quantity"
        increaseLabel="Increase quantity"
        inputProps={{
          'aria-label': 'Quantity',
          value: 4,
          readOnly: true,
          className: 'custom-input-class',
        }}
      />,
    )

    // Then the caller's className wins over the default
    // ("h-7 rounded-none text-right"), while the component's own fixed
    // attributes (type, min) are still present
    const el = input()
    expect(el).toHaveClass('custom-input-class')
    expect(el).not.toHaveClass('rounded-none')
    expect(el).toHaveAttribute('type', 'number')
    expect(el).toHaveAttribute('min', '0')
  })

  // Important 2 of the 2026-08-27 review: `size` pairs the buttons' Button
  // `size` with the input's default height, so a caller with a taller input
  // (ItemForm) gets a flush, equal-height joined group instead of a 32px
  // input flanked by 28px buttons. Asserted via class names, the same way
  // the `inputProps` test above pins the input's default className.
  it('defaults to size="sm" — icon-sm buttons (h-7 w-7) over an h-7 input', () => {
    render(<Harness initial={2} step={1} />)

    expect(decreaseButton()).toHaveClass('h-7', 'w-7')
    expect(increaseButton()).toHaveClass('h-7', 'w-7')
    expect(input()).toHaveClass('h-7')
    expect(input()).not.toHaveClass('h-8')
  })

  it('size="default" gives icon buttons (h-8 w-8) over an h-8 input', () => {
    render(
      <QuantityStepper
        value={2}
        onStep={() => {}}
        step={1}
        size="default"
        decreaseLabel="Decrease quantity"
        increaseLabel="Increase quantity"
        inputProps={{ 'aria-label': 'Quantity', value: 2, readOnly: true }}
      />,
    )

    expect(decreaseButton()).toHaveClass('h-8', 'w-8')
    expect(increaseButton()).toHaveClass('h-8', 'w-8')
    expect(input()).toHaveClass('h-8')
    expect(input()).not.toHaveClass('h-7')
  })

  // Regression guard for the "stepper submits the enclosing form" bug found
  // in E2E (Task 4 / Minor 7 of the 2026-08-27 review): both buttons must be
  // type="button", or an untyped <button> inside a real <form> defaults to
  // type="submit" and a stepper click fires the form's native submit event.
  it('both stepper buttons are type="button"', () => {
    render(<Harness initial={2} step={1} />)

    expect(decreaseButton()).toHaveAttribute('type', 'button')
    expect(increaseButton()).toHaveAttribute('type', 'button')
  })

  it('user clicking a stepper button inside a form does not submit it', async () => {
    // Given a stepper rendered inside a real <form>, the way ItemForm does
    const user = userEvent.setup()
    const handleSubmit = vi.fn((e: FormEvent) => e.preventDefault())
    render(
      <form onSubmit={handleSubmit}>
        <Harness initial={2} step={1} />
      </form>,
    )

    // When the user clicks + and then −
    await user.click(increaseButton())
    await user.click(decreaseButton())

    // Then the form's submit handler is never called
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('user sees the decrease/increase aria-labels the caller passed', () => {
    // Given a stepper with caller-specified labels
    render(
      <QuantityStepper
        value={2}
        onStep={() => {}}
        step={1}
        decreaseLabel="Decrease refill threshold"
        increaseLabel="Increase refill threshold"
        inputProps={{ 'aria-label': 'Refill', value: 2, readOnly: true }}
      />,
    )

    // Then the buttons carry exactly those labels
    expect(
      screen.getByRole('button', { name: 'Decrease refill threshold' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Increase refill threshold' }),
    ).toBeInTheDocument()
  })
})
