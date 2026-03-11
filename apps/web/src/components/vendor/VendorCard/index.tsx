import { Link } from '@tanstack/react-router'
import { Store, Trash2 } from 'lucide-react'
import { DeleteButton } from '@/components/DeleteButton'
import { Card, CardContent } from '@/components/ui/card'
import type { Vendor } from '@/types'

interface VendorCardProps {
  vendor: Vendor
  itemCount?: number
  onDelete: () => void
}

export function VendorCard({ vendor, itemCount, onDelete }: VendorCardProps) {
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
              · {itemCount} items
            </span>
          )}
        </div>
        <DeleteButton
          trigger={<Trash2 className="h-4 w-4" />}
          buttonVariant="destructive-ghost"
          buttonSize="icon"
          buttonClassName="h-8 w-8"
          buttonAriaLabel={`Delete ${vendor.name}`}
          dialogTitle="Delete Vendor?"
          dialogDescription={
            (itemCount ?? 0) > 0 ? (
              <>
                <strong>{vendor.name}</strong> will be removed from {itemCount}{' '}
                item{itemCount !== 1 ? 's' : ''}.
              </>
            ) : (
              <>
                No items are assigned to <strong>{vendor.name}</strong>.
              </>
            )
          }
          onDelete={onDelete}
        />
      </CardContent>
    </Card>
  )
}
