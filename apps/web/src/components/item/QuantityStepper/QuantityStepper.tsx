import { Minus, Plus } from 'lucide-react'
import type { ComponentPropsWithoutRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface QuantityStepperProps {
  // Current value — the base the +/− handlers step from, and what the
  // `−`-disabled-at-0 test reads.
  value: number
  // Called with the already-stepped, already-rounded, already-clamped value.
  onStep: (next: number) => void
  // Increment for both buttons.
  step: number
  // Optional normalizer applied to the stepped value before clamping at 0
  // (e.g. `(n) => roundToStep(n, step)`). Omit for a plain ±1 stepper.
  round?: (n: number) => number
  decreaseLabel: string
  increaseLabel: string
  // Disables both buttons; combined with the value-at-0 test for `−`.
  disabled?: boolean
  // Spread onto the Input LAST — the caller owns value/onChange/onBlur/
  // aria-label/id/step/className.
  inputProps?: ComponentPropsWithoutRef<typeof Input>
}

export function QuantityStepper({
  value,
  onStep,
  step,
  round,
  decreaseLabel,
  increaseLabel,
  disabled,
  inputProps,
}: QuantityStepperProps) {
  function bump(delta: number) {
    const stepped = value + delta
    const normalized = round ? round(stepped) : stepped
    onStep(Math.max(0, normalized))
  }

  // `type="button"` on both buttons is required, not decorative. QuickUpdateDialog
  // renders this component outside any `<form>`, so a bare `<button>` there is
  // harmless — but `ItemForm` renders it inside its `<form onSubmit>`, where the
  // HTML default type is "submit". A submit-type button fires the form's native
  // submit event on click regardless of which button was pressed, which called
  // ItemForm's `handleSubmit` (and therefore its save mutation) one click after
  // the field first went dirty — the Stock tab saved and navigated away the
  // moment a stepper was clicked twice, discovered via the E2E round-trip test
  // in item-stock-input.spec.ts.
  return (
    <div className="flex items-center gap-0">
      <Button
        type="button"
        variant="neutral-outline"
        size="icon-sm"
        className="flex-shrink-0 -mr-[1px] rounded-tr-none rounded-br-none"
        aria-label={decreaseLabel}
        disabled={value === 0 || disabled}
        onClick={() => bump(-step)}
        icon={<Minus className="h-4 w-4" />}
      />
      <Input
        type="number"
        min="0"
        className="h-7 rounded-none text-right"
        disabled={disabled}
        {...inputProps}
      />
      <Button
        type="button"
        variant="neutral-outline"
        size="icon-sm"
        className="flex-shrink-0 -ml-[1px] rounded-tl-none rounded-bl-none"
        aria-label={increaseLabel}
        disabled={disabled}
        onClick={() => bump(step)}
        icon={<Plus className="h-4 w-4" />}
      />
    </div>
  )
}
