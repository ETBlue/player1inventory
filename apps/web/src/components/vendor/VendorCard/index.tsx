import { Link } from '@tanstack/react-router'
import { Store, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import type { Vendor } from '@/types'

interface VendorCardProps {
  vendor: Vendor
  itemCount?: number
  onDelete: () => void
  variant?: 'default' | 'template'
  selected?: boolean
  onToggle?: () => void
}

export function VendorCard({
  vendor,
  itemCount,
  onDelete,
  variant = 'default',
  selected = false,
  onToggle,
}: VendorCardProps) {
  const { t } = useTranslation()
  const isTemplate = variant === 'template'

  return (
    <Card className="py-1">
      <CardContent className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isTemplate && (
            <Checkbox
              checked={selected}
              onCheckedChange={() => onToggle?.()}
              aria-label={
                selected ? `Deselect ${vendor.name}` : `Select ${vendor.name}`
              }
            />
          )}
          <Store className="h-4 w-4 text-foreground-muted" />
          <Link
            to="/settings/vendors/$id"
            params={{ id: vendor.id }}
            className="font-medium hover:underline"
          >
            {vendor.name}
          </Link>
          {!isTemplate && itemCount !== undefined && (
            <span className="text-sm text-foreground-muted">
              {t('settings.vendors.itemCount', { count: itemCount })}
            </span>
          )}
        </div>
        {!isTemplate && (
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
      </CardContent>
    </Card>
  )
}
