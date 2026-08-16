import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ItemFormValues } from '@/components/item/ItemForm'
import { ItemForm } from '@/components/item/ItemForm'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { useDeleteItem, useItem, useUpdateItem } from '@/hooks'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useItemLayout } from '@/hooks/useItemLayout'
import type { Item, PantryItem } from '@/types'

export const Route = createFileRoute('/items/$id/')({
  component: ItemInfoTab,
})

function itemToFormValues(item: PantryItem): ItemFormValues {
  return {
    packedQuantity: item.packedQuantity,
    unpackedQuantity: item.unpackedQuantity ?? 0,
    dueDate: item.dueDate
      ? (item.dueDate.toISOString().split('T')[0] ?? '')
      : '',
    estimatedDueDays: item.estimatedDueDays ?? '',
    name: item.name,
    wikidataUrl: item.wikidataUrl ?? '',
    note: item.note ?? '',
    packageUnit: item.packageUnit ?? '',
    measurementUnit: item.measurementUnit ?? '',
    amountPerPackage: item.amountPerPackage ?? '',
    targetUnit: item.targetUnit,
    targetQuantity: item.targetQuantity,
    refillThreshold: item.refillThreshold,
    consumeAmount: item.consumeAmount ?? 1,
    // Read explicit expirationMode; fall back to inference for items created
    // before this field was added (pre-migration existing data).
    expirationMode:
      item.expirationMode ??
      (item.estimatedDueDays != null
        ? 'days from purchase'
        : item.dueDate
          ? 'date'
          : 'disabled'),
    expirationThreshold: item.expirationThreshold ?? '',
  }
}

// A wider update type that allows explicit `undefined` for optional fields.
// Passing `undefined` tells Dexie (local) to clear those properties and
// tells toUpdateItemInput() (cloud) to send null so MongoDB clears them.
// We need a separate type here because `exactOptionalPropertyTypes: true`
// prevents assigning `undefined` to fields typed as `?: T` on `Partial<Item>`.
type ItemInfoUpdatePayload = Omit<Partial<Item>, 'wikidataUrl' | 'note'> & {
  wikidataUrl?: string | undefined
  note?: string | undefined
}

// Build the info-only update payload. Stock fields are persisted separately by
// the Stock tab and are intentionally not included here.
function buildInfoUpdates(values: ItemFormValues): ItemInfoUpdatePayload {
  return {
    name: values.name,
    // Assign undefined (not delete) so toUpdateItemInput() sees the key as
    // present and sends null to MongoDB — intentionally clearing the field
    // when the user leaves it blank.
    wikidataUrl: values.wikidataUrl.trim()
      ? values.wikidataUrl.trim()
      : undefined,
    note: values.note.trim() ? values.note : undefined,
  }
}

function ItemInfoTab() {
  const { t } = useTranslation()
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const { registerDirtyState } = useItemLayout()
  const { goBack } = useAppNavigation()
  const [savedAt, setSavedAt] = useState(0)

  if (!item) return null

  const formValues = itemToFormValues(item)

  const handleSubmit = async (values: ItemFormValues) => {
    // Cast to Partial<Item> — the wider payload type is compatible at runtime;
    // the cast is needed because exactOptionalPropertyTypes disallows undefined on Partial<Item>.
    await updateItem.mutateAsync({
      id,
      updates: buildInfoUpdates(values) as Partial<Item>,
    })
    setSavedAt((n) => n + 1)
    goBack()
  }

  const handleDelete = async () => {
    await deleteItem.mutateAsync({
      id: item.id,
      ...(item.vendorIds ? { vendorIds: item.vendorIds } : {}),
      ...(item.tagIds ? { tagIds: item.tagIds } : {}),
    })
    goBack()
  }

  return (
    <div className="p-4 pb-16 bg-background-elevated min-h-[100cqh]">
      <ItemForm
        initialValues={formValues}
        sections={['info']}
        onSubmit={handleSubmit}
        onDirtyChange={registerDirtyState}
        savedAt={savedAt}
        isPending={updateItem.isPending}
      />

      <div className="max-w-2xl mx-auto">
        <DeleteButton
          trigger="Delete"
          buttonClassName="w-full max-w-2xl mt-4"
          dialogTitle={t('items.detail.deleteDialog.title')}
          dialogDescription={t('items.detail.deleteDialog.description', {
            name: item.name,
          })}
          onDelete={handleDelete}
        />
      </div>
    </div>
  )
}
