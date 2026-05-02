import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, Settings } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { ItemCard } from '@/components/item/ItemCard'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { getCurrentQuantity, isInactive } from '@/lib/quantityUtils'
import type { Item, Recipe, Shelf, Tag, TagType, Vendor } from '@/types'

interface PantryShelfCardProps {
  shelf: Shelf
  items: Item[]
  isExpanded: boolean
  onToggle: () => void
  // Optional rich item-card props (pantry page passes all of these)
  search?: string
  tags?: Tag[]
  tagTypes?: TagType[]
  isTagsVisible?: boolean
  vendorMap?: Map<string, Vendor[]>
  recipeMap?: Map<string, Recipe[]>
  selectedVendorIds?: string[]
  selectedRecipeIds?: string[]
  activeTagIds?: string[]
  onAmountChange?: (item: Item, delta: number) => void
  onTagClick?: (tagId: string) => void
  onVendorClick?: (vendorId: string) => void
  onRecipeClick?: (recipeId: string) => void
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-100 dark:bg-yellow-800 rounded-sm not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export function PantryShelfCard({
  shelf,
  items,
  isExpanded,
  onToggle,
  search = '',
  tags = [],
  tagTypes = [],
  isTagsVisible = false,
  vendorMap = new Map(),
  recipeMap = new Map(),
  selectedVendorIds = [],
  selectedRecipeIds = [],
  activeTagIds = [],
  onAmountChange,
  onTagClick,
  onVendorClick,
  onRecipeClick,
}: PantryShelfCardProps) {
  const { t } = useTranslation()

  const totalCount = items.length
  const outOfStockCount = items.filter((item) => {
    const qty = getCurrentQuantity(item)
    return qty === 0
  }).length
  const lowStockCount = items.filter((item) => {
    const qty = getCurrentQuantity(item)
    return qty > 0 && qty <= item.refillThreshold
  }).length

  const activeItems = items.filter((item) => !isInactive(item))
  const inactiveItems = items.filter((item) => isInactive(item))

  return (
    <div className="flex flex-col">
      <Card className="flex items-center gap-2">
        <button
          type="button"
          className="flex-1 flex items-center justify-between gap-2 min-w-0 text-left cursor-pointer"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-label={
            isExpanded
              ? t('pantry.shelfCard.collapse', {
                  name: shelf.name,
                  defaultValue: `Collapse ${shelf.name}`,
                })
              : t('pantry.shelfCard.expand', {
                  name: shelf.name,
                  defaultValue: `Expand ${shelf.name}`,
                })
          }
        >
          <CardContent className="flex-1 flex items-center justify-between gap-2 py-0 px-0 min-w-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {isExpanded ? (
                <ChevronDown className="h-5 w-5 shrink-0 text-foreground-muted" />
              ) : (
                <ChevronRight className="h-5 w-5 shrink-0 text-foreground-muted" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium capitalize truncate">{shelf.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-sm text-foreground-muted">
                    {t('pantry.shelfCard.items', { count: totalCount })}
                  </span>
                  {lowStockCount > 0 && (
                    <Badge variant="warning" className="text-xs">
                      {t('pantry.shelfCard.lowStock', { count: lowStockCount })}
                    </Badge>
                  )}
                  {outOfStockCount > 0 && (
                    <Badge variant="error" className="text-xs">
                      {t('pantry.shelfCard.outOfStock', {
                        count: outOfStockCount,
                      })}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </button>
        {shelf.type !== 'system' && (
          <Link
            to="/settings/shelves/$shelfId"
            params={{ shelfId: shelf.id }}
            aria-label={t('pantry.shelfCard.settings')}
            className="shrink-0 p-2 text-foreground-muted hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <Settings className="h-4 w-4" />
          </Link>
        )}
      </Card>
      {isExpanded && (
        <div className="flex flex-col gap-px mt-2">
          {activeItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              tags={tags.filter((t) => item.tagIds.includes(t.id))}
              tagTypes={tagTypes}
              showTags={isTagsVisible}
              vendors={vendorMap.get(item.id) ?? []}
              recipes={recipeMap.get(item.id) ?? []}
              activeVendorIds={selectedVendorIds}
              activeRecipeIds={selectedRecipeIds}
              activeTagIds={activeTagIds}
              highlightedName={
                search.trim() ? highlight(item.name, search) : undefined
              }
              {...(onAmountChange
                ? {
                    onAmountChange: (delta: number) =>
                      onAmountChange(item, delta),
                  }
                : {})}
              {...(onTagClick ? { onTagClick } : {})}
              {...(onVendorClick ? { onVendorClick } : {})}
              {...(onRecipeClick ? { onRecipeClick } : {})}
            />
          ))}
          {inactiveItems.length > 0 && (
            <div className="bg-background-surface px-3 py-2 text-foreground-muted text-center text-sm">
              {inactiveItems.length} inactive item
              {inactiveItems.length !== 1 ? 's' : ''}
            </div>
          )}
          {inactiveItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              tags={tags.filter((t) => item.tagIds.includes(t.id))}
              tagTypes={tagTypes}
              showTags={isTagsVisible}
              vendors={vendorMap.get(item.id) ?? []}
              recipes={recipeMap.get(item.id) ?? []}
              activeVendorIds={selectedVendorIds}
              activeRecipeIds={selectedRecipeIds}
              activeTagIds={activeTagIds}
              highlightedName={
                search.trim() ? highlight(item.name, search) : undefined
              }
              {...(onAmountChange
                ? {
                    onAmountChange: (delta: number) =>
                      onAmountChange(item, delta),
                  }
                : {})}
              {...(onTagClick ? { onTagClick } : {})}
              {...(onVendorClick ? { onVendorClick } : {})}
              {...(onRecipeClick ? { onRecipeClick } : {})}
            />
          ))}
          {items.length === 0 && (
            <div className="text-center py-6 text-foreground-muted text-sm">
              {t('pantry.shelfCard.noItems', { defaultValue: 'No items' })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
