export interface UnitBadgeProps {
  unit?: string | undefined
}

export function UnitBadge({ unit = 'pack' }: UnitBadgeProps) {
  return (
    <span className="px-1 text-xs text-foreground-muted border border-foreground-muted rounded-xs opacity-75">
      {unit}
    </span>
  )
}
