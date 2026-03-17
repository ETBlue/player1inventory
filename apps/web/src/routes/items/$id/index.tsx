import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { DeleteButton } from '@/components/DeleteButton'
import type { ItemFormValues } from '@/components/item/ItemForm'
import { ItemForm } from '@/components/item/ItemForm'
import { useDeleteItem, useItem, useUpdateItem } from '@/hooks'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useItemLayout } from '@/hooks/useItemLayout'
import type { Item } from '@/types'

export const Route = createFileRoute('/items/$id/')({
  component: ItemDetailTab,
})

function itemToFormValues(item: Item): ItemFormValues {
  return {
    packedQuantity: item.packedQuantity,
    unpackedQuantity: item.unpackedQuantity ?? 0,
    dueDate: item.dueDate
      ? (item.dueDate.toISOString().split('T')[0] ?? '')
      : '',
    estimatedDueDays: item.estimatedDueDays ?? '',
    name: item.name,
    packageUnit: item.packageUnit ?? '',
    measurementUnit: item.measurementUnit ?? '',
    amountPerPackage: item.amountPerPackage ?? '',
    targetUnit: item.targetUnit,
    targetQuantity: item.targetQuantity,
    refillThreshold: item.refillThreshold,
    consumeAmount: item.consumeAmount ?? 1,
    expirationMode: item.estimatedDueDays != null ? 'days' : 'date',
    expirationThreshold: item.expirationThreshold ?? '',
  }
}

// A wider update type that allows explicit `undefined` for optional expiration fields.
// Passing `undefined` tells Dexie to delete those properties from the stored record.
// We need a separate type here because `exactOptionalPropertyTypes: true` prevents assigning
// `undefined` to fields typed as `?: T` on `Partial<Item>`.
type ItemUpdatePayload = Omit<Partial<Item>, 'dueDate' | 'estimatedDueDays'> & {
  dueDate?: Date | undefined
  estimatedDueDays?: number | undefined
}

function buildUpdates(values: ItemFormValues): ItemUpdatePayload {
  const updates: ItemUpdatePayload = {
    packedQuantity: values.packedQuantity,
    unpackedQuantity: values.unpackedQuantity,
    name: values.name,
    targetUnit: values.targetUnit,
    targetQuantity: values.targetQuantity,
    refillThreshold: values.refillThreshold,
    consumeAmount: values.consumeAmount,
  }

  if (values.expirationMode === 'date') {
    // Explicitly set estimatedDueDays to undefined so Dexie removes the field from the record.
    // Without this, switching from "days" to "date" mode leaves estimatedDueDays in the DB,
    // causing itemToFormValues to re-infer the mode as 'days' on reload.
    updates.estimatedDueDays = undefined
    updates.dueDate = values.dueDate ? new Date(values.dueDate) : undefined
  } else if (values.expirationMode === 'days') {
    // Explicitly set dueDate to undefined so Dexie removes the field from the record.
    updates.dueDate = undefined
    updates.estimatedDueDays = values.estimatedDueDays
      ? Number(values.estimatedDueDays)
      : undefined
  } else {
    updates.dueDate = undefined
    updates.estimatedDueDays = undefined
  }

  if (values.packageUnit) {
    updates.packageUnit = values.packageUnit
  } else {
    delete updates.packageUnit
  }
  if (values.measurementUnit) {
    updates.measurementUnit = values.measurementUnit
  } else {
    delete updates.measurementUnit
  }
  if (values.amountPerPackage) {
    updates.amountPerPackage = Number(values.amountPerPackage)
  } else {
    delete updates.amountPerPackage
  }
  if (values.expirationThreshold) {
    updates.expirationThreshold = Number(values.expirationThreshold)
  } else {
    delete updates.expirationThreshold
  }

  return updates
}

function ItemDetailTab() {
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
    // Cast to Partial<Item> — the wider ItemUpdatePayload type is compatible at runtime;
    // the cast is needed because exactOptionalPropertyTypes disallows undefined on Partial<Item>.
    await updateItem.mutateAsync({
      id,
      updates: buildUpdates(values) as Partial<Item>,
    })
    setSavedAt((n) => n + 1)
    goBack()
  }

  const handleDelete = async () => {
    await deleteItem.mutateAsync(item.id)
    goBack()
  }

  return (
    <>
      <ItemForm
        initialValues={formValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={handleSubmit}
        onDirtyChange={registerDirtyState}
        savedAt={savedAt}
      />

      <DeleteButton
        trigger="Delete"
        buttonClassName="w-full max-w-2xl mt-4"
        dialogTitle="Delete Item?"
        dialogDescription={
          <>
            Are you sure you want to delete <strong>{item.name}</strong>? This
            will permanently remove this item and its history.
          </>
        }
        onDelete={handleDelete}
      />
    </>
  )
}
