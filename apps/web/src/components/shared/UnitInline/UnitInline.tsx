export interface UnitInlineProps {
  unit?: string | undefined
  placeholder?: string | undefined
}

export function UnitInline({ unit, placeholder = 'pack' }: UnitInlineProps) {
  return (
    <span className="text-xs font-normal text-foreground-muted">
      ({unit ?? placeholder})
    </span>
  )
}
