import { Link } from '@tanstack/react-router'
import { AlertTriangle, Minus, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Item, Tag, TagType } from '@/types'

interface ItemCardProps {
  item: Item
  quantity: number
  tags: Tag[]
  tagTypes: TagType[]
  estimatedDueDate?: Date
  onConsume: () => void
  onAdd: () => void
  onTagClick?: (tagId: string) => void
}

export function ItemCard({
  item,
  quantity,
  tags,
  tagTypes,
  estimatedDueDate,
  onConsume,
  onAdd,
  onTagClick,
}: ItemCardProps) {
  const needsRefill = quantity < item.refillThreshold
  const isExpiringSoon =
    estimatedDueDate &&
    estimatedDueDate.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000 // 3 days

  return (
    <Card variant={needsRefill ? 'warning' : 'default'}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <Link
            to="/items/$id"
            params={{ id: item.id }}
            className="flex-1 min-w-0"
          >
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate">{item.name}</h3>
              {needsRefill && (
                <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />
              )}
            </div>
            <p className="text-sm text-foreground-muted">
              {quantity} {item.unit ?? 'units'} / {item.targetQuantity} target
            </p>
            {isExpiringSoon && (
              <p className="text-xs text-red-500 mt-1">
                Expires {estimatedDueDate.toLocaleDateString()}
              </p>
            )}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => {
                  const tagType = tagTypes.find((t) => t.id === tag.typeId)
                  const bgColor = tagType?.color
                  return (
                    <Badge
                      key={tag.id}
                      variant={bgColor}
                      className={`text-xs ${onTagClick ? 'cursor-pointer' : ''}`}
                      onClick={(e) => {
                        if (onTagClick) {
                          e.preventDefault()
                          e.stopPropagation()
                          onTagClick(tag.id)
                        }
                      }}
                    >
                      {tag.name}
                    </Badge>
                  )
                })}
              </div>
            )}
          </Link>
          <div className="flex items-center gap-1">
            <Button
              variant="neutral-outline"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.preventDefault()
                onConsume()
              }}
              disabled={quantity <= 0}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-8 text-center font-medium">{quantity}</span>
            <Button
              variant="neutral-outline"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.preventDefault()
                onAdd()
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
