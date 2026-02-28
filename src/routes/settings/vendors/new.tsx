import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Toolbar } from '@/components/Toolbar'
import { Button } from '@/components/ui/button'
import { VendorNameForm } from '@/components/VendorNameForm'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useCreateVendor } from '@/hooks/useVendors'

export const Route = createFileRoute('/settings/vendors/new')({
  component: NewVendorPage,
})

function NewVendorPage() {
  const navigate = useNavigate()
  const { goBack } = useAppNavigation('/settings/vendors')
  const createVendor = useCreateVendor()
  const [name, setName] = useState('')

  const isDirty = name.trim() !== ''

  const handleSave = () => {
    if (!isDirty) return
    createVendor.mutate(name.trim(), {
      onSuccess: (vendor) => {
        navigate({ to: '/settings/vendors/$id', params: { id: vendor.id } })
      },
    })
  }

  return (
    <div className="space-y-4">
      <Toolbar>
        <Button variant="neutral-ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">New Vendor</h1>
      </Toolbar>
      <VendorNameForm
        name={name}
        onNameChange={setName}
        onSave={handleSave}
        isDirty={isDirty}
        isPending={createVendor.isPending}
      />
    </div>
  )
}
