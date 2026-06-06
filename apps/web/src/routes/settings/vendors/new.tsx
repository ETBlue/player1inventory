import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { LayoutInnerPages } from '@/components/shared/LayoutInnerPages'
import { VendorInfoForm } from '@/components/vendor/VendorInfoForm'
import { useCreateVendor } from '@/hooks/useVendors'

export const Route = createFileRoute('/settings/vendors/new')({
  component: NewVendorPage,
})

function NewVendorPage() {
  // Fallback route — users do not reach this page through normal app navigation.
  // New vendors are created via NewVendorDialog. This route exists for direct URL access only.
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createVendor = useCreateVendor()

  const emptyVendor = { id: '', name: '', createdAt: new Date() }

  const handleSave = async ({ name }: { name: string }) => {
    const vendor = await createVendor.mutateAsync(name)
    if (vendor?.id) {
      navigate({ to: '/settings/vendors/$id', params: { id: vendor.id } })
    }
  }

  return (
    <LayoutInnerPages title={t('settings.vendors.newButton')}>
      <div className="p-4">
        <div className="max-w-2xl mx-auto">
          <VendorInfoForm
            vendor={emptyVendor}
            onSave={handleSave}
            isPending={createVendor.isPending}
          />
        </div>
      </div>
    </LayoutInnerPages>
  )
}
