import { createFileRoute } from '@tanstack/react-router'
import { Loader2, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AddNameDialog } from '@/components/shared/AddNameDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useItem, useUpdateItem, useVendors } from '@/hooks'
import { usePermissions } from '@/hooks/usePermissions'
import { useCreateVendor } from '@/hooks/useVendors'
import { showSaveError } from '@/lib/saveError'
import { showVendorCreateError } from '@/lib/vendorCreateError'

export const Route = createFileRoute('/items/$id/vendors')({
  component: VendorsTab,
})

function VendorsTab() {
  const { t } = useTranslation()
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const { data: vendors = [] } = useVendors()
  const updateItem = useUpdateItem()
  const createVendor = useCreateVendor()
  // A household member sees what is assigned and cannot change it
  // (households H5 task F.5): presses write nothing, the badges are
  // aria-disabled, and there is no "New …" button.
  const { canEditCatalog } = usePermissions()
  const [showDialog, setShowDialog] = useState(false)
  const [newVendorName, setNewVendorName] = useState('')
  const [togglingVendorId, setTogglingVendorId] = useState<string | null>(null)
  // Issue #402: a new vendor is created, then assigned to the item in a
  // second write. Between the two, the vendor list already shows the new
  // vendor but the item does not have it yet, so it showed as not selected
  // for about a second. Its id waits here until the assign is done, and the
  // page shows it as selected all that time. On a failed assign it is
  // removed, so the badge goes back to not selected.
  const [assigningVendorIds, setAssigningVendorIds] = useState<string[]>([])
  // What the user sees as assigned: the item's vendors, plus new vendors
  // whose assign is still being saved.
  const itemVendorIds = item?.vendorIds ?? []
  const shownVendorIds = [
    ...itemVendorIds,
    ...assigningVendorIds.filter((vid) => !itemVendorIds.includes(vid)),
  ]

  useEffect(() => {
    if (!updateItem.isPending) setTogglingVendorId(null)
  }, [updateItem.isPending])

  const toggleVendor = (vendorId: string) => {
    // No toggle while a new vendor is being assigned. Each write sends the
    // WHOLE list, so a second write at the same time could leave out the
    // other one's change, depending on which one the server takes last.
    if (!item || !canEditCatalog || assigningVendorIds.length > 0) return

    const currentVendorIds = item.vendorIds ?? []
    const newVendorIds = currentVendorIds.includes(vendorId)
      ? currentVendorIds.filter((vid) => vid !== vendorId)
      : [...currentVendorIds, vendorId]

    setTogglingVendorId(vendorId)
    // `mutate` never rejects, so the failure comes in through `onError`.
    // Before, it was ignored and a failed save showed nothing.
    updateItem.mutate(
      { id, updates: { vendorIds: newVendorIds } },
      { onError: (err) => showSaveError(err) },
    )
  }

  const handleAddVendor = async () => {
    const name = newVendorName.trim()
    if (!name) return

    let newVendor: Awaited<ReturnType<typeof createVendor.mutateAsync>>
    try {
      newVendor = await createVendor.mutateAsync(name)
    } catch (err) {
      // The dialog stays open, so the user can try again.
      showVendorCreateError(err, name)
      return
    }
    // The vendor exists now, so the dialog closes even if the assign below
    // fails; the toast says so.
    setNewVendorName('')
    setShowDialog(false)
    if (newVendor?.id) {
      const newVendorId = newVendor.id
      setAssigningVendorIds((ids) => [...ids, newVendorId])
      // Immediately assign to the current item. The list keeps any other new
      // vendor that is still being assigned.
      try {
        await updateItem.mutateAsync({
          id,
          updates: {
            vendorIds: [...new Set([...shownVendorIds, newVendorId])],
          },
        })
      } catch (err) {
        showSaveError(err)
      } finally {
        // When the write has succeeded, the item already has the vendor:
        // local `mutateAsync` waits for the refetch, and Apollo writes the
        // answer to its cache before it resolves.
        setAssigningVendorIds((ids) => ids.filter((x) => x !== newVendorId))
      }
    }
  }

  if (!item) return null

  const sortedVendors = [...vendors].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div className="flex flex-wrap gap-2">
        {sortedVendors.map((vendor) => {
          const isAssigned = shownVendorIds.includes(vendor.id)
          const isAssigning = assigningVendorIds.includes(vendor.id)

          return (
            <Badge
              key={vendor.id}
              role="button"
              aria-pressed={isAssigned}
              aria-busy={isAssigning || undefined}
              aria-disabled={!canEditCatalog || undefined}
              variant={isAssigned ? 'neutral' : 'neutral-outline'}
              className={`${canEditCatalog ? 'cursor-pointer' : 'cursor-default'} normal-case${updateItem.isPending && togglingVendorId === vendor.id ? ' pointer-events-none' : ''}`}
              onClick={() => toggleVendor(vendor.id)}
            >
              {vendor.name}
              {updateItem.isPending && togglingVendorId === vendor.id ? (
                <Loader2 className="ml-1 h-3 w-3 animate-spin [transform-box:fill-box]" />
              ) : (
                isAssigned && <X className="ml-1 h-3 w-3" />
              )}
            </Badge>
          )
        })}

        {canEditCatalog && (
          <Button
            variant="neutral-ghost"
            size="sm"
            className="px-0 py-0 gap-1 text-xs -my-1"
            onClick={() => setShowDialog(true)}
          >
            <Plus />
            {t('items.vendors.newVendor.button')}
          </Button>
        )}
      </div>

      {shownVendorIds.length === 0 && (
        <EmptyState
          title={t('items.vendors.assignEmpty.title')}
          description={t('items.vendors.assignEmpty.description')}
        />
      )}

      <AddNameDialog
        open={showDialog}
        title={t('items.vendors.newVendor.dialogTitle')}
        submitLabel={t('items.vendors.newVendor.submitLabel')}
        name={newVendorName}
        placeholder={t('items.vendors.newVendor.placeholder')}
        isPending={createVendor.isPending}
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
