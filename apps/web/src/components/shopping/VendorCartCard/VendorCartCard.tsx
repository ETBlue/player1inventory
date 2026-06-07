import { Store } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
    <Card>
      <button
        type="button"
        className="w-full text-left cursor-pointer"
        onClick={onClick}
      >
        <CardContent className="flex items-center justify-between gap-2">
          <Store className="h-4 w-4 text-foreground-muted mr-2" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p
                className={cn(
                  'font-medium truncate',
                  isNoVendor ? 'normal-case' : 'capitalize',
                )}
              >
                {vendorName}
              </p>
              {totalQuantity > 0 && (
                <Badge variant="primary" className="shrink-0">
                  {t('shopping.cartCard.packsChecked', {
                    count: totalQuantity,
                  })}
                </Badge>
              )}
            </div>
            <p className="text-sm text-foreground-muted">
              {t('shopping.cartCard.inCart', {
                checked: checkedCount,
                total: availableCount,
              })}
            </p>
          </div>
        </CardContent>
      </button>
    </Card>
  )
}
