import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

// Maximum target quantity for segmented mode (use continuous mode above this)
const SEGMENTED_MODE_MAX_TARGET = 30

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

    const unpackedColor = 'bg-accessory-default'

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
        ? 'bg-status-ok'
        : status === 'warning'
          ? 'bg-status-warning'
          : status === 'error'
            ? 'bg-status-error'
            : 'bg-accessory-emphasized'

    const unpackedColor = 'bg-accessory-default'

    return (
      <div className="relative h-2 w-full overflow-hidden rounded-xs border border-accessory-emphasized">
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
}: ProgressBarProps) {
  // Use continuous bar when tracking in measurement units
  // Guard: target=0 means inactive item — render empty visible track
  if (target === 0) {
    return (
      <div className="flex-1">
        <div className="h-2 w-full rounded-xs border border-accessory-emphasized" />
      </div>
    )
  }

  const useContinuous =
    targetUnit === 'measurement' || target > SEGMENTED_MODE_MAX_TARGET

  return (
    <div className="flex-1">
      {useContinuous ? (
        <ContinuousProgressBar
          current={current}
          target={target}
          status={status}
          packed={packed}
          unpacked={unpacked}
        />
      ) : (
        <SegmentedProgressBar
          current={current}
          target={target}
          status={status}
          packed={packed}
          unpacked={unpacked}
        />
      )}
    </div>
  )
}
