import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import { VendorInfoForm } from '@/components/vendor/VendorInfoForm'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useCreateVendor } from '@/hooks/useVendors'

export const Route = createFileRoute('/settings/vendors/new')({
  component: NewVendorPage,
})

function NewVendorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { goBack } = useAppNavigation('/settings/vendors')
  const createVendor = useCreateVendor()

  const emptyVendor = { id: '', name: '', createdAt: new Date() }

  const handleSave = async ({ name }: { name: string }) => {
    const vendor = await createVendor.mutateAsync(name)
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
          className="lg:w-auto lg:mr-3"
          onClick={goBack}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden lg:inline">{t('common.goBack')}</span>
        </Button>
        <h1>{t('settings.vendors.newButton')}</h1>
      </Toolbar>
      <div className="p-4">
        <div className="max-w-2xl mx-auto">
          <VendorInfoForm
            vendor={emptyVendor}
            onSave={handleSave}
            isPending={createVendor.isPending}
          />
        </div>
      </div>
    </div>
  )
}
