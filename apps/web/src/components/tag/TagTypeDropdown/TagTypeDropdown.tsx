import { ChevronDown, Tags, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
import type { Tag, TagType } from '@/types'

// Tags may carry an optional depth annotation (from useTagsWithDepth / buildDepthFirstTagList)
type TagWithOptionalDepth = Tag & { depth?: number }

interface TagTypeDropdownProps {
  tagType: TagType
  tags: TagWithOptionalDepth[]
  selectedTagIds: string[]
  tagCounts?: number[]
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
  const { t } = useTranslation()
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
      <DropdownMenuContent align="start">
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
              style={depth > 0 ? { marginLeft: depth * 16 } : undefined}
            >
              {Array.from({ length: depth }, (_, i) => i * 16 + 4).map(
                (leftPx) => (
                  <div
                    key={`connector-at-${leftPx}px`}
                    className="border-r border-accessory-default absolute"
                    style={{
                      right: 'auto',
                      top: '-16px',
                      bottom: '16px',
                      left: `-${leftPx}px`,
                    }}
                  />
                ),
              )}
              {depth > 0 && (
                <div className="absolute w-2 h-px bg-accessory-default -left-1" />
              )}
              <div className="flex items-center justify-between w-full">
                <Badge
                  variant={
                    isChecked ? tagType.color : `${tagType.color}-inverse`
                  }
                >
                  {tag.name}
                </Badge>
                {tagCounts !== undefined &&
                  tagCounts[index] !== undefined &&
                  tagCounts[index] > 0 && (
                    <span className="text-foreground-muted text-xs ml-2">
                      ({tagCounts[index]})
                    </span>
                  )}
              </div>
            </DropdownMenuCheckboxItem>
          )
        })}
        {hasSelection && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClear}>
              <X className="h-4 w-4" />
              <span className=" text-xs">{t('common.clear')}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
