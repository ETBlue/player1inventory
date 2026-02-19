import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { VendorNameForm } from '@/components/VendorNameForm'
import { useVendorLayout } from '@/hooks/useVendorLayout'
import { useUpdateVendor, useVendors } from '@/hooks/useVendors'

export const Route = createFileRoute('/settings/vendors/$id/')({
  component: VendorInfoTab,
})

function VendorInfoTab() {
  const { id } = Route.useParams()
  const { data: vendors = [] } = useVendors()
  const vendor = vendors.find((v) => v.id === id)
  const updateVendor = useUpdateVendor()
  const { registerDirtyState } = useVendorLayout()

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
      { onSuccess: () => setSavedAt((n) => n + 1) },
    )
  }

  if (!vendor) return null

  return (
    <VendorNameForm
      name={name}
      onNameChange={setName}
      onSave={handleSave}
      isDirty={isDirty}
      isPending={updateVendor.isPending}
    />
  )
}
