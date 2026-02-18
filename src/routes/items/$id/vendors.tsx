import { createFileRoute, Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useItem, useUpdateItem, useVendors } from '@/hooks'

export const Route = createFileRoute('/items/$id/vendors')({
  component: VendorsTab,
})

function VendorsTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const { data: vendors = [] } = useVendors()
  const updateItem = useUpdateItem()

  const toggleVendor = (vendorId: string) => {
    if (!item) return

    const currentVendorIds = item.vendorIds ?? []
    const newVendorIds = currentVendorIds.includes(vendorId)
      ? currentVendorIds.filter((vid) => vid !== vendorId)
      : [...currentVendorIds, vendorId]

    updateItem.mutate({ id, updates: { vendorIds: newVendorIds } })
  }

  if (!item) return null

  const sortedVendors = [...vendors].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  return (
    <div className="space-y-6 max-w-2xl">
      {sortedVendors.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          No vendors yet.{' '}
          <Link to="/settings/vendors" className="underline">
            Add vendors in Settings → Vendors
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sortedVendors.map((vendor) => {
            const isAssigned = (item.vendorIds ?? []).includes(vendor.id)

            return (
              <Badge
                key={vendor.id}
                variant={isAssigned ? 'neutral' : 'neutral-outline'}
                className="cursor-pointer"
                onClick={() => toggleVendor(vendor.id)}
              >
                {vendor.name}
                {isAssigned && <X className="ml-1 h-3 w-3" />}
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}
