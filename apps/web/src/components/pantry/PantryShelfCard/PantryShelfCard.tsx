import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ItemCard } from '@/components/item/ItemCard'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import type { Item, Shelf } from '@/types'

interface PantryShelfCardProps {
  shelf: Shelf
  items: Item[]
  isExpanded: boolean
  onToggle: () => void
}

export function PantryShelfCard({
  shelf,
  items,
  isExpanded,
  onToggle,
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

  return (
    <div className="flex flex-col">
      <Card className="flex items-center gap-2">
        <button
          type="button"
          className="flex-1 flex items-center justify-between gap-2 min-w-0 text-left cursor-pointer"
          onClick={onToggle}
          aria-expanded={isExpanded}
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
        <div className="flex flex-col gap-2 mt-2 pl-4">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} tags={[]} tagTypes={[]} />
          ))}
        </div>
      )}
    </div>
  )
}
