import { ChevronDown, Tags, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { Tag, TagType } from '@/types'

// Tags may carry an optional depth annotation (from useTagsWithDepth / buildDepthFirstTagList)
type TagWithOptionalDepth = Tag & { depth?: number }

interface TagTypeDropdownProps {
  tagType: TagType
  tags: TagWithOptionalDepth[]
  selectedTagIds: string[]
  tagCounts: number[]
  onToggleTag: (tagId: string) => void
  onClear: () => void
}

export function TagTypeDropdown({
  tagType,
  tags,
  selectedTagIds,
  tagCounts,
  onToggleTag,
  onClear,
}: TagTypeDropdownProps) {
  const hasSelection = selectedTagIds.length > 0
  const selectedCount = selectedTagIds.length

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={hasSelection ? tagType.color : 'neutral-ghost'}
          size="xs"
          className="capitalize gap-1"
        >
          <Tags />
          {tagType.name}
          {selectedCount > 0 && (
            <span className="text-xs font-semibold">{selectedCount}</span>
          )}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {tags.map((tag, index) => {
          const isChecked = selectedTagIds.includes(tag.id)
          // Indent child tags based on depth (0 = top-level, no indent)
          const depth = tag.depth ?? 0
          return (
            <DropdownMenuCheckboxItem
              key={tag.id}
              checked={isChecked}
              onCheckedChange={() => onToggleTag(tag.id)}
              onSelect={(e) => e.preventDefault()} // Keep menu open
              className={cn(depth > 0 && `pl-${Math.min(depth * 4 + 8, 24)}`)}
            >
              <div className="flex items-center justify-between w-full">
                <Badge
                  variant={isChecked ? tagType.color : `${tagType.color}-tint`}
                >
                  {tag.name}
                </Badge>
                <span className="text-foreground-muted text-xs ml-2">
                  ({tagCounts[index]})
                </span>
              </div>
            </DropdownMenuCheckboxItem>
          )
        })}
        {hasSelection && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClear}>
              <X className="h-4 w-4" />
              <span className=" text-xs">Clear</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
