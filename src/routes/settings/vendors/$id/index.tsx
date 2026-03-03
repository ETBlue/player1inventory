import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { DeleteButton } from '@/components/DeleteButton'
import { VendorNameForm } from '@/components/VendorNameForm'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useVendorLayout } from '@/hooks/useVendorLayout'
import {
  useDeleteVendor,
  useItemCountByVendor,
  useUpdateVendor,
  useVendors,
} from '@/hooks/useVendors'

export const Route = createFileRoute('/settings/vendors/$id/')({
  component: VendorInfoTab,
})

function VendorInfoTab() {
  const { id } = Route.useParams()
  const { data: vendors = [] } = useVendors()
  const vendor = vendors.find((v) => v.id === id)
  const updateVendor = useUpdateVendor()
  const { registerDirtyState } = useVendorLayout()
  const { goBack } = useAppNavigation()
  const deleteVendor = useDeleteVendor()
  const { data: affectedItemCount = 0 } = useItemCountByVendor(id)

  const [name, setName] = useState('')
  const [savedAt, setSavedAt] = useState(0)

  // Sync name when vendor loads or after save
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally sync only on id change or after save
  useEffect(() => {
    if (vendor) {
      setName(vendor.name)
    }
  }, [vendor?.id, savedAt])

  const isDirty = vendor ? name !== vendor.name : false

  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const handleSave = () => {
    if (!vendor || !isDirty) return
    updateVendor.mutate(
      { id, updates: { name } },
      {
        onSuccess: () => {
          setSavedAt((n) => n + 1)
          goBack()
        },
      },
    )
  }

  const handleDelete = async () => {
    if (!vendor) return
    deleteVendor.mutate(id, {
      onSuccess: () => {
        goBack()
      },
    })
  }

  if (!vendor) return null

  return (
    <div className="px-6 py-4">
      <VendorNameForm
        name={name}
        onNameChange={setName}
        onSave={handleSave}
        isDirty={isDirty}
        isPending={updateVendor.isPending}
      />

      <DeleteButton
        trigger="Delete"
        dialogTitle="Delete Vendor?"
        buttonClassName="mt-4 w-full max-w-2xl"
        dialogDescription={
          affectedItemCount > 0 ? (
            <>
              <strong>{vendor.name}</strong> will be removed from{' '}
              {affectedItemCount} item{affectedItemCount !== 1 ? 's' : ''}.
            </>
          ) : (
            <>
              No items are assigned to <strong>{vendor.name}</strong>.
            </>
          )
        }
        onDelete={handleDelete}
      />
    </div>
  )
}
