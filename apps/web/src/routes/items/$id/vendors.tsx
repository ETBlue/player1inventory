import { createFileRoute } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { TopBarSaveButton } from '@/components/item/TopBarSaveButton'
import { AddNameDialog } from '@/components/shared/AddNameDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useItem, useUpdateItem, useVendors } from '@/hooks'
import { usePermissions } from '@/hooks/usePermissions'
import { useRelationDraft } from '@/hooks/useRelationDraft'
import { useRelationTabSave } from '@/hooks/useRelationTabSave'
import { useCreateVendor } from '@/hooks/useVendors'
import { pressOnEnterOrSpace } from '@/lib/pressKeys'
import { showSaveError } from '@/lib/saveError'
import { showVendorCreateError } from '@/lib/vendorCreateError'

export const Route = createFileRoute('/items/$id/vendors')({
  component: VendorsTab,
})

function VendorsTab() {
  const { t } = useTranslation()
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const { data: vendors } = useVendors()
  const updateItem = useUpdateItem()
  const createVendor = useCreateVendor()
  // A household member sees what is assigned and cannot change it
  // (households H5 task F.5): presses do nothing, the badges are
  // aria-disabled, and there is no "New …" button and no Save.
  const { canEditCatalog } = usePermissions()
  const [showDialog, setShowDialog] = useState(false)
  const [newVendorName, setNewVendorName] = useState('')
  // A press changes only the screen; the top bar Save writes the list (item
  // relations Save, design
  // `docs/features/items/2026-11-27-item-relations-save-design.md`). The
  // draft replaces the issue #402 state (`assigningVendorIds`) and the
  // press spinner (`togglingVendorId`): a new vendor goes into the draft the
  // moment it is created, so it shows as selected through the same rule as
  // a press.
  const draft = useRelationDraft(
    item?.vendorIds ?? [],
    vendors?.map((vendor) => vendor.id),
    { canEdit: canEditCatalog },
  )
  const saving = updateItem.isPending

  const save = async (): Promise<boolean> => {
    if (!item) return false
    // The list on screen now. Kept, so the end of the Save takes out of the
    // draft only what was sent: a row created while the Save runs stays.
    const sent = draft.shown
    try {
      // Cloud: a vendor list is configuration, so no location is resolved
      // and this works in a household with no location
      await updateItem.mutateAsync({
        id,
        updates: { vendorIds: sent },
      })
    } catch (err) {
      // The draft stays, so the person can press Save again
      showSaveError(err, { catalog: true })
      return false
    }
    // The item already has the saved list here: local `mutateAsync` waits
    // for the refetch, and Apollo writes the answer to its cache first. So
    // emptying the draft does not flicker the badges back.
    draft.reset(sent)
    toast.success(t('items.detail.saved'))
    return true
  }

  const { canSave, saveSlot } = useRelationTabSave({
    dirty: draft.dirty,
    isPending: saving,
    canEdit: canEditCatalog,
    save,
  })

  const toggleVendor = (vendorId: string) => {
    // No press while a Save runs (owner answer 9A): the list sent is the
    // list on screen
    if (!item || !canEditCatalog || saving) return
    draft.press(vendorId)
  }

  const handleAddVendor = async () => {
    const name = newVendorName.trim()
    if (!name) return

    let newVendor: Awaited<ReturnType<typeof createVendor.mutateAsync>>
    try {
      newVendor = await createVendor.mutateAsync(name)
    } catch (err) {
      // The dialog stays open, so the user can try again. Not
      // `showSaveError`: this one says why a FORBIDDEN was refused, and
      // `createVendor` also writes a cart.
      showVendorCreateError(err, name)
      return
    }
    setNewVendorName('')
    setShowDialog(false)
    // The vendor is created at once (owner answer 1A), but only Save gives
    // it to the item. Until then it is shown as selected. Discard keeps the
    // vendor, not assigned.
    if (newVendor?.id) draft.add(newVendor.id)
  }

  if (!item) return null

  const sortedVendors = [...(vendors ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <TopBarSaveButton
        saveSlot={saveSlot}
        onClick={save}
        disabled={!canSave}
        isLoading={saving}
      />
      <div className="flex flex-wrap gap-2">
        {sortedVendors.map((vendor) => {
          const isAssigned = draft.shown.includes(vendor.id)

          return (
            <Badge
              key={vendor.id}
              role="button"
              aria-pressed={isAssigned}
              aria-disabled={!canEditCatalog || saving || undefined}
              // Reached by Tab and pressed with Enter or Space (owner answer
              // 8A). A read-only badge is not in the Tab order.
              tabIndex={canEditCatalog ? 0 : undefined}
              variant={isAssigned ? 'neutral' : 'neutral-outline'}
              className={`${canEditCatalog ? 'cursor-pointer' : 'cursor-default'} normal-case`}
              onClick={() => toggleVendor(vendor.id)}
              onKeyDown={
                canEditCatalog
                  ? pressOnEnterOrSpace(() => toggleVendor(vendor.id))
                  : undefined
              }
            >
              {vendor.name}
              {isAssigned && <X className="ml-1 h-3 w-3" />}
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

      {draft.shown.length === 0 && (
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
