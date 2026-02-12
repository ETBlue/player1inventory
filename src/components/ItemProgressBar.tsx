import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface ProgressBarProps {
  current: number
  target: number
  status?: 'ok' | 'warning' | 'error'
}

function SegmentedProgressBar({ current, target, status }: ProgressBarProps) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: target }, (_, i) => {
        const isFilled = i < current
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
            className={cn(
              'h-2 flex-1 rounded-xs',
              isFilled ? fillColor : 'border border-accessory-emphasized',
            )}
          />
        )
      })}
    </div>
  )
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
