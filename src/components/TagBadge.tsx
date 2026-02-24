import { Badge } from '@/components/ui/badge'
import { useItemCountByTag } from '@/hooks/useTags'
import { cn } from '@/lib/utils'
import type { Tag, TagType } from '@/types'

interface TagBadgeProps {
  tag: Tag
  tagType: TagType
  onClick?: () => void
  className?: string
}

export function TagBadge({ tag, tagType, onClick, className }: TagBadgeProps) {
  const { data: itemCount = 0 } = useItemCountByTag(tag.id)

  return (
    <Badge
      variant={tagType.color}
      className={cn(className, onClick ? 'cursor-pointer' : '')}
      onClick={onClick}
    >
      {tag.name} ({itemCount})
    </Badge>
  )
}
