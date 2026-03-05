import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { AddNameDialog } from '@/components/AddNameDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useItem, useUpdateItem, useVendors } from '@/hooks'
import { useCreateVendor } from '@/hooks/useVendors'

export const Route = createFileRoute('/items/$id/vendors')({
  component: VendorsTab,
})

function VendorsTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const { data: vendors = [] } = useVendors()
  const updateItem = useUpdateItem()
  const createVendor = useCreateVendor()
  const [showDialog, setShowDialog] = useState(false)
  const [newVendorName, setNewVendorName] = useState('')

  const toggleVendor = (vendorId: string) => {
    if (!item) return

    const currentVendorIds = item.vendorIds ?? []
    const newVendorIds = currentVendorIds.includes(vendorId)
      ? currentVendorIds.filter((vid) => vid !== vendorId)
      : [...currentVendorIds, vendorId]

    updateItem.mutate({ id, updates: { vendorIds: newVendorIds } })
  }

  const handleAddVendor = () => {
    if (!newVendorName.trim()) return

    createVendor.mutate(newVendorName.trim(), {
      onSuccess: (newVendor) => {
        // Immediately assign to current item
        const currentVendorIds = item?.vendorIds ?? []
        updateItem.mutate({
          id,
          updates: { vendorIds: [...currentVendorIds, newVendor.id] },
        })
        setNewVendorName('')
        setShowDialog(false)
      },
    })
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
                className="cursor-pointer normal-case"
                onClick={() => toggleVendor(vendor.id)}
              >
                {vendor.name}
                {isAssigned && <X className="ml-1 h-3 w-3" />}
              </Badge>
            )
          })}

          <Button
            variant="neutral-ghost"
            size="sm"
            className="px-0 py-0 gap-1 text-xs -my-1"
            onClick={() => setShowDialog(true)}
          >
            <Plus />
            New Vendor
          </Button>
        </div>
      )}

      <AddNameDialog
        open={showDialog}
        title="New Vendor"
        submitLabel="Add Vendor"
        name={newVendorName}
        placeholder="e.g., Costco, iHerb"
        onNameChange={setNewVendorName}
        onAdd={handleAddVendor}
        onClose={() => {
          setNewVendorName('')
          setShowDialog(false)
        }}
      />
    </div>
  )
}
