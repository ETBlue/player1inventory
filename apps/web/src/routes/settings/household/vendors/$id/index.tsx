import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { ReadOnlyNote } from '@/components/shared/ReadOnlyNote'
import { VendorInfoForm } from '@/components/vendor/VendorInfoForm'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { usePermissions } from '@/hooks/usePermissions'
import { useVendorLayout } from '@/hooks/useVendorLayout'
import {
  useDeleteVendor,
  useItemCountByVendor,
  useUpdateVendor,
  useVendors,
} from '@/hooks/useVendors'

export const Route = createFileRoute('/settings/household/vendors/$id/')({
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
  // A household member sees this page read only (households H5 task F.5)
  const {
    canEditCatalog,
    roleKnown,
    isLoading: rolesLoading,
  } = usePermissions()

  const handleDelete = async () => {
    if (!vendor) return
    deleteVendor.mutate(id, {
      onSuccess: () => {
        goBack()
      },
    })
  }

  if (!vendor) return null
  // Wait for the household role before the form mounts. The name field has
  // `autoFocus={!readOnly}`, and React focuses only on mount: a form mounted
  // read-only while the role loads would never take the focus for an owner.
  // When the role cannot be read at all, `isLoading` is false and the form
  // shows read-only (the safe default), with no note (`roleKnown` is false).
  if (rolesLoading) return null

  return (
    <div className="p-4 bg-background-elevated min-h-[100cqh]">
      <div className="max-w-2xl mx-auto">
        {roleKnown && !canEditCatalog && (
          <ReadOnlyNote
            className="px-0"
            text={t('settings.catalogReadOnlyItem')}
          />
        )}
        <VendorInfoForm
          vendor={vendor}
          onSave={(data) =>
            updateVendor
              .mutateAsync({ id: vendor.id, updates: data })
              .then(() => goBack())
          }
          isPending={updateVendor.isPending}
          onDirtyChange={registerDirtyState}
          readOnly={!canEditCatalog}
        />
        {canEditCatalog && (
          <div className="max-w-2xl mx-auto">
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
        )}
      </div>
    </div>
  )
}
