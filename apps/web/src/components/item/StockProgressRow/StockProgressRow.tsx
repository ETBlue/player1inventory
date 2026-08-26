import { ArrowLeftToLine, ArrowRightToLine } from 'lucide-react'
import { ItemProgressBar } from '@/components/item/ItemProgressBar'
import { UnitBadge } from '@/components/shared/UnitBadge'
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
}: StockProgressRowProps) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
      <Button
        variant="neutral-outline"
        size="icon-sm"
        aria-label={clearLabel}
        disabled={clearDisabled}
        onClick={onClear}
        icon={<ArrowLeftToLine />}
      />
      <div className="space-y-1">
        <div className="flex gap-1 items-baseline text-xs text-right text-foreground-muted">
          <span className="flex-1" />
          <span>{quantityLabel}</span>
          <UnitBadge unit={unitLabel} />
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
        variant="neutral-outline"
        size="icon-sm"
        aria-label={fillLabel}
        disabled={fillDisabled}
        onClick={onFill}
        icon={<ArrowRightToLine />}
      />
    </div>
  )
}
