import { ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { colors } from '@/design-tokens'
import type { Tag, TagType } from '@/types'

interface TagTypeDropdownProps {
  tagType: TagType
  tags: Tag[]
  selectedTagIds: string[]
  tagCounts: number[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onToggleTag: (tagId: string) => void
  onClear: () => void
  onInteractOutside?: () => void
}

export function TagTypeDropdown({
  tagType,
  tags,
  selectedTagIds,
  tagCounts,
  open,
  onOpenChange,
  onToggleTag,
  onClear,
}: TagTypeDropdownProps) {
  const hasSelection = selectedTagIds.length > 0
  const tagTypeColor = colors[tagType.color as keyof typeof colors]?.default

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="neutral-outline"
          size="sm"
          style={{
            borderColor: tagTypeColor,
            color: tagTypeColor,
          }}
        >
          {tagType.name}
          {hasSelection && <span className="ml-1">•</span>}
          <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {hasSelection && (
          <>
            <DropdownMenuItem onClick={onClear}>
              <X className="mr-2 h-4 w-4" />
              Clear
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {tags.map((tag, index) => {
          const isChecked = selectedTagIds.includes(tag.id)
          return (
            <DropdownMenuCheckboxItem
              key={tag.id}
              checked={isChecked}
              onCheckedChange={() => onToggleTag(tag.id)}
              onSelect={(e) => e.preventDefault()} // Keep menu open
            >
              <div className="flex items-center justify-between w-full">
                <span>{tag.name}</span>
                <span className="text-muted-foreground text-xs ml-2">
                  ({tagCounts[index]})
                </span>
              </div>
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
