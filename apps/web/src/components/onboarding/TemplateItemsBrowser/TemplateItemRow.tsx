import { TagBadge } from '@/components/tag/TagBadge'
import { Card, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import type { Tag, TagType } from '@/types'

interface TemplateItemRowProps {
  name: string
  tags: Tag[]
  tagTypes: TagType[]
  isChecked: boolean
  onToggle: () => void
}

export function TemplateItemRow({
  name,
  tags,
  tagTypes,
  isChecked,
  onToggle,
}: TemplateItemRowProps) {
  return (
    <div className="relative">
      <Checkbox
        checked={isChecked}
        onCheckedChange={onToggle}
        aria-label={isChecked ? `Remove ${name}` : `Add ${name}`}
        className="absolute -ml-10 mt-2"
      />
      <Card className="ml-10">
        <CardHeader className="flex flex-row items-center gap-2 min-h-8">
          <span className="flex-1 truncate min-w-0 capitalize">{name}</span>
          {tags.map((tag) => {
            const tagType = tagTypes.find((tt) => tt.id === tag.typeId)
            if (!tagType) return null
            return <TagBadge key={tag.id} tag={tag} tagType={tagType} />
          })}
        </CardHeader>
      </Card>
    </div>
  )
}
