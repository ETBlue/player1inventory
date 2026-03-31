import { TagBadge } from '@/components/tag/TagBadge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
    <div className={isChecked ? 'bg-background-surface' : ''}>
      <Card className="ml-10 space-y-1 px-3 py-2">
        <Checkbox
          checked={isChecked}
          onCheckedChange={onToggle}
          aria-label={isChecked ? `Remove ${name}` : `Add ${name}`}
          className="absolute -ml-10 mt-[2px]"
        />
        <CardHeader className="truncate capitalize">{name}</CardHeader>
        <CardContent className="flex items-center gap-2">
          {tags.map((tag) => {
            const tagType = tagTypes.find((tt) => tt.id === tag.typeId)
            if (!tagType) return null
            return <TagBadge key={tag.id} tag={tag} tagType={tagType} />
          })}
        </CardContent>
      </Card>
    </div>
  )
}
