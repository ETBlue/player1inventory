import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { VendorCard } from '@/components/VendorCard'
import { VendorFormDialog } from '@/components/VendorFormDialog'
import {
  useCreateVendor,
  useDeleteVendor,
  useUpdateVendor,
  useVendors,
} from '@/hooks/useVendors'
import type { Vendor } from '@/types'

export const Route = createFileRoute('/settings/vendors')({
  component: VendorSettings,
})

function VendorSettings() {
  const navigate = useNavigate()
  const { data: vendors = [] } = useVendors()
  const createVendor = useCreateVendor()
  const updateVendor = useUpdateVendor()
  const deleteVendor = useDeleteVendor()

  const [formOpen, setFormOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | undefined>()
  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null)

  const sortedVendors = [...vendors].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  const handleOpenCreate = () => {
    setEditingVendor(undefined)
    setFormOpen(true)
  }

  const handleOpenEdit = (vendor: Vendor) => {
    setEditingVendor(vendor)
    setFormOpen(true)
  }

  const handleSave = (name: string) => {
    if (editingVendor) {
      updateVendor.mutate(
        { id: editingVendor.id, updates: { name } },
        { onSuccess: () => setFormOpen(false) },
      )
    } else {
      createVendor.mutate(name, { onSuccess: () => setFormOpen(false) })
    }
  }

  const handleConfirmDelete = () => {
    if (vendorToDelete) {
      deleteVendor.mutate(vendorToDelete.id, {
        onSuccess: () => setVendorToDelete(null),
      })
      setVendorToDelete(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="neutral-ghost"
            size="icon"
            onClick={() => navigate({ to: '/settings' })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Vendors</h1>
        </div>
        <Button aria-label="New Vendor" onClick={handleOpenCreate}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

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
              onEdit={() => handleOpenEdit(vendor)}
              onDelete={() => setVendorToDelete(vendor)}
            />
          ))}
        </div>
      )}

      <VendorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        vendor={editingVendor}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={!!vendorToDelete}
        onOpenChange={(open) => !open && setVendorToDelete(null)}
        title={`Delete "${vendorToDelete?.name}"?`}
        description="This will remove the vendor. Items assigned to this vendor will not be affected."
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        destructive
      />
    </div>
  )
}
