import { ChevronRight, Store } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardMetadata, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface VendorCartCardProps {
  vendorName: string
  isNoVendor?: boolean
  checkedCount: number
  totalQuantity: number
  availableCount: number
  onClick: () => void
}

export function VendorCartCard({
  vendorName,
  isNoVendor = false,
  checkedCount,
  totalQuantity,
  availableCount,
  onClick,
}: VendorCartCardProps) {
  const { t } = useTranslation()
  return (
    <Card
      role="button"
      tabIndex={0}
      className="cursor-pointer grid grid-cols-[auto_1fr_auto] items-center gap-4"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <Store className="h-4 w-4 text-foreground-muted" />
      <CardHeader>
        <CardTitle className={cn(isNoVendor ? 'normal-case' : 'capitalize')}>
          {vendorName}
        </CardTitle>
        <CardMetadata>
          {[
            t('shopping.cartCard.inVendor', {
              count: availableCount,
            }),
            checkedCount > 0
              ? t('shopping.cartCard.inCart', {
                  count: checkedCount,
                })
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </CardMetadata>
      </CardHeader>
      <div className="flex items-center gap-2">
        {totalQuantity > 0 && (
          <Badge variant="neutral-outline">
            {t('shopping.cartCard.packsChecked', {
              count: totalQuantity,
            })}
          </Badge>
        )}
        <ChevronRight className="h-4 w-4" />
      </div>
    </Card>
  )
}
