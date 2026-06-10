interface UnitInlineProps {
  unit?: string
  placeholder?: string
}

export function UnitInline({ unit, placeholder = 'pack' }: UnitInlineProps) {
  return <span className="text-xs font-normal">({unit ?? placeholder})</span>
}
