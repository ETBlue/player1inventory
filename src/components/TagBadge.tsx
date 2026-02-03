import { Badge } from '@/components/ui/badge'
import { getContrastTextColor } from '@/lib/utils'
import { useItemCountByTag } from '@/hooks/useTags'
import type { Tag, TagType } from '@/types'

interface TagBadgeProps {
  tag: Tag
  tagType: TagType
  onClick: () => void
}

export function TagBadge({ tag, tagType, onClick }: TagBadgeProps) {
  const { data: itemCount = 0 } = useItemCountByTag(tag.id)
  const backgroundColor = tagType.color || '#3b82f6'
  const textColor = getContrastTextColor(backgroundColor)

  return (
    <Badge
      style={{
        backgroundColor,
        color: textColor,
      }}
      className="cursor-pointer"
      onClick={onClick}
    >
      {tag.name} ({itemCount})
    </Badge>
  )
}
