import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { DeleteButton } from '@/components/DeleteButton'
import type { ItemFormValues } from '@/components/ItemForm'
import { ItemForm } from '@/components/ItemForm'
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

function buildUpdates(values: ItemFormValues): Partial<Item> {
  const updates: Partial<Item> = {
    packedQuantity: values.packedQuantity,
    unpackedQuantity: values.unpackedQuantity,
    name: values.name,
    targetUnit: values.targetUnit,
    targetQuantity: values.targetQuantity,
    refillThreshold: values.refillThreshold,
    consumeAmount: values.consumeAmount,
  }

  if (values.expirationMode === 'date' && values.dueDate) {
    updates.dueDate = new Date(values.dueDate)
    delete updates.estimatedDueDays
  } else if (values.expirationMode === 'days' && values.estimatedDueDays) {
    updates.estimatedDueDays = Number(values.estimatedDueDays)
    delete updates.dueDate
  } else {
    delete updates.dueDate
    delete updates.estimatedDueDays
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

  const handleSubmit = (values: ItemFormValues) => {
    updateItem.mutate(
      { id, updates: buildUpdates(values) },
      {
        onSuccess: () => {
          setSavedAt((n) => n + 1)
          goBack()
        },
      },
    )
  }

  const handleDelete = async () => {
    deleteItem.mutate(item.id, {
      onSuccess: () => goBack(),
    })
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
        trigger="Delete Item"
        buttonVariant="ghost"
        buttonClassName="text-destructive hover:bg-destructive/10 w-full mt-4"
        dialogTitle="Delete Item?"
        dialogDescription={
          <>
            Are you sure you want to delete <strong>{item.name}</strong>?
            <span className="block mt-2 text-sm text-muted-foreground">
              This will permanently remove this item and its history.
            </span>
          </>
        }
        onDelete={handleDelete}
      />
    </>
  )
}
