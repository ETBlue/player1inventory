import { Badge } from '@/components/ui/badge'
import { useItemCountByTag } from '@/hooks/useTags'
import type { Tag, TagType } from '@/types'

interface TagBadgeProps {
  tag: Tag
  tagType: TagType
  onClick: () => void
}

export function TagBadge({ tag, tagType, onClick }: TagBadgeProps) {
  const { data: itemCount = 0 } = useItemCountByTag(tag.id)

  return (
    <Badge variant={tagType.color} className="cursor-pointer" onClick={onClick}>
      {tag.name} ({itemCount})
    </Badge>
  )
}
