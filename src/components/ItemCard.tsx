import { Link } from '@tanstack/react-router'
import { Minus, Plus, TriangleAlert } from 'lucide-react'
import { ItemProgressBar } from '@/components/ItemProgressBar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { getCurrentQuantity, isInactive } from '@/lib/quantityUtils'
import { sortTagsByTypeAndName } from '@/lib/tagSortUtils'
import { cn } from '@/lib/utils'
import type { Item, Tag, TagType } from '@/types'

interface ItemCardProps {
  item: Item
  quantity: number
  tags: Tag[]
  tagTypes: TagType[]
  estimatedDueDate?: Date
  onTagClick?: (tagId: string) => void
  showTags?: boolean
  mode?: 'pantry' | 'shopping' | 'tag-assignment' | 'recipe-assignment'
  // Unified behavior props (mode-agnostic)
  isChecked?: boolean
  onCheckboxToggle?: () => void
  controlAmount?: number // shown in right-side controls (cart qty, recipe amount)
  minControlAmount?: number // minimum before minus disables (default: 1)
  onAmountChange?: (delta: number) => void
  disabled?: boolean // disables checkbox and amount buttons (e.g. while saving)
}

export function ItemCard({
  item,
  quantity,
  tags,
  tagTypes,
  estimatedDueDate,
  onTagClick,
  showTags = true,
  mode = 'pantry',
  isChecked,
  onCheckboxToggle,
  controlAmount,
  minControlAmount = 1,
  onAmountChange,
  disabled,
}: ItemCardProps) {
  const currentQuantity = getCurrentQuantity(item)
  const status =
    item.refillThreshold > 0 && quantity === item.refillThreshold
      ? 'warning'
      : quantity < item.refillThreshold
        ? 'error'
        : 'ok'
  // Convert packed quantity to measurement units for display when tracking in measurement
  const displayPacked =
    item.targetUnit === 'measurement' && item.amountPerPackage
      ? item.packedQuantity * item.amountPerPackage
      : item.packedQuantity

  if (
    process.env.NODE_ENV !== 'production' &&
    controlAmount !== undefined &&
    !onAmountChange
  ) {
    console.warn('ItemCard: controlAmount requires onAmountChange to function.')
  }

  return (
    <Card
      variant={status === 'ok' ? 'default' : status}
      className={cn(
        onCheckboxToggle ? 'ml-10' : '',
        controlAmount !== undefined ? 'mr-28' : '',
      )}
    >
      {onCheckboxToggle && (
        <Checkbox
          checked={!!isChecked}
          onCheckedChange={() => onCheckboxToggle()}
          disabled={disabled}
          aria-label={isChecked ? `Remove ${item.name}` : `Add ${item.name}`}
          className="absolute -ml-10"
        />
      )}
      {controlAmount !== undefined && (
        <div className="flex items-stretch absolute -right-26 top-1.5">
          <Button
            variant="neutral-outline"
            size="icon"
            className="rounded-tr-none rounded-br-none"
            onClick={(e) => {
              e.preventDefault()
              onAmountChange?.(-1)
            }}
            aria-label={`Decrease quantity of ${item.name}`}
            disabled={disabled || (controlAmount ?? 0) <= minControlAmount}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="flex items-center justify-center text-sm text-center w-[2rem] border-b border-t border-accessory-emphasized">
            {controlAmount}
          </span>
          <Button
            variant="neutral-outline"
            size="icon"
            className="rounded-tl-none rounded-bl-none"
            onClick={(e) => {
              e.preventDefault()
              onAmountChange?.(1)
            }}
            aria-label={`Increase quantity of ${item.name}`}
            disabled={disabled}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
      <CardHeader
        className={cn(
          'flex flex-row items-start justify-between gap-2',
          isInactive(item) ? 'opacity-50' : '',
        )}
      >
        <Link
          to="/items/$id"
          params={{ id: item.id }}
          className="flex-1 min-w-0"
        >
          <CardTitle className="flex gap-1 items-baseline justify-between">
            <div className="flex gap-1 min-w-0">
              <h3 className="truncate">{item.name}</h3>
              <span className="text-xs font-normal">
                (
                {item.targetUnit === 'measurement' && item.measurementUnit
                  ? item.measurementUnit
                  : (item.packageUnit ?? 'units')}
                )
              </span>
            </div>
            <span className="text-xs font-normal text-foreground-muted whitespace-nowrap">
              {item.unpackedQuantity > 0
                ? `${displayPacked} (+${item.unpackedQuantity})/${item.targetQuantity}`
                : `${currentQuantity}/${item.targetQuantity}`}
            </span>
          </CardTitle>
          <ItemProgressBar
            current={quantity}
            target={item.targetQuantity}
            status={status}
            targetUnit={item.targetUnit}
            packed={displayPacked}
            unpacked={item.unpackedQuantity}
            {...(item.measurementUnit
              ? { measurementUnit: item.measurementUnit }
              : {})}
          />
        </Link>

        {onAmountChange && controlAmount === undefined && (
          <div>
            <Button
              className="rounded-tr-none rounded-br-none"
              variant="neutral-outline"
              size="icon"
              onClick={(e) => {
                e.preventDefault()
                onAmountChange(-(item.consumeAmount ?? 1))
              }}
              disabled={disabled || quantity <= 0}
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
                onAmountChange(1)
              }}
              disabled={disabled}
              aria-label={`Add ${item.name}`}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className={isInactive(item) ? 'opacity-50' : ''}>
        <div className="flex items-center gap-2 -mb-1">
          {currentQuantity > 0 &&
            estimatedDueDate &&
            (() => {
              const daysUntilExpiration = Math.ceil(
                (estimatedDueDate.getTime() - Date.now()) / 86400000,
              )
              const threshold =
                item.expirationThreshold ?? Number.POSITIVE_INFINITY
              const isWarning = daysUntilExpiration <= threshold

              return (
                <span
                  className={cn(
                    'inline-flex gap-1 px-2 py-1 text-xs',
                    isWarning
                      ? 'bg-status-error text-tint'
                      : 'text-foreground-muted',
                  )}
                >
                  {isWarning && <TriangleAlert className="w-4 h-4" />}
                  {item.estimatedDueDays
                    ? // Relative mode: show "Expires in X days"
                      daysUntilExpiration >= 0
                      ? `Expires in ${daysUntilExpiration} days`
                      : `Expired ${Math.abs(daysUntilExpiration)} days ago`
                    : // Explicit mode: show "Expires on YYYY-MM-DD"
                      `Expires on ${estimatedDueDate.toISOString().split('T')[0]}`}
                </span>
              )
            })()}
          {tags.length > 0 && !showTags && (
            <span className="text-xs text-foreground-muted">
              {tags.length} {tags.length === 1 ? 'tag' : 'tags'}
            </span>
          )}
        </div>
        {tags.length > 0 && mode !== 'shopping' && showTags && (
          <div className="flex flex-wrap gap-1 mt-2">
            {sortTagsByTypeAndName(tags, tagTypes).map((tag) => {
              const tagType = tagTypes.find((t) => t.id === tag.typeId)
              const bgColor = tagType?.color
              return (
                <Badge
                  key={tag.id}
                  data-testid={`tag-badge-${tag.name}`}
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
