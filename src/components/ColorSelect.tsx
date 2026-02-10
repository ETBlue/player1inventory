import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TagColor } from '@/types'

interface ColorSelectProps {
  value: TagColor
  onChange: (color: TagColor) => void
  id?: string
}

export function ColorSelect({ value, onChange, id }: ColorSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue asChild>
          <Badge variant={value}>{value}</Badge>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.values(TagColor).map((color) => (
          <SelectItem key={color} value={color}>
            <Badge variant={color}>{color}</Badge>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
