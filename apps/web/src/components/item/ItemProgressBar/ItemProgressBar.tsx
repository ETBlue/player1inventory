import { useTranslation } from 'react-i18next'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

// Maximum target quantity for segmented mode (use continuous mode above this)
const SEGMENTED_MODE_MAX_TARGET = 30

interface ProgressBarProps {
  current: number
  target: number
  status?: 'ok' | 'warning' | 'error' | 'inactive'
  targetUnit?: 'package' | 'measurement'
  packed?: number
  unpacked?: number
  measurementUnit?: string
  amountPerPackage?: number
  /** Refill threshold, in the same unit as `target`. Draws a tick on the bar. */
  refillThreshold?: number
}

// Gap between segments in the segmented bar. Must match `gap-0.5` below.
const SEGMENT_GAP_PX = 2

/**
 * Round away floating-point noise from a division, to 6 decimal places.
 * In JavaScript `0.3 / 0.1` is `2.9999999999999996` and `0.6 / 0.1` is
 * `5.999999999999999`. Without rounding, a whole package count looks
 * fractional: the bar draws one segment too few, and the refill tick misses
 * the gap between segments.
 */
function roundPackages(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

/**
 * CSS `left` value for the refill tick. The tick is centred on this point.
 *
 * `threshold` and `target` must use the same unit as the bar:
 * - segmented: packages, and `target` is the number of segments drawn
 * - continuous: any unit (only the ratio matters)
 *
 * Segmented layout: `n` segments share the width W with `n - 1` gaps of 2px,
 * so one segment is `s = (W - (n - 1) * 2px) / n` wide and segment `k`
 * starts at `k * (s + 2px)`.
 * - A whole threshold `x` (0 < x < n) goes to the centre of the gap after
 *   segment `x`: `x * s + (x - 1) * 2px + 1px`, which simplifies to
 *   `x * (W + 2px) / n - 1px`.
 * - A fractional threshold goes inside segment `k = floor(x)`:
 *   `k * (s + 2px) + (x - k) * s`, which simplifies to `x * s + k * 2px`.
 * - A threshold at or above the target goes to the right edge.
 */
export function getRefillMarkerLeft({
  threshold,
  target,
  segmented,
}: {
  threshold: number
  target: number
  segmented: boolean
}): string {
  const x = Math.min(threshold, target)
  if (x >= target) return '100%'
  if (!segmented) return `${(x / target) * 100}%`
  const k = Math.floor(x)
  if (x === k) {
    return `calc(${x} * (100% + ${SEGMENT_GAP_PX}px) / ${target} - ${SEGMENT_GAP_PX / 2}px)`
  }
  return `calc(${x} * (100% - ${(target - 1) * SEGMENT_GAP_PX}px) / ${target} + ${k * SEGMENT_GAP_PX}px)`
}

function RefillMarker({
  threshold,
  target,
  segmented,
}: {
  threshold: number
  target: number
  segmented: boolean
}) {
  const x = Math.min(threshold, target)
  const atEnd = x >= target
  return (
    <div
      data-testid="refill-marker"
      data-threshold={x}
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute -top-0.5 h-3 w-2 rounded-full bg-foreground-muted border border-accessory-default',
        // At the right end, keep the tick inside the bar instead of
        // centring it on the edge.
        atEnd ? '-translate-x-full' : '-translate-x-1/2',
      )}
      style={{ left: getRefillMarkerLeft({ threshold, target, segmented }) }}
    />
  )
}

function SegmentedProgressBar({
  current,
  target,
  status,
  packed = 0,
  unpacked = 0,
}: ProgressBarProps) {
  const segments = Array.from({ length: target }, (_, i) => {
    const segmentStart = i
    const segmentEnd = i + 1

    // Always show packed and unpacked separately when unpacked > 0
    const showSeparate = unpacked > 0
    let packedFill = 0
    let unpackedFill = 0

    if (showSeparate) {
      // Calculate how much of this segment is filled by packed
      if (packed >= segmentEnd) {
        packedFill = 100
      } else if (packed > segmentStart) {
        packedFill = (packed - segmentStart) * 100
      }

      // Calculate how much is filled by unpacked (starts after packed)
      const unpackedStart = packed
      const unpackedEnd = packed + unpacked
      if (unpackedEnd >= segmentEnd && unpackedStart < segmentEnd) {
        if (unpackedStart >= segmentEnd) {
          unpackedFill = 0
        } else if (unpackedStart > segmentStart) {
          unpackedFill = (segmentEnd - unpackedStart) * 100
        } else {
          unpackedFill = (segmentEnd - segmentStart) * 100 - packedFill
        }
      } else if (unpackedEnd > segmentStart && unpackedStart < segmentEnd) {
        if (unpackedStart > segmentStart) {
          unpackedFill = (unpackedEnd - unpackedStart) * 100
        } else {
          unpackedFill = (unpackedEnd - segmentStart) * 100 - packedFill
        }
      }
    }

    let fillPercentage = 0
    if (!showSeparate) {
      // Use current when not showing separate packed/unpacked
      if (current >= segmentEnd) {
        fillPercentage = 100
      } else if (current > segmentStart) {
        fillPercentage = (current - segmentStart) * 100
      }
    }

    const fillColor =
      status === 'ok'
        ? 'bg-status-ok-background-muted'
        : status === 'warning'
          ? 'bg-status-warning-background-muted'
          : status === 'error'
            ? 'bg-status-error-background-muted'
            : status === 'inactive'
              ? 'bg-status-inactive-background-muted'
              : 'bg-accessory-emphasized'

    const packedColor =
      status === 'ok'
        ? 'bg-status-ok-background-muted'
        : status === 'warning'
          ? 'bg-status-warning-background-muted'
          : status === 'error'
            ? 'bg-status-error-background-muted'
            : status === 'inactive'
              ? 'bg-status-inactive-background-muted'
              : 'bg-accessory-emphasized'

    const unpackedColor =
      status === 'ok'
        ? 'bg-status-ok-accessory-muted'
        : status === 'warning'
          ? 'bg-status-warning-accessory-muted'
          : status === 'error'
            ? 'bg-status-error-accessory-muted'
            : status === 'inactive'
              ? 'bg-status-inactive-accessory-muted'
              : 'bg-accessory-muted'

    return (
      <div
        // biome-ignore lint/suspicious/noArrayIndexKey: segments are static presentational elements
        key={i}
        data-segment={i}
        data-fill={fillPercentage}
        data-packed={packedFill}
        data-unpacked={unpackedFill}
        className={cn(
          'h-2 flex-1 rounded-xs relative overflow-hidden',
          'border border-accessory-default',
        )}
      >
        {showSeparate ? (
          <>
            {packedFill > 0 && (
              <div
                className={cn('h-full absolute left-0', packedColor)}
                style={{ width: `${packedFill}%` }}
              />
            )}
            {unpackedFill > 0 && (
              <div
                className={cn('h-full absolute', unpackedColor)}
                style={{
                  left: `${packedFill}%`,
                  width: `${unpackedFill}%`,
                }}
              />
            )}
          </>
        ) : (
          fillPercentage > 0 && (
            <div
              className={cn('h-full', fillColor)}
              style={{ width: `${fillPercentage}%` }}
            />
          )
        )}
      </div>
    )
  })

  return <div className="flex gap-0.5">{segments}</div>
}

function ContinuousProgressBar({
  current,
  target,
  status,
  packed = 0,
  unpacked = 0,
}: ProgressBarProps) {
  const percentage = Math.min((current / target) * 100, 100)

  // Always show layered bars when unpacked > 0
  if (unpacked > 0) {
    const packedPercentage = Math.min((packed / target) * 100, 100)
    const totalPercentage = Math.min(((packed + unpacked) / target) * 100, 100)

    const packedColor =
      status === 'ok'
        ? 'bg-status-ok-background-muted'
        : status === 'warning'
          ? 'bg-status-warning-background-muted'
          : status === 'error'
            ? 'bg-status-error-background-muted'
            : status === 'inactive'
              ? 'bg-status-inactive-background-muted'
              : 'bg-accessory-emphasized'

    const unpackedColor =
      status === 'ok'
        ? 'bg-status-ok-accessory-muted'
        : status === 'warning'
          ? 'bg-status-warning-accessory-muted'
          : status === 'error'
            ? 'bg-status-error-accessory-muted'
            : status === 'inactive'
              ? 'bg-status-inactive-accessory-muted'
              : 'bg-accessory-muted'

    return (
      <div className="relative h-2 w-full overflow-hidden rounded-xs border border-accessory-default">
        {/* Packed portion */}
        <div
          className={cn(
            'h-full absolute left-0 transition-all duration-300',
            packedColor,
          )}
          style={{ width: `${packedPercentage}%` }}
        />
        {/* Unpacked portion (layered on top at the end) */}
        <div
          className={cn(
            'h-full absolute transition-all duration-300',
            unpackedColor,
          )}
          style={{
            left: `${packedPercentage}%`,
            width: `${totalPercentage - packedPercentage}%`,
          }}
        />
      </div>
    )
  }

  return (
    <Progress
      value={percentage}
      className={cn(
        'h-2 [&>div]:transition-all [&>div]:duration-300',
        status === 'ok'
          ? '[&>div]:bg-status-ok-background-muted'
          : status === 'warning'
            ? '[&>div]:bg-status-warning-background-muted'
            : status === 'error'
              ? '[&>div]:bg-status-error-background-muted'
              : status === 'inactive'
                ? '[&>div]:bg-status-inactive-background-muted'
                : '[&>div]:bg-accessory-emphasized',
      )}
    />
  )
}

export function ItemProgressBar({
  current,
  target,
  status,
  targetUnit,
  packed = 0,
  unpacked = 0,
  amountPerPackage,
  refillThreshold,
}: ProgressBarProps) {
  const { t } = useTranslation()

  // Use continuous bar when tracking in measurement units
  // Guard: target=0 means inactive item
  if (target === 0) {
    if (current > 0) {
      const fillColor =
        status === 'ok'
          ? 'bg-status-ok-background-muted'
          : status === 'warning'
            ? 'bg-status-warning-background-muted'
            : status === 'error'
              ? 'bg-status-error-background-muted'
              : status === 'inactive'
                ? 'bg-status-inactive-background-muted'
                : 'bg-accessory-emphasized'
      return (
        <div className="flex-1">
          <div className="h-2 w-full rounded-xs border border-accessory-default overflow-hidden">
            <div className={cn('h-full w-full', fillColor)} />
          </div>
        </div>
      )
    }
    return (
      <div className="flex-1">
        <div className="h-2 w-full rounded-xs border border-accessory-default" />
      </div>
    )
  }

  const hasPackageInfo = amountPerPackage !== undefined && amountPerPackage > 0
  // Only convert measurement totals to package counts when tracking in measurement units.
  // For package-unit items, target is already in packages — no conversion needed.
  // Note: package-unit items without amountPerPackage go segmented using raw target
  // as the package count (e.g. "5 bottles" with no known volume = 5 segments).
  const needsConversion = hasPackageInfo && targetUnit === 'measurement'
  const scale = needsConversion ? amountPerPackage : 1
  const packageTarget = needsConversion ? roundPackages(target / scale) : target
  const useContinuous =
    (targetUnit === 'measurement' && !hasPackageInfo) ||
    packageTarget > SEGMENTED_MODE_MAX_TARGET

  // Segmented bar draws one segment per whole package: Array.from floors a
  // fractional length, so a 6.67-package target draws 6 segments.
  const segmentCount = Math.floor(packageTarget)
  const markerTarget = useContinuous ? target : segmentCount
  const threshold = refillThreshold ?? 0
  // The tick uses the bar's own unit: item units on a continuous bar,
  // packages on a segmented bar.
  const markerThreshold = useContinuous
    ? threshold
    : roundPackages(threshold / scale)
  const showMarker = threshold > 0 && markerTarget > 0

  return (
    <div className="relative flex-1">
      {useContinuous ? (
        <ContinuousProgressBar
          current={current}
          target={target}
          {...(status ? { status } : {})}
          packed={packed}
          unpacked={unpacked}
        />
      ) : (
        <SegmentedProgressBar
          current={current / scale}
          target={packageTarget}
          {...(status ? { status } : {})}
          packed={packed / scale}
          unpacked={unpacked / scale}
        />
      )}
      {showMarker && (
        <>
          <RefillMarker
            threshold={markerThreshold}
            target={markerTarget}
            segmented={!useContinuous}
          />
          <span className="sr-only">
            {t('common.refillWhenBelow', { value: refillThreshold })}
          </span>
        </>
      )}
    </div>
  )
}
