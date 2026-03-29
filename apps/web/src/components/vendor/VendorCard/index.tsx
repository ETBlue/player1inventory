import { Link } from '@tanstack/react-router'
import { Store, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { Card, CardContent } from '@/components/ui/card'
import type { Vendor } from '@/types'

interface VendorCardProps {
  vendor: Vendor
  itemCount?: number
  onDelete: () => void
}

export function VendorCard({ vendor, itemCount, onDelete }: VendorCardProps) {
  const { t } = useTranslation()
  return (
    <Card className="py-1">
      <CardContent className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-foreground-muted" />
          <Link
            to="/settings/vendors/$id"
            params={{ id: vendor.id }}
            className="font-medium hover:underline"
          >
            {vendor.name}
          </Link>
          {itemCount !== undefined && (
            <span className="text-sm text-foreground-muted">
              {t('settings.vendors.itemCount', { count: itemCount })}
            </span>
          )}
        </div>
        <DeleteButton
          trigger={<Trash2 className="h-4 w-4" />}
          buttonVariant="destructive-ghost"
          buttonSize="icon"
          buttonAriaLabel={t('settings.vendors.deleteAriaLabel', {
            name: vendor.name,
          })}
          dialogTitle={t('settings.vendors.deleteTitle')}
          dialogDescription={
            (itemCount ?? 0) > 0
              ? t('settings.vendors.deleteWithItems', {
                  name: vendor.name,
                  count: itemCount ?? 0,
                })
              : t('settings.vendors.deleteNoItems', { name: vendor.name })
          }
          onDelete={onDelete}
        />
      </CardContent>
    </Card>
  )
}
