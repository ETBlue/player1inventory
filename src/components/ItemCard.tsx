import { Link } from '@tanstack/react-router'
import { Minus, Plus, TriangleAlert } from 'lucide-react'
import { ItemProgressBar } from '@/components/ItemProgressBar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  const status =
    item.refillThreshold > 0 && quantity === item.refillThreshold
      ? 'warning'
      : quantity < item.refillThreshold
        ? 'error'
        : 'ok'
  const isExpiringSoon =
    estimatedDueDate &&
    estimatedDueDate.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000 // 3 days

  return (
    <Card variant={status === 'ok' ? 'default' : status}>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <Link
          to="/items/$id"
          params={{ id: item.id }}
          className="flex-1 min-w-0"
        >
          <CardTitle className="flex gap-1">
            <h3 className="truncate">{item.name}</h3>
            <span className="text-xs font-normal">
              ({item.unit ?? 'units'})
            </span>
          </CardTitle>
          <ItemProgressBar
            current={quantity}
            target={item.targetQuantity}
            status={status}
          />
          {isExpiringSoon && (
            <p className="inline-flex gap-1 px-2 py-1 text-xs bg-status-error text-tint">
              <TriangleAlert className="w-4 h-4" />
              Expires {estimatedDueDate.toLocaleDateString()}
            </p>
          )}
        </Link>
        <div className="flex items-center">
          <Button
            className="rounded-tr-none rounded-br-none"
            variant="neutral-outline"
            size="icon"
            onClick={(e) => {
              e.preventDefault()
              onConsume()
            }}
            disabled={quantity <= 0}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            className="-ml-px rounded-tl-none rounded-bl-none"
            variant="neutral-outline"
            size="icon"
            onClick={(e) => {
              e.preventDefault()
              onAdd()
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  )
}
