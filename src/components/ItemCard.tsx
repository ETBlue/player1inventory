import { Link } from '@tanstack/react-router'
import { Minus, Plus, TriangleAlert } from 'lucide-react'
import { ItemProgressBar } from '@/components/ItemProgressBar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentQuantity } from '@/lib/quantityUtils'
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
  showTags?: boolean
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
  showTags = true,
}: ItemCardProps) {
  const currentQuantity = getCurrentQuantity(item)
  const status =
    item.refillThreshold > 0 && quantity === item.refillThreshold
      ? 'warning'
      : quantity < item.refillThreshold
        ? 'error'
        : 'ok'
  const _isExpiringSoon =
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
              (
              {item.targetUnit === 'measurement' && item.measurementUnit
                ? item.measurementUnit
                : (item.packageUnit ?? 'units')}
              )
            </span>
          </CardTitle>
          <ItemProgressBar
            current={quantity}
            target={item.targetQuantity}
            status={status}
            targetUnit={item.targetUnit}
          />
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
            aria-label={`Consume ${item.name}`}
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
            aria-label={`Add ${item.name}`}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 -mb-1">
          {currentQuantity > 0 && estimatedDueDate && (
            <span className="inline-flex gap-1 px-2 py-1 text-xs bg-status-error text-tint">
              <TriangleAlert className="w-4 h-4" />
              {item.estimatedDueDays
                ? // Relative mode: show "Expires in X days"
                  (() => {
                    const daysUntilExpiration = Math.ceil(
                      (estimatedDueDate.getTime() - Date.now()) / 86400000,
                    )
                    return daysUntilExpiration >= 0
                      ? `Expires in ${daysUntilExpiration} days`
                      : `Expired ${Math.abs(daysUntilExpiration)} days ago`
                  })()
                : // Explicit mode: show "Expires on YYYY-MM-DD"
                  `Expires on ${estimatedDueDate.toISOString().split('T')[0]}`}
            </span>
          )}
          {tags.length > 0 && !showTags && (
            <span className="text-xs text-foreground-muted">
              {tags.length} {tags.length === 1 ? 'tag' : 'tags'}
            </span>
          )}
        </div>
        {tags.length > 0 && showTags && (
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
