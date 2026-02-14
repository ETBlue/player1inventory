import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface ProgressBarProps {
  current: number
  target: number
  status?: 'ok' | 'warning' | 'error'
}

function SegmentedProgressBar({ current, target, status }: ProgressBarProps) {
  const segments = Array.from({ length: target }, (_, i) => {
    const segmentStart = i
    const segmentEnd = i + 1

    let fillPercentage = 0
    if (current >= segmentEnd) {
      fillPercentage = 100
    } else if (current > segmentStart) {
      fillPercentage = (current - segmentStart) * 100
    }

    const fillColor =
      status === 'ok'
        ? 'bg-status-ok'
        : status === 'warning'
          ? 'bg-status-warning'
          : status === 'error'
            ? 'bg-status-error'
            : 'bg-accessory-emphasized'

    return (
      <div
        // biome-ignore lint/suspicious/noArrayIndexKey: segments are static presentational elements
        key={i}
        data-segment={i}
        data-fill={fillPercentage}
        className={cn(
          'h-2 flex-1 rounded-xs relative overflow-hidden',
          'border border-accessory-emphasized',
        )}
      >
        {fillPercentage > 0 && (
          <div
            className={cn('h-full', fillColor)}
            style={{ width: `${fillPercentage}%` }}
          />
        )}
      </div>
    )
  })

  return <div className="flex gap-0.5">{segments}</div>
}

function ContinuousProgressBar({ current, target, status }: ProgressBarProps) {
  const percentage = Math.min((current / target) * 100, 100)

  return (
    <Progress
      value={percentage}
      className={cn(
        '[&>div]:transition-all [&>div]:duration-300',
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

export function ItemProgressBar({ current, target, status }: ProgressBarProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        {target <= 15 ? (
          <SegmentedProgressBar
            current={current}
            target={target}
            status={status}
          />
        ) : (
          <ContinuousProgressBar
            current={current}
            target={target}
            status={status}
          />
        )}
      </div>
      <span className="text-xs text-foreground-muted whitespace-nowrap">
        {current}/{target}
      </span>
    </div>
  )
}
