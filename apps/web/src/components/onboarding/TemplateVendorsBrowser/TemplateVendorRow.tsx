import { Card, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'

interface TemplateVendorRowProps {
  name: string
  isChecked: boolean
  onToggle: () => void
}

export function TemplateVendorRow({
  name,
  isChecked,
  onToggle,
}: TemplateVendorRowProps) {
  return (
    <Card className="ml-10 px-3 py-2">
      <Checkbox
        checked={isChecked}
        onCheckedChange={onToggle}
        aria-label={isChecked ? `Remove ${name}` : `Add ${name}`}
        className="absolute -ml-10 mt-[2px]"
      />
      <CardHeader className="truncate">{name}</CardHeader>
    </Card>
  )
}
