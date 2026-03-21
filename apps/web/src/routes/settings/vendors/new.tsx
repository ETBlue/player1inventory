import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Toolbar } from '@/components/Toolbar'
import { Button } from '@/components/ui/button'
import { VendorNameForm } from '@/components/vendor/VendorNameForm'
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

  const handleSave = async () => {
    if (!isDirty) return
    const vendor = await createVendor.mutateAsync(name.trim())
    if (vendor?.id) {
      navigate({ to: '/settings/vendors/$id', params: { id: vendor.id } })
    }
  }

  return (
    <div>
      <Toolbar>
        <Button
          variant="neutral-ghost"
          size="icon"
          className="lg:w-auto lg:px-3"
          onClick={goBack}
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden lg:inline ml-1">Back</span>
        </Button>
        <h1>New Vendor</h1>
      </Toolbar>
      <div className="px-6 py-4">
        <VendorNameForm
          name={name}
          onNameChange={setName}
          onSave={handleSave}
          isDirty={isDirty}
          isPending={createVendor.isPending}
        />
      </div>
    </div>
  )
}
