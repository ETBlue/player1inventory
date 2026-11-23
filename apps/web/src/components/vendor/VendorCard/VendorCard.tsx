import { Link } from '@tanstack/react-router'
import { Store, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { Card, CardMetadata, CardTitle } from '@/components/ui/card'
import type { Vendor } from '@/types'

interface VendorCardProps {
  vendor: Vendor
  itemCount?: number
  /**
   * Left out for a household member, who may not delete vendors (households
   * H5 task F.5). The card then has no Delete button.
   */
  /** Return the delete's promise, so `DeleteButton` can show a failure */
  onDelete?: () => void | Promise<void>
}

export function VendorCard({ vendor, itemCount, onDelete }: VendorCardProps) {
  const { t } = useTranslation()

  return (
    <Card className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 py-1">
      <Store className="h-4 w-4 text-foreground-muted" />
      <CardTitle>
        <Link
          to="/settings/household/vendors/$id"
          params={{ id: vendor.id }}
          className="font-medium hover:underline"
        >
          {vendor.name}
        </Link>
      </CardTitle>
      {itemCount !== undefined && (
        <CardMetadata>
          {t('settings.vendors.itemCount', { count: itemCount })}
        </CardMetadata>
      )}
      {onDelete && (
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
      )}
    </Card>
  )
}
