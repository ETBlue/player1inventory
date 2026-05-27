import { Loader2 } from 'lucide-react'
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
  /** When true, shows a loading spinner instead of the item count and blocks interaction. */
  isLoading?: boolean
}

export function TagBadge({
  tag,
  tagType,
  onClick,
  className,
  count,
  isLoading,
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
      className={cn(
        className,
        onClick ? 'cursor-pointer' : '',
        isLoading ? 'pointer-events-none' : '',
      )}
      onClick={onClick}
      aria-busy={isLoading}
    >
      {tag.name}
      {isLoading ? (
        <Loader2 className="ml-1 h-3 w-3 animate-spin [transform-box:fill-box]" />
      ) : (
        ` (${itemCount})`
      )}
    </Badge>
  )
}
