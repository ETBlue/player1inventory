import { Badge } from '@/components/ui/badge'
import { useItemCountByTag } from '@/hooks/useTags'
import { cn } from '@/lib/utils'
import type { Tag, TagType } from '@/types'

interface TagBadgeProps {
  tag: Tag
  tagType: TagType
  onClick?: () => void
  className?: string
  /** When provided, overrides the database query and renders this count directly. */
  count?: number
}

export function TagBadge({
  tag,
  tagType,
  onClick,
  className,
  count,
}: TagBadgeProps) {
  // Pass empty string when count is provided externally to skip the DB query
  // (useItemCountByTag has enabled: !!tagId, so '' disables the query).
  const { data: dbItemCount = 0 } = useItemCountByTag(
    count !== undefined ? '' : tag.id,
  )
  const itemCount = count ?? dbItemCount

  return (
    <Badge
      variant={`${tagType.color}-inverse`}
      className={cn(className, onClick ? 'cursor-pointer' : '')}
      onClick={onClick}
    >
      {tag.name} ({itemCount})
    </Badge>
  )
}
