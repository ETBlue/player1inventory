import { ArrowLeftToLine, ArrowRightToLine } from 'lucide-react'
import { ItemProgressBar } from '@/components/item/ItemProgressBar'
import { Button } from '@/components/ui/button'

export interface StockProgressRowProps {
  // Display values — computed by the caller (localTotal, status, the "x / y"
  // label, etc.); this component is presentational only.
  quantityLabel: string
  unitLabel: string
  current: number
  target: number
  status: 'ok' | 'warning' | 'error' | 'inactive'
  targetUnit: 'package' | 'measurement'
  packed: number
  unpacked: number
  measurementUnit?: string
  amountPerPackage?: number
  onClear: () => void
  onFill: () => void
  clearDisabled: boolean
  fillDisabled: boolean
  clearLabel: string
  fillLabel: string
  // Pairs the Clear/Fill buttons' Button `size` with the `size` the caller
  // passes to its QuantityStepper, so the arrow buttons and the stepper's
  // `+`/`−` buttons stacked directly above and below them are the same square.
  // Take the same values and the same mapping as QuantityStepper: 'sm'
  // (default) is QuickUpdateDialog's shape — icon-sm buttons (h-7), which is
  // also what this row used to hardcode, so the dialog is unchanged by adding
  // this prop. 'default' is ItemForm's Stock tab — icon buttons (h-8), which
  // its steppers already use; before this prop the Stock tab's arrows were 4px
  // shorter than its own `+`/`−` buttons.
  size?: 'sm' | 'default'
}

export function StockProgressRow({
  quantityLabel,
  unitLabel,
  current,
  target,
  status,
  targetUnit,
  packed,
  unpacked,
  measurementUnit,
  amountPerPackage,
  onClear,
  onFill,
  clearDisabled,
  fillDisabled,
  clearLabel,
  fillLabel,
  size = 'sm',
}: StockProgressRowProps) {
  // Same mapping as QuantityStepper — keep the two in step, and do not add a
  // third size here without adding it there.
  const buttonSize = size === 'default' ? 'icon' : 'icon-sm'

  // `type="button"` matters here for the same reason it does on QuantityStepper:
  // ItemForm renders this row inside its `<form>`, where an untyped `<button>`
  // defaults to "submit" and fires the form's native submit event on click.
  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
      <Button
        type="button"
        variant="neutral-outline"
        size={buttonSize}
        aria-label={clearLabel}
        disabled={clearDisabled}
        onClick={onClear}
        icon={<ArrowLeftToLine />}
      />
      <div className="space-y-1">
        <div className="flex gap-1 items-baseline text-xs text-right text-foreground-muted">
          <span className="flex-1" />
          {/* Unit as a trailing bare word in the row's own muted text, not a
              separate `opacity-75` pill — the pill failed WCAG AA contrast
              (docs/global/bugs/2026-08-29-bug-unit-badge-contrast.md). */}
          <span>{`${quantityLabel} ${unitLabel}`}</span>
        </div>
        <ItemProgressBar
          current={current}
          target={target}
          status={status}
          targetUnit={targetUnit}
          packed={packed}
          unpacked={unpacked}
          {...(measurementUnit ? { measurementUnit } : {})}
          {...(amountPerPackage ? { amountPerPackage } : {})}
        />
      </div>
      <Button
        type="button"
        variant="neutral-outline"
        size={buttonSize}
        aria-label={fillLabel}
        disabled={fillDisabled}
        onClick={onFill}
        icon={<ArrowRightToLine />}
      />
    </div>
  )
}
