import { Link } from '@tanstack/react-router'
import { CookingPot, Minus, Plus, Store, TriangleAlert } from 'lucide-react'
import type React from 'react'
import { ItemProgressBar } from '@/components/item/ItemProgressBar'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { useLastPurchaseDate } from '@/hooks'
import { computeExpiryDate, inferExpirationMode } from '@/lib/expiration'
import {
  getCurrentQuantity,
  getStockStatus,
  isInactive,
} from '@/lib/quantityUtils'
import { sortTagsByTypeAndName } from '@/lib/tagSortUtils'
import { cn } from '@/lib/utils'
import type { Item, Recipe, Tag, TagType, Vendor } from '@/types'
import { DEFAULT_PACKAGE_UNIT } from '@/types'

interface ItemCardProps {
  item: Item
  tags: Tag[]
  tagTypes: TagType[]
  onTagClick?: (tagId: string) => void
  showTags?: boolean
  mode?:
    | 'pantry'
    | 'shopping'
    | 'tag-assignment'
    | 'recipe-assignment'
    | 'cooking'
  // Unified behavior props (mode-agnostic)
  isChecked?: boolean
  onCheckboxToggle?: () => void
  controlAmount?: number // shown in right-side controls (cart qty, recipe amount)
  minControlAmount?: number // minimum before minus disables (default: 1)
  onAmountChange?: (delta: number) => void
  disabled?: boolean // disables checkbox and amount buttons (e.g. while saving)
  vendors?: Vendor[]
  recipes?: Recipe[]
  onVendorClick?: (vendorId: string) => void
  onRecipeClick?: (recipeId: string) => void
  activeVendorIds?: string[]
  activeRecipeIds?: string[]
  activeTagIds?: string[]
  showExpiration?: boolean
  showTagSummary?: boolean
  highlightedName?: React.ReactNode
}

export function ItemCard({
  item,
  tags,
  tagTypes,
  onTagClick,
  showTags = true,
  mode = 'pantry',
  isChecked,
  onCheckboxToggle,
  controlAmount,
  minControlAmount = 0,
  onAmountChange,
  disabled,
  vendors = [],
  recipes = [],
  onVendorClick,
  onRecipeClick,
  activeVendorIds,
  activeRecipeIds,
  activeTagIds,
  showExpiration = true,
  showTagSummary = true,
  highlightedName,
}: ItemCardProps) {
  const { data: lastPurchase } = useLastPurchaseDate(item.id)

  const estimatedDueDate = computeExpiryDate(item, lastPurchase ?? undefined)

  const currentQuantity = getCurrentQuantity(item)
  const status = getStockStatus(currentQuantity, item.refillThreshold)
  const progressStatus = isInactive(item) ? 'inactive' : status
  // Convert packed quantity to measurement units for display when tracking in measurement
  const displayPacked =
    item.targetUnit === 'measurement' && item.amountPerPackage
      ? item.packedQuantity * item.amountPerPackage
      : item.packedQuantity

  const unitLabel =
    item.targetUnit === 'measurement' && item.measurementUnit
      ? item.measurementUnit
      : (item.packageUnit ?? DEFAULT_PACKAGE_UNIT)

  const isAmountControllable = [
    'shopping',
    'recipe-assignment',
    'cooking',
  ].includes(mode)

  if (import.meta.env.DEV && isAmountControllable && !onAmountChange) {
    console.warn('ItemCard: controlAmount requires onAmountChange to function.')
  }

  return (
    <Card
      variant={isInactive(item) || status === 'ok' ? 'default' : status}
      className={cn(
        onCheckboxToggle ? 'ml-10' : '',
        isAmountControllable ? 'mr-28' : '',
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
      {isChecked && isAmountControllable && (
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
          {/* Screen reader announcement for quantity changes */}
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {item.name}: {controlAmount}
          </span>
        </div>
      )}
      <CardHeader
        className={cn(
          'flex flex-row items-start justify-between gap-2 min-h-8',
          isInactive(item) ? 'opacity-80' : '',
        )}
      >
        <Link
          to="/items/$id"
          params={{ id: item.id }}
          className="flex-1 min-w-0"
        >
          <CardTitle className="flex gap-1 items-baseline justify-between mb-1">
            <h3 className="truncate capitalize">
              {isInactive(item) && <span className="sr-only">Inactive </span>}
              {highlightedName ?? item.name}
            </h3>
            <div className="flex-1" />
            <span className="text-xs font-normal text-foreground-muted whitespace-nowrap">
              {item.unpackedQuantity > 0
                ? `${displayPacked} (+${item.unpackedQuantity})/${item.targetQuantity}`
                : `${currentQuantity}/${item.targetQuantity}`}
            </span>
            <span className="px-1 text-xs text-foreground-muted border-1 border-foreground-muted opacity-75">
              {unitLabel}
            </span>
          </CardTitle>
          <ItemProgressBar
            current={currentQuantity}
            target={item.targetQuantity}
            status={progressStatus}
            targetUnit={item.targetUnit}
            packed={displayPacked}
            unpacked={item.unpackedQuantity}
            {...(item.measurementUnit
              ? { measurementUnit: item.measurementUnit }
              : {})}
            {...(item.amountPerPackage
              ? { amountPerPackage: item.amountPerPackage }
              : {})}
          />
        </Link>

        {onAmountChange && mode === 'pantry' && (
          <div>
            <Button
              className="rounded-tr-none rounded-br-none"
              variant="neutral-outline"
              size="icon"
              onClick={(e) => {
                e.preventDefault()
                onAmountChange(-(item.consumeAmount ?? 1))
              }}
              disabled={disabled || currentQuantity <= 0}
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
      <CardContent className={isInactive(item) ? 'opacity-80' : ''}>
        <div className="flex items-center gap-2 -mb-1">
          {showExpiration &&
            currentQuantity > 0 &&
            estimatedDueDate &&
            (() => {
              const daysUntilExpiration = Math.ceil(
                (estimatedDueDate.getTime() - Date.now()) / 86400000,
              )
              const isWarning =
                item.expirationThreshold != null &&
                daysUntilExpiration <= item.expirationThreshold

              return (
                <span
                  className={cn(
                    'inline-flex gap-1 text-xs',
                    isWarning
                      ? 'text-foreground-colorless-inverse bg-status-error-background rounded-sm px-1 py-0.5'
                      : 'text-foreground',
                  )}
                >
                  {isWarning && <TriangleAlert className="w-4 h-4" />}
                  {inferExpirationMode(item) === 'days from purchase'
                    ? // Relative mode: show "Expires in X days"
                      daysUntilExpiration >= 0
                      ? `Expires in ${daysUntilExpiration} days`
                      : `Expired ${Math.abs(daysUntilExpiration)} days ago`
                    : // Explicit date mode: show "Expires on YYYY-MM-DD"
                      `Expires on ${estimatedDueDate.toISOString().split('T')[0]}`}
                </span>
              )
            })()}
          {(tags.length > 0 || vendors.length > 0 || recipes.length > 0) &&
            !showTags &&
            showTagSummary && (
              <span className="text-xs text-foreground-muted">
                {[
                  tags.length > 0
                    ? `${tags.length} ${tags.length === 1 ? 'tag' : 'tags'}`
                    : null,
                  vendors.length > 0
                    ? `${vendors.length} ${vendors.length === 1 ? 'vendor' : 'vendors'}`
                    : null,
                  recipes.length > 0
                    ? `${recipes.length} ${recipes.length === 1 ? 'recipe' : 'recipes'}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
        </div>
        {tags.length > 0 && showTags && (
          <div className="flex flex-wrap gap-1 mt-2">
            {sortTagsByTypeAndName(tags, tagTypes).map((tag) => {
              const tagType = tagTypes.find((t) => t.id === tag.typeId)
              const bgColor = tagType?.color
              const tagVariant = bgColor
                ? activeTagIds?.includes(tag.id)
                  ? bgColor
                  : (`${bgColor}-inverse` as BadgeProps['variant'])
                : bgColor
              const isTagActive = activeTagIds?.includes(tag.id) ?? false
              return (
                <Badge
                  key={tag.id}
                  data-testid={`tag-badge-${tag.name}`}
                  variant={tagVariant}
                  className={`text-xs ${onTagClick ? 'cursor-pointer' : ''}`}
                  {...(onTagClick
                    ? {
                        role: 'button',
                        tabIndex: 0,
                        'aria-pressed': isTagActive,
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onTagClick(tag.id)
                          }
                        },
                      }
                    : {})}
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
        {vendors.length > 0 && showTags && (
          <div className="flex flex-wrap gap-1 mt-1">
            {vendors.map((vendor) => {
              const isVendorActive =
                activeVendorIds?.includes(vendor.id) ?? false
              return (
                <Badge
                  key={vendor.id}
                  data-testid={`vendor-badge-${vendor.name}`}
                  variant={isVendorActive ? 'neutral' : 'neutral-outline'}
                  className={`gap-1 text-xs normal-case ${onVendorClick ? 'cursor-pointer' : ''}`}
                  {...(onVendorClick
                    ? {
                        role: 'button',
                        tabIndex: 0,
                        'aria-pressed': isVendorActive,
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onVendorClick(vendor.id)
                          }
                        },
                      }
                    : {})}
                  onClick={(e) => {
                    if (onVendorClick) {
                      e.preventDefault()
                      e.stopPropagation()
                      onVendorClick(vendor.id)
                    }
                  }}
                >
                  <Store className="h-3 w-3" />
                  {vendor.name}
                </Badge>
              )
            })}
          </div>
        )}
        {recipes.length > 0 && showTags && (
          <div className="flex flex-wrap gap-1 mt-1">
            {recipes.map((recipe) => {
              const isRecipeActive =
                activeRecipeIds?.includes(recipe.id) ?? false
              return (
                <Badge
                  key={recipe.id}
                  data-testid={`recipe-badge-${recipe.name}`}
                  variant={isRecipeActive ? 'neutral' : 'neutral-outline'}
                  className={`gap-1 text-xs ${onRecipeClick ? 'cursor-pointer' : ''}`}
                  {...(onRecipeClick
                    ? {
                        role: 'button',
                        tabIndex: 0,
                        'aria-pressed': isRecipeActive,
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onRecipeClick(recipe.id)
                          }
                        },
                      }
                    : {})}
                  onClick={(e) => {
                    if (onRecipeClick) {
                      e.preventDefault()
                      e.stopPropagation()
                      onRecipeClick(recipe.id)
                    }
                  }}
                >
                  <CookingPot className="h-3 w-3" />
                  {recipe.name}
                </Badge>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
