import { ChevronRight, Store } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
      className="cursor-pointer grid grid-cols-[auto_1fr_auto] items-center gap-4"
      onClick={onClick}
    >
      <Store className="h-4 w-4 text-foreground-muted" />
      <CardHeader>
        <CardTitle className={cn(isNoVendor ? 'normal-case' : 'capitalize')}>
          {vendorName}
          {totalQuantity > 0 && (
            <Badge variant="primary" className="shrink-0">
              {t('shopping.cartCard.packsChecked', {
                count: totalQuantity,
              })}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {t('shopping.cartCard.inCart', {
            checked: checkedCount,
            total: availableCount,
          })}
        </CardDescription>
      </CardHeader>
      <ChevronRight className="h-4 w-4" />
    </Card>
  )
}
