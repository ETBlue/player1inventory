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
import type { Tag, TagType } from '@/types'
import { Badge } from './ui/badge'

interface TagTypeDropdownProps {
  tagType: TagType
  tags: Tag[]
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

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={hasSelection ? tagType.color : 'neutral-outline'}
          size="mini"
          className="capitalize gap-1"
        >
          {tagType.name}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
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
                <Badge variant={tagType.color}>{tag.name}</Badge>
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
