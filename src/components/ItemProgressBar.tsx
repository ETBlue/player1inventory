import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface ProgressBarProps {
  current: number
  target: number
  status?: 'ok' | 'warning' | 'error'
  targetUnit?: 'package' | 'measurement'
  packed?: number
  unpacked?: number
  measurementUnit?: string
}

function SegmentedProgressBar({
  current,
  target,
  status,
  packed = 0,
  unpacked = 0,
  measurementUnit,
}: ProgressBarProps) {
  const segments = Array.from({ length: target }, (_, i) => {
    const segmentStart = i
    const segmentEnd = i + 1

    // For simple mode (no measurement unit), show packed and unpacked separately
    const isSimpleMode = !measurementUnit
    let packedFill = 0
    let unpackedFill = 0

    if (isSimpleMode && (packed > 0 || unpacked > 0)) {
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
    if (!isSimpleMode || (packed === 0 && unpacked === 0)) {
      // Normal mode: use current
      if (current >= segmentEnd) {
        fillPercentage = 100
      } else if (current > segmentStart) {
        fillPercentage = (current - segmentStart) * 100
      }
    }

    const fillColor =
      status === 'ok'
        ? 'bg-status-ok'
        : status === 'warning'
          ? 'bg-status-warning'
          : status === 'error'
            ? 'bg-status-error'
            : 'bg-accessory-emphasized'

    const packedColor =
      status === 'ok'
        ? 'bg-status-ok'
        : status === 'warning'
          ? 'bg-status-warning'
          : status === 'error'
            ? 'bg-status-error'
            : 'bg-accessory-emphasized'

    const unpackedColor = 'bg-accessory-emphasized'

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
          'border border-accessory-emphasized',
        )}
      >
        {isSimpleMode && (packed > 0 || unpacked > 0) ? (
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
  measurementUnit,
}: ProgressBarProps) {
  const isSimpleMode = !measurementUnit
  const percentage = Math.min((current / target) * 100, 100)

  // For simple mode with unpacked, show layered bars
  if (isSimpleMode && unpacked > 0) {
    const packedPercentage = Math.min((packed / target) * 100, 100)
    const totalPercentage = Math.min(((packed + unpacked) / target) * 100, 100)

    const packedColor =
      status === 'ok'
        ? 'bg-status-ok'
        : status === 'warning'
          ? 'bg-status-warning'
          : status === 'error'
            ? 'bg-status-error'
            : 'bg-accessory-emphasized'

    const unpackedColor = 'bg-accessory-emphasized'

    return (
      <div className="relative h-2 w-full overflow-hidden rounded-xs bg-accessory">
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
          ? '[&>div]:bg-status-ok'
          : status === 'warning'
            ? '[&>div]:bg-status-warning'
            : status === 'error'
              ? '[&>div]:bg-status-error'
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
  measurementUnit,
}: ProgressBarProps) {
  // Use continuous bar when tracking in measurement units
  const useContinuous = targetUnit === 'measurement' || target > 15

  // Format count display
  const isSimpleMode = !measurementUnit
  const countDisplay =
    isSimpleMode && unpacked > 0
      ? `${packed} (+${unpacked})/${target}`
      : `${current}/${target}`

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        {useContinuous ? (
          <ContinuousProgressBar
            current={current}
            target={target}
            status={status}
            packed={packed}
            unpacked={unpacked}
            measurementUnit={measurementUnit}
          />
        ) : (
          <SegmentedProgressBar
            current={current}
            target={target}
            status={status}
            packed={packed}
            unpacked={unpacked}
            measurementUnit={measurementUnit}
          />
        )}
      </div>
      <span className="text-xs text-foreground-muted whitespace-nowrap">
        {countDisplay}
      </span>
    </div>
  )
}
