import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { VendorInfoForm } from '@/components/vendor/VendorInfoForm'
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
  const { t } = useTranslation()
  const { id } = Route.useParams()
  const { data: vendors = [] } = useVendors()
  const vendor = vendors.find((v) => v.id === id)
  const updateVendor = useUpdateVendor()
  const { registerDirtyState } = useVendorLayout()
  const { goBack } = useAppNavigation()
  const deleteVendor = useDeleteVendor()
  const { data: affectedItemCount = 0 } = useItemCountByVendor(id)

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
    <div className="p-4 bg-background-elevated min-h-[100cqh]">
      <div className="max-w-2xl mx-auto">
        <VendorInfoForm
          vendor={vendor}
          onSave={(data) =>
            updateVendor
              .mutateAsync({ id: vendor.id, updates: data })
              .then(() => goBack())
          }
          isPending={updateVendor.isPending}
          onDirtyChange={registerDirtyState}
        />

        <DeleteButton
          trigger={t('common.delete')}
          dialogTitle={t('settings.vendors.deleteTitle')}
          buttonClassName="mt-4 w-full"
          dialogDescription={
            affectedItemCount > 0
              ? t('settings.vendors.deleteWithItems', {
                  name: vendor.name,
                  count: affectedItemCount,
                })
              : t('settings.vendors.deleteNoItems', { name: vendor.name })
          }
          onDelete={handleDelete}
        />
      </div>
    </div>
  )
}
