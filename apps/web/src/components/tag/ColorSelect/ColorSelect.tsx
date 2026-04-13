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

function ColorPreview({ color }: { color: TagColor }) {
  return (
    <div className="flex items-center gap-1">
      <Badge
        variant={`${color}-inverse` as Parameters<typeof Badge>[0]['variant']}
      >
        {color}
      </Badge>
      <Badge variant={color}>{color}</Badge>
    </div>
  )
}

export function ColorSelect({ value, onChange, id }: ColorSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue asChild>
          <ColorPreview color={value} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.values(TagColor).map((color) => (
          <SelectItem key={color} value={color}>
            <ColorPreview color={color} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
