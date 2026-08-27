export interface UnitBadgeProps {
  unit?: string | undefined
}

export function UnitBadge({ unit = 'pack' }: UnitBadgeProps) {
  return (
    // `data-unit-badge` is a stable hook for e2e/a11y.spec.ts's
    // KNOWN_UNIT_BADGE_CONTRAST_EXCLUSION -- a class-based selector
    // (`.opacity-75`) also matched the dialog Close button
    // (ui/dialog.tsx), silently exempting it from the color-contrast rule
    // too. A dedicated attribute can't drift onto an unrelated element the
    // way a shared utility class can.
    <span
      data-unit-badge
      className="px-1 text-xs text-foreground-muted border border-foreground-muted rounded-xs opacity-75"
    >
      {unit}
    </span>
  )
}
