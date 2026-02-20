import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { Toolbar } from '@/components/Toolbar'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { VendorCard } from '@/components/VendorCard'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useVendorItemCounts } from '@/hooks/useVendorItemCounts'
import {
  useDeleteVendor,
  useItemCountByVendor,
  useVendors,
} from '@/hooks/useVendors'
import type { Vendor } from '@/types'

export const Route = createFileRoute('/settings/vendors/')({
  component: VendorSettings,
})

function VendorSettings() {
  const navigate = useNavigate()
  const { goBack } = useAppNavigation('/settings')
  const { data: vendors = [] } = useVendors()
  const deleteVendor = useDeleteVendor()
  const vendorCounts = useVendorItemCounts()

  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null)

  const vendorDeleteId = vendorToDelete?.id ?? ''
  const { data: vendorItemCount = 0 } = useItemCountByVendor(vendorDeleteId)

  const sortedVendors = [...vendors].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  const handleConfirmDelete = () => {
    if (vendorToDelete) {
      deleteVendor.mutate(vendorToDelete.id)
      setVendorToDelete(null)
    }
  }

  return (
    <div className="space-y-4">
      <Toolbar className="justify-between">
        <div className="flex items-center gap-2">
          <Button variant="neutral-ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Vendors</h1>
        </div>
        <Button onClick={() => navigate({ to: '/settings/vendors/new' })}>
          <Plus className="h-4 w-4 mr-2" />
          New Vendor
        </Button>
      </Toolbar>

      {sortedVendors.length === 0 ? (
        <p className="text-foreground-muted text-sm">
          No vendors yet. Add your first vendor.
        </p>
      ) : (
        <div className="space-y-2">
          {sortedVendors.map((vendor) => (
            <VendorCard
              key={vendor.id}
              vendor={vendor}
              itemCount={vendorCounts.get(vendor.id) ?? 0}
              onDelete={() => setVendorToDelete(vendor)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!vendorToDelete}
        onOpenChange={(open) => !open && setVendorToDelete(null)}
        title={`Delete "${vendorToDelete?.name}"?`}
        description={`This will remove "${vendorToDelete?.name}" from ${vendorItemCount} item${vendorItemCount === 1 ? '' : 's'}.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        destructive
      />
    </div>
  )
}
